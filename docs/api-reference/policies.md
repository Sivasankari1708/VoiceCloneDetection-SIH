# API Reference: Security Policies

This document describes the REST API endpoints used to inspect and update organization security policies, detection thresholds, and automated defense rules.

---

## 1. Retrieve Organization Policy

- **Path**: `GET /api/policies`
- **Authentication**: Bearer JWT (Header: `Authorization: Bearer <token>`)
- **Required Role**: Any authenticated role (`USER`, `SECURITY_OPERATOR`, `ADMIN`)
- **Source File**: [`backend/platform/server/routes/policies.py`](file:///Users/dhurgadevi/Documents/GitHub/VoiceCloneDetection-SIH/backend/platform/server/routes/policies.py#L21-L50)
- **Controller Function**: `get_policy(user, db)`

### Response Schema (`SecurityPolicyDto`)

- **Status Code**: `200 OK`
- **Response Format**:
  ```json
  {
    "org_id": "org-00000000-0000-0000-0000-000000000001",
    "risk_score_high_threshold": 65.0,
    "risk_score_critical_threshold": 85.0,
    "auto_warn_user_on_high": true,
    "auto_alert_org_on_high": true,
    "auto_block_on_critical_clone": false,
    "enforce_protected_vip_rules": true,
    "sensitive_intent_escalation": true,
    "custom_rules": {},
    "updated_at": "2026-09-05T06:00:00Z"
  }
  ```

---

## 2. Update Organization Policy

- **Path**: `PUT /api/policies`
- **Authentication**: Bearer JWT (Header: `Authorization: Bearer <token>`)
- **Required Role**: `ADMIN` only
- **Source File**: [`backend/platform/server/routes/policies.py`](file:///Users/dhurgadevi/Documents/GitHub/VoiceCloneDetection-SIH/backend/platform/server/routes/policies.py#L52-L103)
- **Controller Function**: `update_policy(req, user, db)`

### Request Schema (`PolicyUpdateDto`)

```json
{
  "risk_score_high_threshold": 70.0,
  "risk_score_critical_threshold": 90.0,
  "auto_warn_user_on_high": true,
  "auto_alert_org_on_high": true,
  "auto_block_on_critical_clone": true,
  "enforce_protected_vip_rules": true,
  "sensitive_intent_escalation": true,
  "custom_rules": {
    "block_international_callers": true
  }
}
```

All fields are optional in `PolicyUpdateDto`. Any supplied field updates the JSON configuration stored in the `security_policies` table.

### Response Schema (`SecurityPolicyDto`)

- **Status Code**: `200 OK`
- Returns the updated `SecurityPolicyDto` reflecting the new configuration and timestamp.

### Errors

- `401 Unauthorized`: Token missing or invalid.
- `403 Forbidden`: User role is `USER` or `SECURITY_OPERATOR` (must be `ADMIN`).

---

## 3. Enforcement & Policy Application

When audio frames are processed by `SecurityOrchestrator`:
1. The orchestrator calls `PolicyEngine.evaluate(...)` passing the active policy settings for `user.org_id`.
2. If `risk_score >= risk_score_critical_threshold`, risk severity is labeled `CRITICAL`.
3. If `enforce_protected_vip_rules == true` and the caller claims a protected VIP identity with high synthetic probability, severity is escalated to `CRITICAL`.
4. If `sensitive_intent_escalation == true` and an intent such as `OTP_REQUEST` or `PAYMENT_TRANSFER` is recognized, the risk score is bumped by +25 and re-evaluated.

---

## 4. Test Traceability

- Automated Tests: [`backend/platform/tests/test_policy_engine.py`](file:///Users/dhurgadevi/Documents/GitHub/VoiceCloneDetection-SIH/backend/platform/tests/test_policy_engine.py)
