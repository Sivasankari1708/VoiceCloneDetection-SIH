# API Reference: Audit Logs

This document describes the forensic audit log retrieval API used by compliance officers, auditors, and security operators to inspect the immutable historical log of security events.

---

## 1. List Forensic Audit Logs

- **Path**: `GET /api/audit-logs`
- **Authentication**: Bearer JWT (Header: `Authorization: Bearer <token>`)
- **Required Role**: `SECURITY_OPERATOR` or `ADMIN`
- **Source File**: [`backend/platform/server/routes/audit.py`](file:///Users/dhurgadevi/Documents/GitHub/VoiceCloneDetection-SIH/backend/platform/server/routes/audit.py#L22-L39)
- **Controller Function**: `list_audit_logs(session_id, event_type, limit, offset, user, db)`

### Query Parameters

| Parameter | Type | Required | Default | Description |
| :--- | :--- | :--- | :--- | :--- |
| `session_id` | `string` | No | `None` | Filter events by specific call session UUID |
| `event_type` | `string` | No | `None` | Filter by event type (`CALL_STARTED`, `INCIDENT_CREATED`, etc.) |
| `limit` | `integer` | No | `50` | Number of records to return (min: 1, max: 200) |
| `offset` | `integer` | No | `0` | Offset for pagination |

### Response Schema (`List[AuditLogDto]`)

- **Status Code**: `200 OK`
- **Response Format**:
  ```json
  [
    {
      "log_id": "aud-10928374-1234-5678-abcd-ef0123456789",
      "org_id": "org-00000000-0000-0000-0000-000000000001",
      "session_id": "call-18392193-4921-4f12-b539-712839102938",
      "event_type": "CALL_STARTED",
      "actor_user_id": "usr-00000000-0000-0000-0000-000000000001",
      "actor_role": "USER",
      "details_json": "{\"caller_claimed_id\": \"LA_0069\", \"session_status\": \"ACTIVE\"}",
      "ip_address": null,
      "timestamp": "2026-09-05T07:30:00.123456Z"
    },
    {
      "log_id": "aud-20928374-1234-5678-abcd-ef0123456789",
      "org_id": "org-00000000-0000-0000-0000-000000000001",
      "session_id": "call-18392193-4921-4f12-b539-712839102938",
      "event_type": "INCIDENT_CREATED",
      "actor_user_id": null,
      "actor_role": null,
      "details_json": "{\"incident_id\": \"inc-8b42f638-3482-4aa4-82a1-e408ec25fbe3\", \"risk_score\": 98.5, \"severity\": \"CRITICAL\"}",
      "ip_address": null,
      "timestamp": "2026-09-05T07:30:15.654321Z"
    },
    {
      "log_id": "aud-30928374-1234-5678-abcd-ef0123456789",
      "org_id": "org-00000000-0000-0000-0000-000000000001",
      "session_id": "call-18392193-4921-4f12-b539-712839102938",
      "event_type": "SECURITY_ACTION_TAKEN",
      "actor_user_id": "usr-00000000-0000-0000-0000-000000000002",
      "actor_role": "SECURITY_OPERATOR",
      "details_json": "{\"action_type\": \"BLOCK_CALL\", \"incident_id\": \"inc-8b42f638-3482-4aa4-82a1-e408ec25fbe3\"}",
      "ip_address": null,
      "timestamp": "2026-09-05T07:30:30.987654Z"
    },
    {
      "log_id": "aud-40928374-1234-5678-abcd-ef0123456789",
      "org_id": "org-00000000-0000-0000-0000-000000000001",
      "session_id": "call-18392193-4921-4f12-b539-712839102938",
      "event_type": "CALL_ENDED",
      "actor_user_id": "usr-00000000-0000-0000-0000-000000000001",
      "actor_role": "USER",
      "details_json": "{\"final_verdict\": \"cloned\", \"duration_seconds\": 35.2}",
      "ip_address": null,
      "timestamp": "2026-09-05T07:30:35.321098Z"
    }
  ]
  ```

---

## 2. Canonical Audit Event Chain

During live validation on `http://localhost:8000`, the complete end-to-end attack simulation produced this exact 4-event sequence in temporal order:

```
[1] CALL_STARTED ──> [2] INCIDENT_CREATED ──> [3] SECURITY_ACTION_TAKEN ──> [4] CALL_ENDED
```

### Event Descriptions

- `CALL_STARTED`: Generated when `/api/calls` registers a new monitored call session.
- `INCIDENT_CREATED`: Emitted when the Security Orchestrator flags a synthetic voice crossing high/critical policy thresholds.
- `SECURITY_ACTION_TAKEN`: Logged when an operator triggers a response via `/api/incidents/{id}/action`.
- `CALL_ENDED`: Generated when the WebSocket disconnects or call termination is finalized.

---

## 3. Multi-Tenant Isolation

The controller automatically applies:
```python
query = db.query(AuditLog).filter_by(org_id=user.org_id)
```
Operators cannot query or view audit trails from other tenant organizations.

---

## 4. Test & Verification Traceability

- Test Suite: [`backend/platform/tests/test_audit_logging.py`](file:///Users/dhurgadevi/Documents/GitHub/VoiceCloneDetection-SIH/backend/platform/tests/test_audit_logging.py)
- Live Validation Check 11: Verified immutable audit trail querying on running local server.
