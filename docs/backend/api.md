# API Architecture: REST Gateway & Route Inventory

## 1. Overview & Protocol Standard

The REST API exposes 19 distinct endpoints across 9 functional categories.

### Protocol Conventions:
- **Base Path**: `/api`
- **Data Exchange**: JSON (`application/json`) for standard requests; Multipart Form (`multipart/form-data`) for file uploads.
- **Authentication**: HTTP Bearer Token (`Authorization: Bearer <JWT>`).
- **Standard HTTP Responses**:
  - `200 OK`: Successful retrieval or update.
  - `201 Created`: Successful resource creation.
  - `400 Bad Request`: Client validation error or malformed payload.
  - `401 Unauthorized`: Missing, invalid, or expired JWT.
  - `403 Forbidden`: Authenticated user lacks required role permissions.
  - `404 Not Found`: Resource does not exist or belongs to another organization.
  - `422 Unprocessable Entity`: Pydantic payload schema violation.
  - `500 Internal Server Error`: Unhandled application exception.

---

## 2. Comprehensive Route Inventory

| Route Path | Method | Route Module | Auth | Role Required | Request DTO | Response DTO |
|---|---|---|:---:|---|---|---|
| `/api/auth/register` | `POST` | `routes/auth.py` | JWT | `ADMIN` | `UserRegisterRequest` | `UserDto` |
| `/api/auth/login` | `POST` | `routes/auth.py` | None | None | `LoginRequest` | `TokenResponse` |
| `/api/auth/me` | `GET` | `routes/auth.py` | JWT | Any | None | `UserDto` |
| `/api/organizations/me` | `GET` | `routes/organizations.py` | JWT | Any | None | `OrganizationDto` |
| `/api/protected-identities` | `GET` | `routes/protected_identities.py` | JWT | Any | None | `List[ProtectedIdentityDto]` |
| `/api/protected-identities` | `POST` | `routes/protected_identities.py` | JWT | `ADMIN`, `SECURITY_OPERATOR` | `ProtectedIdentityCreate` | `ProtectedIdentityDto` |
| `/api/protected-identities/{id}` | `GET` | `routes/protected_identities.py` | JWT | Any | Path: `id` | `ProtectedIdentityDto` |
| `/api/protected-identities/{id}/enroll` | `POST` | `routes/protected_identities.py` | JWT | `ADMIN`, `SECURITY_OPERATOR` | Form: `files` | `EnrollmentResponseDto` |
| `/api/protected-identities/{id}` | `DELETE`| `routes/protected_identities.py` | JWT | `ADMIN` | Path: `id` | `dict` |
| `/api/calls/start` | `POST` | `routes/calls.py` | JWT | Any | `CallStartRequest` | `CallSessionDto` |
| `/api/calls` | `GET` | `routes/calls.py` | JWT | Any | Query: `status`, `limit` | `List[CallSessionDto]` |
| `/api/calls/{session_id}` | `GET` | `routes/calls.py` | JWT | Any | Path: `session_id` | `CallSessionDto` |
| `/api/calls/{session_id}/end` | `POST` | `routes/calls.py` | JWT | Any | `CallEndRequest` | `CallSummaryDto` |
| `/api/incidents` | `GET` | `routes/incidents.py` | JWT | `ADMIN`, `SECURITY_OPERATOR` | Query: `severity`, `status` | `List[IncidentSummaryDto]` |
| `/api/incidents/{id}` | `GET` | `routes/incidents.py` | JWT | `ADMIN`, `SECURITY_OPERATOR` | Path: `id` | `IncidentDetailDto` |
| `/api/incidents/{id}/action` | `POST` | `routes/incidents.py` | JWT | `ADMIN`, `SECURITY_OPERATOR` | `OperatorActionRequest` | `SecurityActionDto` |
| `/api/incidents/{id}` | `PATCH`| `routes/incidents.py` | JWT | `ADMIN`, `SECURITY_OPERATOR` | `IncidentStatusUpdateRequest` | `IncidentDetailDto` |
| `/api/policies` | `GET` | `routes/policies.py` | JWT | Any | None | `SecurityPolicyDto` |
| `/api/policies` | `PUT` | `routes/policies.py` | JWT | `ADMIN` | `SecurityPolicyUpdateDto` | `SecurityPolicyDto` |
| `/api/audit-logs` | `GET` | `routes/audit.py` | JWT | `ADMIN`, `SECURITY_OPERATOR` | Query: `session_id`, `type` | `List[AuditLogDto]` |
| `/api/health` | `GET` | `routes/health.py` | None | None | None | `HealthCheckResponse` |
| `/api/stats` | `GET` | `routes/health.py` | JWT | `ADMIN`, `SECURITY_OPERATOR` | None | `PlatformStatsDto` |
| `/api/analyze/file` | `POST` | `routes/analyze.py` | JWT | Any | Form: `file`, `speaker_id` | `InferenceResultDto` |

---

## 3. Error Handling Architecture

FastAPI automatically transforms exceptions into standard HTTP responses:
- `HTTPException(status_code, detail)`: Produces `{"detail": "<message>"}`.
- `RequestValidationError`: Produces `{"detail": [{"loc": [...], "msg": "...", "type": "..."}]}`.

---

## 4. Source Files Covered
- `backend/platform/server/routes/*`
- `backend/platform/schemas/*`
