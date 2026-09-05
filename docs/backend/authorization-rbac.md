# Authorization & Role-Based Access Control (RBAC)

## 1. File Location & Purpose
- **Primary Source Files**:
  - `backend/platform/server/dependencies.py`
  - `backend/platform/db/models.py`
- **Purpose**: Restricts access to sensitive routes, incident investigation queues, operator mitigation actions, and policy configuration based on the caller's authorized role.

---

## 2. Role Taxonomy

Defined in `UserRole` enum (`backend/platform/db/models.py`):

1. **`USER`** (Standard Employee):
   - Scope: Individual voice call recipient.
   - Permissions: Start and end personal call sessions, stream audio chunks, receive personal real-time warnings (`USER_SECURITY_ALERT`), view own call session details.
   - Prohibitions: Cannot access SOC incidents, cannot view other employees' calls, cannot execute operator mitigation actions, cannot modify policies or VIP identities.

2. **`SECURITY_OPERATOR`** (SOC Security Analyst):
   - Scope: Organization-wide security monitoring and incident response.
   - Permissions: All `USER` permissions plus: access organization incident triage queue, subscribe to live SOC WebSocket alert feed, investigate audio evidence, execute operator mitigation actions (`CONFIRM_ATTACK`, `BLOCK_CALL`, `FALSE_POSITIVE`, `RESOLVE`), query audit logs, create protected identities, and enroll reference voice samples.
   - Prohibitions: Cannot delete protected identities, cannot modify organization security policy thresholds, cannot register new user accounts.

3. **`ADMIN`** (Tenant Security Administrator):
   - Scope: Full administrative authority within the tenant organization.
   - Permissions: All `SECURITY_OPERATOR` permissions plus: create and register new users, deactivate protected identities, and modify organization security thresholds and auto-block configurations.

---

## 3. RBAC Enforcement Mechanism

RBAC is enforced via FastAPI dependency injection using the `require_role` factory in `backend/platform/server/dependencies.py`:

```python
def require_role(allowed_roles: List[str]):
    """
    Factory creating a dependency that validates the authenticated user
    possesses one of the allowed roles.
    """
    def role_checker(user: User = Depends(get_current_user)) -> User:
        if user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access forbidden: Insufficient role permissions. Requires one of: {allowed_roles}",
            )
        return user

    return role_checker
```

### Usage Pattern on Route Handlers:
```python
@router.post("/{incident_id}/action", response_model=SecurityActionDto)
async def take_operator_action(
    incident_id: str,
    req: OperatorActionRequest,
    operator: User = Depends(require_role(["SECURITY_OPERATOR", "ADMIN"])),
    db: Session = Depends(get_db),
):
```

---

## 4. Multi-Tenant Organization Isolation

Every request handler that queries or mutates state pairs RBAC with organization scoping:
- `db.query(CallSession).filter_by(org_id=user.org_id)`
- `db.query(SecurityIncident).filter_by(org_id=user.org_id)`
- `db.query(ProtectedIdentity).filter_by(org_id=user.org_id)`
- `db.query(AuditLog).filter_by(org_id=user.org_id)`

An operator in `Organization A` cannot view or take actions on incidents belonging to `Organization B`, even with `role="SECURITY_OPERATOR"`.

---

## 5. Source Files Covered
- `backend/platform/server/dependencies.py`
- `backend/platform/db/models.py`
