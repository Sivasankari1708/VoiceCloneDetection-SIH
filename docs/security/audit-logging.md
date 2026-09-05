# Audit Logging: Immutable Security Event Trail

## 1. File Location & Purpose
- **Primary Source Files**:
  - `backend/platform/db/models.py`
  - `backend/platform/services/orchestrator.py`
  - `backend/platform/server/routes/audit.py`
- **Purpose**: Provides an append-only, chronologically ordered audit log of all security-relevant operational events.

---

## 2. Audit Event Entity (`AuditLog`)

```python
class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    org_id = Column(String(36), ForeignKey("organizations.id"), nullable=False, index=True)
    actor_id = Column(String(36), ForeignKey("users.id"), nullable=True)
    session_id = Column(String(64), nullable=True, index=True)
    incident_id = Column(String(64), nullable=True, index=True)
    event_type = Column(String(64), nullable=False, index=True)
    details_json = Column(Text, nullable=True)
    created_at = Column(DateTime, default=utcnow, nullable=False, index=True)
```

---

## 3. Canonical Event Chain

During an impersonation attack lifecycle, the orchestrator generates the following chronological audit chain:

1. **`CALL_STARTED`**: Emitted when a call session starts, recording caller number, name, and claimed speaker ID.
2. **`INCIDENT_CREATED`**: Emitted when high/critical risk is detected, recording initial severity, scenario, and risk score.
3. **`SECURITY_ACTION_TAKEN`**: Emitted when an operator executes an action (`CONFIRM_ATTACK`, `BLOCK_CALL`), recording operator ID, action type, and notes.
4. **`CALL_ENDED`**: Emitted when the call session concludes or is blocked, recording total audio seconds, speech duration, and termination reason.

---

## 4. Querying Audit Records
- **Route**: `GET /api/audit-logs`
- **Access**: Restricted to `SECURITY_OPERATOR` and `ADMIN`.
- **Filters**: `session_id`, `incident_id`, `event_type`, `limit`, `offset`.
- **Tenant Scoping**: Enforced via `org_id=user.org_id`.

---

## 5. Source Files Covered
- `backend/platform/db/models.py`
- `backend/platform/services/orchestrator.py`
- `backend/platform/server/routes/audit.py`
