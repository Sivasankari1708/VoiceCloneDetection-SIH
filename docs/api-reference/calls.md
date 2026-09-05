# API Reference: Call Session Endpoints

## 1. `POST /api/calls/start`
- **Purpose**: Initializes a new active voice call session.
- **Access**: Any authenticated user (`USER`, `SECURITY_OPERATOR`, `ADMIN`).
- **Headers**: `Authorization: Bearer <token>`, `Content-Type: application/json`
- **Request Body** (`CallStartRequest`):
  ```json
  {
    "caller_name": "David Vance (CFO Office)",
    "caller_number": "+1-555-0199",
    "claimed_speaker_id": "LA_0069"
  }
  ```
- **Responses**:
  - `201 Created` (`CallSessionDto`):
    ```json
    {
      "session_id": "call_5375ece8-c69",
      "org_id": "org_demo_001",
      "user_id": "user_employee_001",
      "caller_number": "+1-555-0199",
      "caller_name": "David Vance (CFO Office)",
      "claimed_speaker_id": "LA_0069",
      "status": "ACTIVE",
      "current_risk_score": 0.0,
      "current_risk_level": "SAFE",
      "total_chunks": 0,
      "total_audio_seconds": 0.0,
      "total_speech_seconds": 0.0,
      "start_time": "2026-09-05T12:00:00Z",
      "end_time": null
    }
    ```

---

## 2. `GET /api/calls`
- **Purpose**: Lists calls for the tenant organization (users only see their own calls; operators see all tenant calls).
- **Access**: Any authenticated user.
- **Query Parameters**:
  - `status`: Optional filter (`ACTIVE`, `ENDED`, `TERMINATED_BY_SECURITY`).
  - `limit`: Integer (1–100, default: 50).
  - `offset`: Integer (default: 0).
- **Responses**: `200 OK` (`List[CallSessionDto]`).

---

## 3. `GET /api/calls/{session_id}`
- **Purpose**: Retrieves a specific call session's status, risk scores, and accumulated transcript.
- **Access**: Any authenticated user in the same organization.
- **Path Parameter**: `session_id` (String).
- **Responses**:
  - `200 OK` (`CallSessionDto`)
  - `404 Not Found`: Session not found or belongs to another organization.

---

## 4. `POST /api/calls/{session_id}/end`
- **Purpose**: Gracefully concludes an active call session and computes acoustic session metrics.
- **Access**: Any authenticated user in the same organization.
- **Path Parameter**: `session_id` (String).
- **Request Body** (`CallEndRequest`):
  ```json
  {
    "reason": "NORMAL_HANGUP"
  }
  ```
- **Responses**:
  - `200 OK` (`CallSummaryDto`):
    ```json
    {
      "session_id": "call_5375ece8-c69",
      "claimed_speaker_id": "LA_0069",
      "total_chunks": 12,
      "total_audio_seconds": 12.0,
      "total_speech_seconds": 11.4,
      "mean_latency_ms": 142.5,
      "mean_rtf": 0.14
    }
    ```

---

## 5. Source Files Covered
- `backend/platform/server/routes/calls.py`
- `backend/platform/schemas/calls.py`
