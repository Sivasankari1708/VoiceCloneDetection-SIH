# Multi-Tenant Isolation & Data Boundaries

## 1. Security Invariant

> **Strict Multi-Tenant Isolation**: Data belonging to Organization A must never be accessible or observable by users, operators, or administrators of Organization B.

---

## 2. Enforcement Architecture

### 2.1 Database Query Scoping
Every database table holding organization-specific data contains an `org_id` column indexed for fast lookup:
- `users.org_id`
- `protected_identities.org_id`
- `call_sessions.org_id`
- `security_incidents.org_id`
- `security_policies.org_id`
- `audit_logs.org_id`

All query logic in route handlers and services injects `org_id=user.org_id`:
```python
# Example from calls.py
call = db.query(CallSession).filter_by(session_id=session_id, org_id=user.org_id).first()
if not call:
    raise HTTPException(status_code=404, detail="Call session not found.")
```
If a user in Org A attempts to request `session_id` belonging to Org B, the query returns `None`, resulting in `HTTP 404 Not Found` rather than leaking existence or metadata.

### 2.2 WebSocket Channel Scoping
In `AlertDispatcher`, WebSocket connections are held in an in-memory dictionary partitioned by tenant ID:
```python
_org_sockets: Dict[str, Set[WebSocket]]
```
When an alert is emitted for Organization A, `send_to_org("org_a", payload)` iterates strictly over `_org_sockets["org_a"]`. Sockets connected to `org_b` receive zero bytes.

---

## 3. Implementation vs Verification Status
- **Implementation Status**: **Implemented** across all database entities, route queries, and WebSocket channels.
- **Verification Status**: **Partially Tested** (the token generation and user schema verify `org_id` persistence; cross-tenant negative test where Org A attempts to read Org B incident is not currently part of the automated suite).

---

## 4. Source Files Covered
- `backend/platform/db/models.py`
- `backend/platform/server/routes/*`
- `backend/platform/services/alert_dispatcher.py`
