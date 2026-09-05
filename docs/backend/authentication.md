# Authentication Subsystem: Password Hashing & JWT Lifecycle

## 1. File Location & Purpose
- **Primary Source Files**:
  - `backend/platform/services/auth_service.py`
  - `backend/platform/server/dependencies.py`
  - `backend/platform/server/routes/auth.py`
- **Purpose**: Implements secure user authentication, cryptographic password hashing, access token generation, token signature verification, and request authentication dependency injection.

---

## 2. Password Hashing Architecture

Located in `backend/platform/services/auth_service.py`.

### 2.1 Implementation Details
- **Algorithm**: PBKDF2 with HMAC-SHA256
- **Iterations**: 100,000 iterations
- **Salt Generation**: 16 bytes cryptographically secure random bytes via `secrets.token_bytes(16)`.
- **Storage Format**: `salt_hex$hash_hex`

### 2.2 Functions
```python
def hash_password(password: str) -> str:
    """Derives a PBKDF2-HMAC-SHA256 hash using a 16-byte random salt and 100,000 iterations."""

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Splits stored salt and hash, computes derived key with constant-time comparison."""
```

---

## 3. JWT Token Architecture

### 3.1 Token Encoding
Tokens are generated using `PyJWT` signed with HMAC-SHA256 (`HS256`):
```python
def create_access_token(user: User, expires_delta: Optional[timedelta] = None) -> str:
    # Default expiry: PlatformConfig.jwt_expiration_minutes (1440 min / 24 hours)
    payload = {
        "sub": user.id,
        "username": user.username,
        "email": user.email,
        "role": user.role,
        "org_id": user.org_id,
        "exp": expire,
        "iat": utcnow(),
    }
    return jwt.encode(payload, config.jwt_secret, algorithm=config.jwt_algorithm)
```

### 3.2 Token Claims
- `sub`: User unique primary key (`id`).
- `username`: User login handle.
- `email`: User corporate email.
- `role`: Role string (`USER`, `SECURITY_OPERATOR`, `ADMIN`).
- `org_id`: Tenant organization ID.
- `exp`: Expiration timestamp (UNIX epoch).
- `iat`: Issued-at timestamp (UNIX epoch).

### 3.3 Token Decoding & Validation
```python
def decode_access_token(token: str) -> Optional[dict]:
    """Validates signature and expiry; returns payload dict or None on invalid token."""
```

---

## 4. Request Authentication Dependency

Located in `backend/platform/server/dependencies.py`.

```python
security = HTTPBearer(auto_error=False)

def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Security(security),
    db: Session = Depends(get_db),
) -> User:
```

### Execution Flow:
1. Extracts credentials from `Authorization: Bearer <token>`. If absent, raises `HTTP 401 Unauthorized`.
2. Decodes token via `decode_access_token()`. If invalid or expired, raises `HTTP 401 Unauthorized`.
3. Queries active database user: `db.query(User).filter_by(id=payload["sub"], is_active=True).first()`.
4. If user inactive or missing, raises `HTTP 401 Unauthorized`.
5. Returns authenticated `User` model instance to the calling route handler.

---

## 5. Seeded Accounts

| Username | Password | Role | Organization |
|---|---|---|---|
| `admin` | `admin123` | `ADMIN` | `org_demo_001` |
| `operator` | `operator123` | `SECURITY_OPERATOR` | `org_demo_001` |
| `employee` | `employee123` | `USER` | `org_demo_001` |

---

## 6. Source Files Covered
- `backend/platform/services/auth_service.py`
- `backend/platform/server/dependencies.py`
- `backend/platform/server/routes/auth.py`
- `backend/platform/config.py`
