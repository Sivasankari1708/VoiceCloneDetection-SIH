# API Reference: Security Actions

This document details the REST API endpoints used by Security Operators to execute mitigations, triage decisions, and investigative actions on detected voice clone incidents.

---

## 1. Execute Security Action

- **Path**: `POST /api/incidents/{incident_id}/action`
- **Authentication**: Bearer JWT (Header: `Authorization: Bearer <token>`)
- **Required Role**: `SECURITY_OPERATOR` or `ADMIN`
- **Rate Limit / Timeout**: Standard HTTP timeout (default 30s)
- **Source File**: [`backend/platform/server/routes/incidents.py`](file:///Users/dhurgadevi/Documents/GitHub/VoiceCloneDetection-SIH/backend/platform/server/routes/incidents.py#L72-L103)
- **Controller Function**: `take_security_action(incident_id, req, user, db)`

### Request Parameters

- **Path Parameter**:
  - `incident_id` (string, required): The UUID of the target security incident.
- **Request Body** (`IncidentActionRequest`):
  ```json
  {
    "action_type": "BLOCK_CALL",
    "notes": "Verified fraudulent CFO clone requesting urgent wire transfer."
  }
  ```

### Supported Action Types

| Action Type | Target Status | Description | System Effect |
| :--- | :--- | :--- | :--- |
| `CONFIRM_ATTACK` | `CONFIRMED_ATTACK` | Operator confirms voice clone attack | Updates incident status; creates audit event |
| `FALSE_POSITIVE` | `FALSE_POSITIVE` | Operator marks incident as legitimate voice | Marks resolved; updates incident status |
| `ESCALATE` | `UNDER_REVIEW` | Escalates to tier-2 SOC or senior analyst | Records escalation note in incident history |
| `RESOLVE` | `RESOLVED` | Concludes active incident investigation | Sets `resolved_at = utcnow()` |
| `BLOCK_CALL` | `CONFIRMED_ATTACK` | Immediately halts suspicious active call | Sends `SECURITY_ACTION_DISPATCHED` to session WS; closes WS |
| `REQUIRE_ADDITIONAL_VERIFICATION` | `UNDER_REVIEW` | Prompts employee for out-of-band verification | Logs action; notifies session channel |
| `DISMISS` | `RESOLVED` | Dismisses benign anomaly | Sets `resolved_at = utcnow()` |

### Response Schema (`SecurityActionDto`)

- **Status Code**: `200 OK`
- **Payload**:
  ```json
  {
    "action_id": "act-5a3d9021-954a-4f51-b844-019914757c2a",
    "incident_id": "inc-8b42f638-3482-4aa4-82a1-e408ec25fbe3",
    "action_type": "BLOCK_CALL",
    "actor_user_id": "usr-00000000-0000-0000-0000-000000000002",
    "actor_email": "operator@shieldcorp.com",
    "notes": "Verified fraudulent CFO clone requesting urgent wire transfer.",
    "applied_at": "2026-09-05T07:35:12.458921Z"
  }
  ```

### Error Responses

- `401 Unauthorized`: Missing, expired, or malformed JWT token.
- `403 Forbidden`: Authenticated user does not possess `SECURITY_OPERATOR` or `ADMIN` role, or attempts cross-tenant execution.
- `404 Not Found`: `incident_id` does not exist in the caller's organization.

---

## 2. Audit Trail Integration

Whenever an operator executes `POST /api/incidents/{incident_id}/action`:
1. A new record is inserted into `security_actions` linked to `incident_id`.
2. The `security_incidents` record status is updated.
3. If `action_type == "BLOCK_CALL"`, the orchestrator marks the associated `call_sessions` row as `status = "BLOCKED"` and issues a forceful close on the active WebSocket stream.
4. An immutable event `SECURITY_ACTION_TAKEN` is appended to `audit_logs`.

---

## 3. Automated Test Traceability

- Unit and Integration Test: [`backend/platform/tests/test_api_incidents.py`](file:///Users/dhurgadevi/Documents/GitHub/VoiceCloneDetection-SIH/backend/platform/tests/test_api_incidents.py)
- Live Verification: Check 10 of 11-point live validation verified `BLOCK_CALL` termination and state transition on `http://localhost:8000`.
