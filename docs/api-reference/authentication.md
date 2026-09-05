# API Reference: Authentication Endpoints

## 1. `POST /api/auth/login`
- **Purpose**: Authenticates a user with username and password, returning an access token.
- **Access**: Public (No JWT required)
- **Request Headers**: `Content-Type: application/json`
- **Request Body** (`LoginRequest`):
  ```json
  {
    "username": "operator",
    "password": "operator123"
  }
  ```
- **Responses**:
  - `200 OK` (`TokenResponse`):
    ```json
    {
      "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
      "token_type": "bearer",
      "user": {
        "id": "user_operator_001",
        "org_id": "org_demo_001",
        "username": "operator",
        "email": "operator@democorp.com",
        "full_name": "Demo Security Operator",
        "role": "SECURITY_OPERATOR",
        "is_active": true,
        "created_at": "2026-09-05T07:40:00Z"
      }
    }
    ```
  - `401 Unauthorized`: Invalid credentials.

---

## 2. `POST /api/auth/register`
- **Purpose**: Registers a new user within the caller's organization.
- **Access**: Restricted to `ADMIN`.
- **Request Headers**:
  - `Authorization: Bearer <admin_token>`
  - `Content-Type: application/json`
- **Request Body** (`UserRegisterRequest`):
  ```json
  {
    "username": "new_analyst",
    "email": "analyst@democorp.com",
    "password": "StrongPassword123!",
    "full_name": "Security Analyst Jane",
    "role": "SECURITY_OPERATOR"
  }
  ```
- **Responses**:
  - `201 Created` (`UserDto`): User object with assigned UUID.
  - `400 Bad Request`: Username or email already registered.
  - `403 Forbidden`: Caller lacks `ADMIN` role.

---

## 3. `GET /api/auth/me`
- **Purpose**: Retrieves current authenticated user profile.
- **Access**: Any authenticated user.
- **Request Headers**: `Authorization: Bearer <token>`
- **Responses**:
  - `200 OK` (`UserDto`): Profile details.
  - `401 Unauthorized`: Missing or invalid token.

---

## 4. Source Files Covered
- `backend/platform/server/routes/auth.py`
- `backend/platform/schemas/auth.py`
