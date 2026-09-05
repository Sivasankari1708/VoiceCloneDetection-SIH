# Module: Authentication Service

**File**: [`backend/platform/services/auth_service.py`](file:///Users/dhurgadevi/Documents/GitHub/VoiceCloneDetection-SIH/backend/platform/services/auth_service.py)  
**Package**: `backend.platform.services`

---

## 1. Module Purpose & Responsibilities

`auth_service.py` provides password hashing, password verification, and JWT bearer token creation/decoding for the backend platform.

---

## 2. Constants & Settings

- `_HASH_ITERATIONS = 100_000`: PBKDF2 iteration count.
- `_HASH_NAME = "sha256"`: HMAC digest algorithm.
- `platform_config.jwt_secret`: Secret key used for signing HS256 tokens.
- `platform_config.jwt_algorithm`: `"HS256"`.
- `platform_config.access_token_expire_minutes`: Token validity window (default 480 minutes / 8 hours).

---

## 3. Functions

### 3.1 `hash_password(password: str) -> str`
- **Parameters**: `password: str` (plaintext user password)
- **Algorithm**: Generates a 16-byte cryptographically secure random hexadecimal salt via `secrets.token_hex(16)`, derives key using `hashlib.pbkdf2_hmac("sha256", password, salt, 100_000)`, and returns `"{salt}${key.hex()}"`.
- **Return**: Formatted string containing salt and digest.

### 3.2 `verify_password(plain_password: str, hashed_password: str) -> bool`
- **Parameters**:
  - `plain_password: str`: Incoming candidate password.
  - `hashed_password: str`: Stored salt-and-hash string.
- **Algorithm**: Splits stored string on `$`, computes candidate key with the extracted salt, and verifies match using `hmac.compare_digest` to prevent timing attacks.
- **Return**: `True` if passwords match, `False` otherwise.

### 3.3 `create_access_token(user: User, expires_delta: Optional[timedelta] = None) -> str`
- **Parameters**:
  - `user: User`: Authenticated SQLAlchemy user model.
  - `expires_delta: Optional[timedelta]`: Custom expiration offset.
- **Claims Included in Payload**:
  - `sub`: `user.id` (UUID)
  - `username`: `user.username`
  - `email`: `user.email`
  - `role`: `user.role` (`USER`, `SECURITY_OPERATOR`, `ADMIN`)
  - `org_id`: `user.org_id` (Tenant UUID)
  - `exp`: Expiration UTC datetime
  - `iat`: Issued-at UTC datetime
- **Return**: Signed JWT string.

### 3.4 `decode_access_token(token: str) -> Optional[Dict[str, Any]]`
- **Parameters**: `token: str` (JWT bearer string)
- **Algorithm**: Calls `jwt.decode(token, secret, algorithms=["HS256"])`. Catches `jwt.PyJWTError` (e.g. ExpiredSignatureError, DecodeError) and returns `None` safely.
- **Return**: Decoded claims dictionary or `None`.

---

## 4. Test Traceability

- Automated Tests: [`backend/platform/tests/test_auth_rbac.py`](file:///Users/dhurgadevi/Documents/GitHub/VoiceCloneDetection-SIH/backend/platform/tests/test_auth_rbac.py)
- Live Server Validation: Check 1 of 11-point live validation.

---

## 5. Source Files Covered

- [`backend/platform/services/auth_service.py`](file:///Users/dhurgadevi/Documents/GitHub/VoiceCloneDetection-SIH/backend/platform/services/auth_service.py)
