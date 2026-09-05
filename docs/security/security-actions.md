# Security Actions: Mitigation Workflow & Simulated Controls

## 1. Supported Security Actions

Defined in `SecurityActionType` (`backend/platform/db/models.py`):

| Action Type | Trigger / Purpose | Call State Effect | Incident State Effect | Socket Event Emitted | Real vs Simulated |
|---|---|---|---|---|---|
| `ALLOW` | Benign speech | Continues | No incident | None | Real |
| `WARN_USER` | Suspicious speech | Continues | Incident opened | `USER_SECURITY_ALERT` | Real |
| `VERIFY_SPEAKER` | Inconclusive acoustics | Continues | Caution flag | `RISK_UPDATE` | Real |
| `REQUIRE_ADDITIONAL_VERIFICATION` | Mismatch on sensitive intent | Continues | `UNDER_REVIEW` | `SECURITY_ACTION` | Real |
| `ESCALATE` | Urgent incident review | Continues | `UNDER_REVIEW` | `SECURITY_ACTION` | Real |
| `CONFIRM_ATTACK` | Operator verifies clone | Continues | `CONFIRMED_ATTACK` | `SECURITY_ACTION` | Real |
| `FALSE_POSITIVE` | Operator determines benign | Continues | `FALSE_POSITIVE` | `SECURITY_ACTION` | Real |
| `RESOLVE` | Case investigation closed | Continues | `RESOLVED` | `SECURITY_ACTION` | Real |
| `BLOCK_CALL` | Immediate threat mitigation | **`TERMINATED_BY_SECURITY`** | `CONFIRMED_ATTACK` | **`CALL_ENDED`** | **Simulated Telecom** |

---

## 2. Technical Implementation of `BLOCK_CALL`

When an operator posts `{"action_type": "BLOCK_CALL"}`:

```python
if action_type == "BLOCK_CALL":
    log.warning("[Orchestrator] Terminating call session '%s' due to operator BLOCK_CALL action", incident.session_id)
    await self.end_call_session(incident.session_id, reason="BLOCKED_BY_SECURITY_OPERATOR")
    incident.status = "CONFIRMED_ATTACK"
```

### What Happens in the Prototype:
1. `CallSession.status` changes to `"TERMINATED_BY_SECURITY"`.
2. The caller's WebSocket receives a `CALL_ENDED` frame with `reason="BLOCKED_BY_SECURITY_OPERATOR"`.
3. The call socket is closed.
4. An immutable `AuditLog` row records the security intervention.

### Important Prototype Boundary:
The prototype implements **application-level simulated call blocking**. It terminates the active browser WebSocket stream and updates database states. It does **not** send SS7/ISUP drop signals to cellular carriers or execute SIP `BYE` requests to a physical telecommunications PBX.

---

## 3. Source Files Covered
- `backend/platform/services/orchestrator.py`
- `backend/platform/server/routes/incidents.py`
- `backend/platform/db/models.py`
- `backend/platform/schemas/incidents.py`
