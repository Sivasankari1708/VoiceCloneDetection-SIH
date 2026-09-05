# Incident Deduplication: Session-Aware Aggregation

## 1. Problem Statement

In real-time telephony, a call consists of a continuous stream of audio chunks (e.g. 1 chunk per second). If an attacker speaks using a voice-cloning tool for 20 seconds, 20 consecutive chunks will produce high synthetic probabilities.
Without deduplication, the system would open 20 separate incidents in the SOC database, fragmenting evidence and overwhelming security operators.

---

## 2. Session-Aware Deduplication Algorithm

Implemented in `SecurityOrchestrator._persist_and_dispatch()` (`backend/platform/services/orchestrator.py`):

```python
# 1. Check for existing active incident on this session
active_incident = (
    self.db.query(SecurityIncident)
    .filter_by(session_id=session_id)
    .filter(SecurityIncident.status.in_(["OPEN", "UNDER_REVIEW"]))
    .first()
)

if active_incident:
    # 2. Update existing incident rather than creating duplicate
    active_incident.current_risk_score = policy_eval.risk_score
    active_incident.severity = policy_eval.risk_level
    active_incident.synthetic_probability = telemetry.raw_synthetic_prob
    active_incident.speaker_similarity = telemetry.raw_speaker_sim
    active_incident.reasons_json = json.dumps(policy_eval.reasons)
    active_incident.recommended_action = policy_eval.recommended_action
    active_incident.intent = telemetry.intent
    active_incident.updated_at = utcnow()
else:
    # 3. Open single authoritative incident
    active_incident = SecurityIncident(
        org_id=org_id,
        session_id=session_id,
        severity=policy_eval.risk_level,
        scenario=policy_eval.scenario,
        claimed_identity=call.claimed_speaker_id,
        current_risk_score=policy_eval.risk_score,
        synthetic_probability=telemetry.raw_synthetic_prob,
        speaker_similarity=telemetry.raw_speaker_sim,
        intent=telemetry.intent,
        reasons_json=json.dumps(policy_eval.reasons),
        recommended_action=policy_eval.recommended_action,
        status="OPEN",
    )
    self.db.add(active_incident)
```

---

## 3. Guarantees & Verification
- **One Incident Per Attack Session**: Multiple threatening chunks coalesce into a single evolving case file.
- **Dynamic Evidence Evolution**: If an attacker starts speaking normally and then demands an OTP or wire transfer, the incident's `intent` and `reasons_json` automatically update in real time.
- **Automated Test Validation**: Genuinely verified in `backend/platform/tests/test_orchestrator.py::test_incident_creation_and_deduplication`.

---

## 4. Source Files Covered
- `backend/platform/services/orchestrator.py`
- `backend/platform/db/models.py`
