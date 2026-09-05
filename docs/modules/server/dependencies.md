# Module: Server Dependencies & Security Inversion

**File**: [`backend/platform/server/dependencies.py`](file:///Users/dhurgadevi/Documents/GitHub/VoiceCloneDetection-SIH/backend/platform/server/dependencies.py)  
**Package**: `backend.platform.server`

---

## 1. Module Purpose & Responsibilities

`dependencies.py` encapsulates FastAPI dependency injection functions providing request-scoped database sessions, JWT bearer token extraction and validation, current user identity resolution, multi-tenant organization binding, and role-based access control (RBAC).

---

## 2. Dependencies & Imports

- **FastAPI**: `Depends`, `HTTPException`, `Security`, `status`, `HTTPAuthorizationCredentials`, `HTTPBearer`
- **SQLAlchemy**: `Session`
- **Database Models & Session**: `Organization`, `User`, `get_db`
- **Authentication Service**: `decode_access_token` from [`backend.platform.services.auth_service`](file:///Users/dhurgadevi/Documents/GitHub/VoiceCloneDetection-SIH/backend/platform/services/auth_service.py)

---

## 3. Security Scheme

```python
security = HTTPBearer(auto_error=False)
```
- Configured with `auto_error=False` so that missing authorization headers can be captured gracefully with clear, customized JSON error responses.
- In Swagger UI (`/docs`), entering the raw token string (e.g., `eyJ...`) correctly maps to `Authorization: Bearer <token>`.

---

## 4. Injected Dependencies

### `get_current_user(credentials, db) -> User`
- **Signature**:
  ```python
  def get_current_user(
      credentials: Optional[HTTPAuthorizationCredentials] = Security(security),
      db: Session = Depends(get_db),
  ) -> User
  ```
- **Execution Steps**:
  1. Verifies that `credentials` and `credentials.credentials` are provided. Raises `401 Unauthorized` if missing.
  2. Calls `decode_access_token(token)` to parse and verify the JWT signature.
  3. Extracts the subject claim (`sub`), which corresponds to `user.id`.
  4. Queries `User` table for `id == user_id` and `is_active == True`. Raises `401 Unauthorized` if account does not exist or is inactive.
  5. Returns the hydrated `User` SQLAlchemy model instance.

### `require_role(allowed_roles: List[str])`
- **Signature**:
  ```python
  def require_role(allowed_roles: List[str]) -> Callable[[User], User]
  ```
- **Purpose**: Higher-order dependency factory enforcing RBAC rules across protected endpoints.
- **Rules**:
  - Checks if `user.role in allowed_roles` or `user.role == "ADMIN"`.
  - Admin users are granted universal bypass across lower role gates.
  - If unauthorized, raises `HTTPException(403, detail="Access denied: Requires role in [...]")`.

### `get_current_org(user, db) -> Organization`
- **Signature**:
  ```python
  def get_current_org(
      user: User = Depends(get_current_user),
      db: Session = Depends(get_db),
  ) -> Organization
  ```
- **Purpose**: Resolves the tenant organization record associated with the authenticated user.
- **Verification**: Confirms `user.org_id` exists in the `organizations` table and `is_active == True`.

---

## 5. Automated Test Coverage

- Tested in: [`backend/platform/tests/test_auth_rbac.py`](file:///Users/dhurgadevi/Documents/GitHub/VoiceCloneDetection-SIH/backend/platform/tests/test_auth_rbac.py)
- Live Server Validation: Check 1 & Check 2 of 11-point live validation.

---

## 6. Source Files Covered

- [`backend/platform/server/dependencies.py`](file:///Users/dhurgadevi/Documents/GitHub/VoiceCloneDetection-SIH/backend/platform/server/dependencies.py)
