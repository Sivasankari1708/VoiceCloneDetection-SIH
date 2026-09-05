"""
backend/platform/services/orchestrator.py
=========================================
Central Security Orchestration Engine for Member 2.

Orchestrates the entire security lifecycle:
  Voice chunk -> AI Analysis -> Policy Decision -> User Warning + Org Alert -> Incident -> Operator Action -> Audit Log.

Key Invariants:
  - Zero modification to Member 1 code.
  - Organization isolation strictly enforced.
  - Single incident maintained per call session (deduplicated across audio chunks).
  - Synchronous / asynchronous dual-alert generation (User Warning AND Org SOC Alert).
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from backend.platform.db.models import (
    AuditLog,
    CallSession,
    ProtectedIdentity,
    RiskEvent,
    SecurityAction,
    SecurityIncident,
    SecurityPolicy,
    User,
    generate_uuid,
    utcnow,
)
from backend.platform.schemas.calls import CallSessionDto, CallSummaryDto
from backend.platform.schemas.events import (
    CallEndedPayload,
    CallStartedPayload,
    IncidentEventPayload,
    OrganizationSecurityAlertPayload,
    RiskUpdatePayload,
    SecurityActionPayload,
    UserSecurityAlertPayload,
    WebSocketEventType,
)
from backend.platform.services.ai_adapter import AIAdapter, ProcessedChunkTelemetry
from backend.platform.services.alert_dispatcher import AlertDispatcher
from backend.platform.services.policy_engine import PolicyEngine, PolicyEvaluationResult
from backend.utils.logger import get_logger

log = get_logger(__name__)


class SecurityOrchestrator:
    """Master Security Orchestrator coordinating AI inference, DB state, and real-time alerts."""

    def __init__(self, db: Session) -> None:
        self.db = db
        self.ai_adapter = AIAdapter.get_instance()
        self.policy_engine = PolicyEngine()
        self.dispatcher = AlertDispatcher.get_instance()

    # ── Call Session Lifecycle ──────────────────────────────────────────

    def start_call_session(
        self,
        org_id: str,
        session_id: Optional[str] = None,
        user_id: Optional[str] = None,
        caller_number: Optional[str] = None,
        caller_name: Optional[str] = None,
        claimed_speaker_id: Optional[str] = None,
    ) -> CallSession:
        """Start and persist a new call session."""
        sess_id = session_id or f"call_{generate_uuid()[:12]}"

        # Resolve claimed identity if speaker_id supplied
        claimed_id_record = None
        if claimed_speaker_id:
            claimed_id_record = self.db.query(ProtectedIdentity).filter_by(
                org_id=org_id, speaker_id=claimed_speaker_id
            ).first()

        call = CallSession(
            session_id=sess_id,
            org_id=org_id,
            user_id=user_id,
            caller_number=caller_number,
            caller_name=caller_name,
            claimed_identity_id=claimed_id_record.id if claimed_id_record else None,
            claimed_speaker_id=claimed_speaker_id,
            status="ACTIVE",
            start_time=utcnow(),
            current_risk_score=0.0,
            current_risk_level="SAFE",
            final_verdict="inconclusive",
        )
        self.db.add(call)

        # Record audit log
        audit = AuditLog(
            org_id=org_id,
            actor_id=user_id,
            session_id=sess_id,
            event_type="CALL_STARTED",
            details_json=json.dumps({
                "caller_number": caller_number,
                "caller_name": caller_name,
                "claimed_speaker_id": claimed_speaker_id,
            }),
        )
        self.db.add(audit)
        self.db.commit()

        # Initialize session in Member 1 streaming pipeline
        self.ai_adapter.start_session(sess_id, claimed_speaker_id=claimed_speaker_id)
        log.info("[Orchestrator] Started call session '%s' for org '%s' (claimed_speaker='%s')", sess_id, org_id, claimed_speaker_id)
        return call

    async def end_call_session(
        self,
        session_id: str,
        reason: str = "NORMAL_HANGUP",
        actor_id: Optional[str] = None,
    ) -> Optional[CallSummaryDto]:
        """End active call session, compute summary, and broadcast CALL_ENDED event."""
        call = self.db.query(CallSession).filter_by(session_id=session_id).first()
        if not call:
            log.warning("[Orchestrator] Call session '%s' not found for termination.", session_id)
            return None

        # End session in Member 1's pipeline
        summary = self.ai_adapter.end_session(session_id)

        call.status = "TERMINATED_BY_SECURITY" if "SECURITY" in reason.upper() else "ENDED"
        call.end_time = utcnow()
        call.final_verdict = summary.final_verdict
        call.accumulated_transcript = summary.accumulated_transcript
        call.alert_triggered = summary.alert_triggered
        if summary.alert_reason:
            call.alert_reason = summary.alert_reason

        audit = AuditLog(
            org_id=call.org_id,
            actor_id=actor_id,
            session_id=session_id,
            event_type="CALL_ENDED",
            details_json=json.dumps({
                "reason": reason,
                "total_chunks": call.total_chunks,
                "final_verdict": call.final_verdict,
                "final_risk_level": call.current_risk_level,
            }),
        )
        self.db.add(audit)
        self.db.commit()

        # Dispatch WebSocket event to active call socket
        ended_payload = CallEndedPayload(
            session_id=session_id,
            status=call.status,
            total_chunks=summary.total_chunks,
            total_audio_seconds=summary.total_audio_seconds,
            total_speech_seconds=summary.total_speech_seconds,
            final_risk_score=call.current_risk_score,
            final_risk_level=call.current_risk_level,
            final_verdict=call.final_verdict,
            alert_triggered=call.alert_triggered,
            accumulated_transcript=call.accumulated_transcript,
            timestamp=utcnow().isoformat(),
        )
        await self.dispatcher.send_to_call(
            session_id,
            {"event": WebSocketEventType.CALL_ENDED, "timestamp": utcnow().isoformat(), "data": ended_payload.model_dump()},
        )

        return CallSummaryDto(
            session_id=session_id,
            claimed_speaker_id=call.claimed_speaker_id,
            total_chunks=summary.total_chunks,
            total_audio_seconds=summary.total_audio_seconds,
            total_speech_seconds=summary.total_speech_seconds,
            mean_latency_ms=summary.mean_latency_ms,
            mean_rtf=summary.mean_rtf,
            final_verdict=summary.final_verdict,
            alert_triggered=summary.alert_triggered,
            alert_reason=summary.alert_reason,
            accumulated_transcript=summary.accumulated_transcript,
            final_risk_score=call.current_risk_score,
            final_risk_level=call.current_risk_level,
        )

    # ── Real-Time Streaming Audio Processing ────────────────────────────

    async def process_stream_chunk(
        self,
        session_id: str,
        chunk_data: Any,
        chunk_id: int,
    ) -> Dict[str, Any]:
        """
        Ingest audio chunk, run AI pipeline, apply policy, create/update incidents,
        and dispatch dual alerts (User Warning + Org SOC Alert).
        """
        call = self.db.query(CallSession).filter_by(session_id=session_id).first()
        if not call:
            raise ValueError(f"Call session '{session_id}' does not exist.")

        org_id = call.org_id

        # 1. AI Analysis via Member 1 adapter
        telemetry: ProcessedChunkTelemetry = self.ai_adapter.process_chunk(
            session_id=session_id,
            chunk_data=chunk_data,
            chunk_id=chunk_id,
            claimed_speaker_id=call.claimed_speaker_id,
        )

        # 2. Retrieve Protected Identity and Security Policy context
        protected_identity = None
        if call.claimed_speaker_id:
            protected_identity = self.db.query(ProtectedIdentity).filter_by(
                org_id=org_id, speaker_id=call.claimed_speaker_id
            ).first()

        policy = self.db.query(SecurityPolicy).filter_by(org_id=org_id).first()

        # 3. Apply Policy Engine
        policy_eval: PolicyEvaluationResult = self.policy_engine.evaluate(
            telemetry=telemetry,
            protected_identity=protected_identity,
            policy=policy,
        )

        # 4. Update Call Session in Database
        call.total_chunks += 1
        if telemetry.speech_detected:
            call.total_speech_seconds += (telemetry.latency_ms / 1000.0)
        call.current_risk_score = policy_eval.risk_score
        call.current_risk_level = policy_eval.risk_level
        call.final_verdict = telemetry.verdict
        call.accumulated_transcript = telemetry.accumulated_transcript
        if policy_eval.should_warn_user:
            call.alert_triggered = True
            call.alert_reason = policy_eval.warning_message

        # 5. Persist Risk Event in Database
        risk_event = RiskEvent(
            session_id=session_id,
            chunk_id=chunk_id,
            timestamp=utcnow(),
            speech_detected=telemetry.speech_detected,
            raw_synthetic_prob=telemetry.raw_synthetic_prob,
            smoothed_synthetic_prob=telemetry.smoothed_synthetic_prob,
            raw_speaker_sim=telemetry.raw_speaker_sim,
            smoothed_speaker_sim=telemetry.smoothed_speaker_sim,
            speaker_match=telemetry.speaker_match,
            transcript_chunk=telemetry.transcript,
            intent=telemetry.intent,
            intent_confidence=telemetry.intent_confidence,
            verdict=telemetry.verdict,
            risk_score=policy_eval.risk_score,
            risk_level=policy_eval.risk_level,
            recommended_action=policy_eval.recommended_action,
            is_alert=telemetry.is_alert or policy_eval.should_warn_user,
            alert_reason=policy_eval.warning_message or telemetry.alert_reason,
            latency_ms=telemetry.latency_ms,
            stage_timings_json=json.dumps(telemetry.stage_timings_ms),
        )
        self.db.add(risk_event)

        # 6. Session-Aware Incident Creation & Deduplication
        active_incident: Optional[SecurityIncident] = None
        if policy_eval.should_create_incident:
            # Query existing incident for this call session
            existing_incident = self.db.query(SecurityIncident).filter_by(
                session_id=session_id, org_id=org_id
            ).first()

            claimed_name = protected_identity.full_name if protected_identity else (call.caller_name or call.claimed_speaker_id)

            if existing_incident:
                # Update existing incident with latest highest risk score and evidence
                active_incident = existing_incident
                existing_incident.current_risk_score = max(existing_incident.current_risk_score, policy_eval.risk_score)
                existing_incident.severity = policy_eval.risk_level
                existing_incident.synthetic_probability = telemetry.smoothed_synthetic_prob or telemetry.raw_synthetic_prob
                existing_incident.speaker_similarity = telemetry.smoothed_speaker_sim or telemetry.raw_speaker_sim
                existing_incident.identity_status = telemetry.identity_status
                existing_incident.intent = telemetry.intent
                existing_incident.reasons_json = json.dumps(policy_eval.reasons)
                existing_incident.context_signals_json = json.dumps(telemetry.context_signals)
                existing_incident.recommended_action = policy_eval.recommended_action
                existing_incident.updated_at = utcnow()
                log.info("[Orchestrator] Updated existing incident '%s' for session '%s' (Risk=%.1f)", existing_incident.incident_id, session_id, existing_incident.current_risk_score)
            else:
                # Create brand new Security Incident
                active_incident = SecurityIncident(
                    org_id=org_id,
                    session_id=session_id,
                    severity=policy_eval.risk_level,
                    scenario=policy_eval.scenario,
                    claimed_identity=claimed_name,
                    current_risk_score=policy_eval.risk_score,
                    synthetic_probability=telemetry.smoothed_synthetic_prob or telemetry.raw_synthetic_prob,
                    speaker_similarity=telemetry.smoothed_speaker_sim or telemetry.raw_speaker_sim,
                    identity_status=telemetry.identity_status,
                    intent=telemetry.intent,
                    context_signals_json=json.dumps(telemetry.context_signals),
                    reasons_json=json.dumps(policy_eval.reasons),
                    recommended_action=policy_eval.recommended_action,
                    status="OPEN",
                )
                self.db.add(active_incident)

                # Record incident creation in audit log
                audit = AuditLog(
                    org_id=org_id,
                    session_id=session_id,
                    event_type="INCIDENT_CREATED",
                    details_json=json.dumps({
                        "incident_id": active_incident.incident_id,
                        "severity": active_incident.severity,
                        "scenario": active_incident.scenario,
                        "risk_score": active_incident.current_risk_score,
                    }),
                )
                self.db.add(audit)
                log.warning("[Orchestrator] Created new Security Incident '%s' for session '%s' (Severity=%s, Score=%.1f)", active_incident.incident_id, session_id, active_incident.severity, active_incident.current_risk_score)

        self.db.commit()

        # ── 7. Real-Time Alert Dispatch ─────────────────────────────────

        # A. USER SECURITY ALERT (to active caller recipient)
        if policy_eval.should_warn_user:
            user_alert = UserSecurityAlertPayload(
                session_id=session_id,
                severity=policy_eval.risk_level,
                risk_score=policy_eval.risk_score,
                warning_message=policy_eval.warning_message or "Security Warning: Voice cloning threat detected!",
                claimed_identity=call.claimed_speaker_id,
                reasons=policy_eval.reasons,
                recommended_action=policy_eval.recommended_action,
                timestamp=utcnow().isoformat(),
            )
            await self.dispatcher.send_to_call(
                session_id,
                {
                    "event": WebSocketEventType.USER_SECURITY_ALERT,
                    "timestamp": utcnow().isoformat(),
                    "data": user_alert.model_dump(),
                },
            )

        # B. ORGANIZATION SECURITY ALERT (to organization SOC console)
        if policy_eval.should_alert_org and active_incident:
            org_alert = OrganizationSecurityAlertPayload(
                incident_id=active_incident.incident_id,
                org_id=org_id,
                session_id=session_id,
                severity=active_incident.severity,
                scenario=active_incident.scenario,
                risk_score=active_incident.current_risk_score,
                claimed_identity=active_incident.claimed_identity,
                synthetic_probability=active_incident.synthetic_probability,
                speaker_similarity=active_incident.speaker_similarity,
                intent=active_incident.intent,
                reasons=json.loads(active_incident.reasons_json),
                recommended_action=active_incident.recommended_action,
                timestamp=utcnow().isoformat(),
            )
            await self.dispatcher.send_to_org(
                org_id,
                {
                    "event": WebSocketEventType.ORGANIZATION_SECURITY_ALERT,
                    "timestamp": utcnow().isoformat(),
                    "data": org_alert.model_dump(),
                },
            )

        # C. PER-CHUNK RISK UPDATE (to active call socket)
        risk_update = RiskUpdatePayload(
            session_id=session_id,
            chunk_id=chunk_id,
            timestamp=utcnow().isoformat(),
            speech_detected=telemetry.speech_detected,
            risk_score=policy_eval.risk_score,
            risk_level=policy_eval.risk_level,
            synthetic_probability=telemetry.raw_synthetic_prob,
            smoothed_synthetic_probability=telemetry.smoothed_synthetic_prob,
            speaker_similarity=telemetry.raw_speaker_sim,
            smoothed_speaker_similarity=telemetry.smoothed_speaker_sim,
            identity_status=telemetry.identity_status,
            speaker_match=telemetry.speaker_match,
            transcript=telemetry.transcript,
            accumulated_transcript=telemetry.accumulated_transcript,
            intent=telemetry.intent,
            intent_confidence=telemetry.intent_confidence,
            context_signals=telemetry.context_signals,
            verdict=telemetry.verdict,
            reasons=policy_eval.reasons,
            recommended_action=policy_eval.recommended_action,
            is_alert=telemetry.is_alert or policy_eval.should_warn_user,
            alert_reason=policy_eval.warning_message or telemetry.alert_reason,
            latency_ms=telemetry.latency_ms,
            real_time_factor=telemetry.real_time_factor,
        )
        await self.dispatcher.send_to_call(
            session_id,
            {
                "event": WebSocketEventType.RISK_UPDATE,
                "timestamp": utcnow().isoformat(),
                "data": risk_update.model_dump(),
            },
        )

        # D. Automated Call Block if policy dictates
        if policy_eval.is_blocked:
            log.warning("[Orchestrator] Auto-blocking call '%s' due to CRITICAL security policy!", session_id)
            await self.end_call_session(session_id, reason="BLOCKED_BY_CRITICAL_SECURITY_POLICY")

        return risk_update.model_dump()

    # ── Operator Investigation & Mitigation Actions ────────────────────

    async def execute_operator_action(
        self,
        incident_id: str,
        action_type: str,
        actor: User,
        notes: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Execute simulated security response action.
        Allowed actions:
          - CONFIRM_ATTACK
          - FALSE_POSITIVE
          - ESCALATE
          - RESOLVE
          - BLOCK_CALL
          - REQUIRE_ADDITIONAL_VERIFICATION
          - DISMISS
        """
        incident = self.db.query(SecurityIncident).filter_by(incident_id=incident_id).first()
        if not incident:
            raise ValueError(f"Security incident '{incident_id}' not found.")

        # Multi-tenant organization check
        if actor.role != "ADMIN" and incident.org_id != actor.org_id:
            raise PermissionError("Access denied: Incident belongs to another organization.")

        # Record Security Action
        action = SecurityAction(
            incident_id=incident_id,
            session_id=incident.session_id,
            action_type=action_type,
            actor_id=actor.id,
            status="COMPLETED",
            notes=notes,
            timestamp=utcnow(),
        )
        self.db.add(action)

        # Update Incident Status according to action
        if action_type == "CONFIRM_ATTACK":
            incident.status = "CONFIRMED_ATTACK"
        elif action_type == "FALSE_POSITIVE":
            incident.status = "FALSE_POSITIVE"
            incident.resolved_at = utcnow()
        elif action_type in ("RESOLVE", "DISMISS"):
            incident.status = "RESOLVED"
            incident.resolved_at = utcnow()
        elif action_type == "ESCALATE":
            incident.status = "UNDER_REVIEW"
        elif action_type == "BLOCK_CALL":
            incident.status = "CONFIRMED_ATTACK"
            # Terminate the underlying call session if active
            await self.end_call_session(
                session_id=incident.session_id,
                reason="TERMINATED_BY_SECURITY_OPERATOR",
                actor_id=actor.id,
            )

        if notes:
            incident.operator_notes = (
                f"{incident.operator_notes}\n[{utcnow().isoformat()}] {actor.username}: {notes}"
                if incident.operator_notes
                else f"[{utcnow().isoformat()}] {actor.username}: {notes}"
            )
        incident.operator_id = actor.id
        incident.updated_at = utcnow()

        # Audit log
        audit = AuditLog(
            org_id=incident.org_id,
            actor_id=actor.id,
            session_id=incident.session_id,
            event_type="SECURITY_ACTION_TAKEN",
            details_json=json.dumps({
                "incident_id": incident_id,
                "action_type": action_type,
                "new_status": incident.status,
                "notes": notes,
            }),
        )
        self.db.add(audit)
        self.db.commit()

        # Broadcast action & incident update to organization SOC dashboard
        action_payload = SecurityActionPayload(
            action_id=action.action_id,
            incident_id=incident_id,
            session_id=incident.session_id,
            action_type=action_type,
            actor_id=actor.id,
            status="COMPLETED",
            notes=notes,
            timestamp=utcnow().isoformat(),
        )
        await self.dispatcher.send_to_org(
            incident.org_id,
            {
                "event": WebSocketEventType.SECURITY_ACTION,
                "timestamp": utcnow().isoformat(),
                "data": action_payload.model_dump(),
            },
        )

        incident_update_payload = IncidentEventPayload(
            incident_id=incident.incident_id,
            org_id=incident.org_id,
            session_id=incident.session_id,
            severity=incident.severity,
            scenario=incident.scenario,
            status=incident.status,
            risk_score=incident.current_risk_score,
            claimed_identity=incident.claimed_identity,
            intent=incident.intent,
            reasons=json.loads(incident.reasons_json) if incident.reasons_json else [],
            recommended_action=incident.recommended_action,
            timestamp=utcnow().isoformat(),
        )
        await self.dispatcher.send_to_org(
            incident.org_id,
            {
                "event": WebSocketEventType.INCIDENT_UPDATED,
                "timestamp": utcnow().isoformat(),
                "data": incident_update_payload.model_dump(),
            },
        )

        return action.to_dict()
