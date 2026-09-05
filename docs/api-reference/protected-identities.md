# API Reference: Protected Identities & Speaker Enrollment

## 1. `GET /api/protected-identities`
- **Purpose**: Lists all registered VIP protected identities for the caller's organization.
- **Access**: Any authenticated user.
- **Headers**: `Authorization: Bearer <token>`
- **Responses**:
  - `200 OK` (`List[ProtectedIdentityDto]`):
    ```json
    [
      {
        "id": "vip_cfo_001",
        "org_id": "org_demo_001",
        "full_name": "David Vance",
        "title": "Chief Financial Officer",
        "department": "Finance",
        "risk_priority": "CRITICAL",
        "speaker_id": "LA_0069",
        "is_active": true,
        "is_enrolled": true,
        "sample_count": 3,
        "created_at": "2026-09-05T07:40:00Z"
      }
    ]
    ```

---

## 2. `POST /api/protected-identities`
- **Purpose**: Registers a new VIP identity for voice clone monitoring.
- **Access**: Restricted to `SECURITY_OPERATOR` and `ADMIN`.
- **Headers**: `Authorization: Bearer <token>`, `Content-Type: application/json`
- **Request Body** (`ProtectedIdentityCreate`):
  ```json
  {
    "full_name": "Sarah Connor",
    "title": "Chief Executive Officer",
    "department": "Executive",
    "risk_priority": "CRITICAL",
    "speaker_id": "spk_ceo_sarah"
  }
  ```
- **Responses**:
  - `201 Created` (`ProtectedIdentityDto`)
  - `400 Bad Request`: Speaker ID already registered.

---

## 3. `POST /api/protected-identities/{id}/enroll`
- **Purpose**: Uploads reference audio samples to build an enrolled biometric speaker profile.
- **Access**: Restricted to `SECURITY_OPERATOR` and `ADMIN`.
- **Path Parameter**: `id` (Identity UUID).
- **Headers**: `Authorization: Bearer <token>`, `Content-Type: multipart/form-data`
- **Form Data**:
  - `files`: Multiple audio files (1–5 WAV/FLAC files of clean voice).
- **Responses**:
  - `200 OK` (`EnrollmentResponseDto`):
    ```json
    {
      "success": true,
      "speaker_id": "LA_0069",
      "sample_count": 3,
      "consistency_score": 0.892,
      "message": "Speaker enrolled successfully."
    }
    ```
  - `400 Bad Request`: Insufficient speech in samples or inconsistent speaker characteristics.

---

## 4. `DELETE /api/protected-identities/{id}`
- **Purpose**: Deactivates a protected identity.
- **Access**: Restricted to `ADMIN`.
- **Path Parameter**: `id` (Identity UUID).
- **Responses**:
  - `200 OK`: `{"detail": "Protected identity deactivated successfully."}`

---

## 5. Source Files Covered
- `backend/platform/server/routes/protected_identities.py`
- `backend/platform/schemas/protected_identities.py`
- `backend/platform/services/speaker_service.py`
