"""
backend/platform/services/policy_engine.py
==========================================
Security Policy Engine applying organization-specific rules and escalation
on top of Member 1's RiskDecision.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from backend.pipeline.risk_engine import RiskDecision
from backend.platform.db.models import ProtectedIdentity, SecurityPolicy
from backend.platform.services.ai_adapter import ProcessedChunkTelemetry
from backend.utils.logger import get_logger

log = get_logger(__name__)

# Sensitive intents that amplify impersonation risk
SENSITIVE_INTENTS = {
    "OTP_REQUEST",
    "PAYMENT_TRANSFER",
    "CREDENTIAL_REQUEST",
    "URGENT_REQUEST",
}


@dataclass
class PolicyEvaluationResult:
    """Outcome of evaluating organizational security policy on an AI telemetry chunk."""
    risk_score: float
    risk_level: str  # SAFE, LOW, MEDIUM, HIGH, CRITICAL
    recommended_action: str
    scenario: str
    reasons: List[str] = field(default_factory=list)
    should_warn_user: bool = False
    should_alert_org: bool = False
    should_create_incident: bool = False
    is_blocked: bool = False
    warning_message: Optional[str] = None


class PolicyEngine:
    """Evaluates organization security policies and determines operational alerts."""

    def evaluate(
        self,
        telemetry: ProcessedChunkTelemetry,
        protected_identity: Optional[ProtectedIdentity] = None,
        policy: Optional[SecurityPolicy] = None,
    ) -> PolicyEvaluationResult:
        """
        Synthesize Member 1's RiskDecision with organization-specific policies.

        Key Demonstrations:
          1. CFO Impersonation:
             AI voice clone + protected executive -> CRITICAL severity + instant alerts.
          2. Social Engineering:
             Sensitive intent (OTP extraction, wire transfer) -> strengthens severity.
        """
        base_decision = telemetry.risk_decision
        risk_score = float(base_decision.risk_score)
        risk_level = str(base_decision.risk_level)
        recommended_action = str(base_decision.recommended_action)
        scenario = str(base_decision.scenario)
        reasons = list(base_decision.reasons)

        # ── 1. Fast Alert Escalation from Member 1 ─────────────────────────
        if telemetry.is_alert:
            risk_score = max(risk_score, 90.0)
            risk_level = "CRITICAL"
            recommended_action = "BLOCK_OR_ESCALATE"
            if telemetry.alert_reason and telemetry.alert_reason not in reasons:
                reasons.insert(0, telemetry.alert_reason)

        # ── 2. Protected Executive VIP Rules ──────────────────────────────
        if protected_identity:
            vip_title = protected_identity.title or "Executive"
            vip_name = protected_identity.full_name

            if telemetry.verdict == "cloned":
                risk_score = max(risk_score, 95.0)
                risk_level = "CRITICAL"
                recommended_action = "BLOCK_OR_ESCALATE"
                scenario = "AI_CLONE_ENROLLED_SPEAKER"
                reasons.insert(
                    0,
                    f"CRITICAL: High-confidence voice clone impersonating protected {vip_title} ({vip_name})!",
                )
            elif telemetry.verdict == "imposter":
                risk_score = max(risk_score, 80.0)
                risk_level = "HIGH"
                recommended_action = "REQUIRE_ADDITIONAL_VERIFICATION"
                scenario = "DIFFERENT_GENUINE_SPEAKER"
                reasons.insert(
                    0,
                    f"HIGH: Speaker voice mismatch against enrolled biometric profile of {vip_title} ({vip_name}).",
                )

        # ── 3. Sensitive Intent & Social Engineering Amplification ────────
        intent = telemetry.intent
        if intent in SENSITIVE_INTENTS:
            intent_label = intent.replace("_", " ").title()
            if telemetry.verdict in ("cloned", "imposter") or risk_level in ("HIGH", "CRITICAL"):
                risk_score = min(100.0, risk_score + 15.0)
                risk_level = "CRITICAL"
                recommended_action = "BLOCK_OR_ESCALATE"
                reasons.append(
                    f"SOCIAL ENGINEERING ALERT: Fraudulent {intent_label} requested during suspicious voice call."
                )
            elif risk_level == "MEDIUM":
                risk_score = min(100.0, risk_score + 10.0)
                risk_level = "HIGH"
                recommended_action = "REQUIRE_ADDITIONAL_VERIFICATION"
                reasons.append(
                    f"SUSPICIOUS CONTEXT: {intent_label} requested before speaker identity is verified."
                )

        # ── 4. Determine Alert Dispatch Flags ──────────────────────────────
        should_warn_user = False
        should_alert_org = False
        should_create_incident = False
        is_blocked = False
        warning_message = None

        if risk_level in ("HIGH", "CRITICAL"):
            should_warn_user = True
            should_alert_org = True
            should_create_incident = True

            if risk_level == "CRITICAL":
                if protected_identity and scenario == "AI_CLONE_ENROLLED_SPEAKER":
                    warning_message = (
                        f"🚨 CRITICAL SECURITY WARNING: Potential AI Voice Clone Impersonation of {vip_name} Detected! "
                        "Do NOT share passwords, OTPs, or transfer funds."
                    )
                elif scenario == "UNKNOWN_AI_VOICE":
                    warning_message = (
                        "🚨 CRITICAL SECURITY WARNING: Synthetic Speech with Suspicious Intent Detected from Unverified Caller! "
                        "Do NOT share OTPs, credentials, or transfer funds."
                    )
                else:
                    warning_message = (
                        "🚨 CRITICAL SECURITY WARNING: Severe Voice Anomaly or Coercive Intent Detected! "
                        "Do NOT share sensitive information."
                    )
                if policy and policy.to_dict().get("policy_config", {}).get("auto_block_on_critical_clone", False):
                    is_blocked = True
            else:
                if protected_identity and scenario == "DIFFERENT_GENUINE_SPEAKER":
                    warning_message = (
                        f"⚠️ IDENTITY MISMATCH: Caller voice does NOT match enrolled biometric profile of {vip_name}. "
                        "Potential human imposter. Exercise caution."
                    )
                else:
                    warning_message = (
                        "⚠️ SECURITY WARNING: Suspicious voice activity or unverified caller identity. "
                        "Exercise caution and verify caller identity."
                    )

        return PolicyEvaluationResult(
            risk_score=risk_score,
            risk_level=risk_level,
            recommended_action=recommended_action,
            scenario=scenario,
            reasons=reasons,
            should_warn_user=should_warn_user,
            should_alert_org=should_alert_org,
            should_create_incident=should_create_incident,
            is_blocked=is_blocked,
            warning_message=warning_message,
        )
