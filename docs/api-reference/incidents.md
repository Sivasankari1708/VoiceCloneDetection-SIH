# API Reference: Incident Management Endpoints

## 1. `GET /api/incidents`
- **Purpose**: Lists all security incidents for the caller's organization.
- **Access**: Restricted to `SECURITY_OPERATOR` and `ADMIN`.
- **Query Parameters**:
  - `severity`: Optional filter (`HIGH`, `CRITICAL`).
  - `status`: Optional filter (`OPEN`, `UNDER_REVIEW`, `CONFIRMED_ATTACK`, `FALSE_POSITIVE`, `RESOLVED`).
  - `limit`: Integer (1–100, default: 50).
  - `offset`: Integer (default: 0).
- **Responses**:
  - `200 OK` (`List[IncidentSummaryDto]`):
    ```json
    [
      {
        "incident_id": "78fc62a3-41ea-4e99-b100-3a769a880eed",
        "org_id": "org_demo_001",
        "session_id": "call_5375ece8-c69",
        "severity": "CRITICAL",
        "status": "OPEN",
        "scenario": "AI_CLONE_ENROLLED_SPEAKER",
        "claimed_identity": "LA_0069",
        "current_risk_score": 98.5,
        "synthetic_probability": 0.9995,
        "speaker_similarity": 0.8995,
        "intent": "PAYMENT_TRANSFER",
        "created_at": "2026-09-05T12:00:00Z",
        "updated_at": "2026-09-05T12:00:15Z"
      }
    ]
    ```

---

## 2. `GET /api/incidents/{incident_id}`
- **Purpose**: Retrieves full investigative details, reasons, and mitigation actions for a specific incident.
- **Access**: Restricted to `SECURITY_OPERATOR` and `ADMIN`.
- **Path Parameter**: `incident_id` (String).
- **Responses**:
  - `200 OK` (`IncidentDetailDto`): Includes `reasons` list, `actions` list, and `operator_notes`.
  - `404 Not Found`: Incident not found or belongs to another organization.

---

## 3. `PATCH /api/incidents/{incident_id}`
- **Purpose**: Updates an incident's triage status or adds operator notes.
- **Access**: Restricted to `SECURITY_OPERATOR` and `ADMIN`.
- **Path Parameter**: `incident_id` (String).
- **Request Body** (`IncidentStatusUpdateRequest`):
  ```json
  {
    "status": "UNDER_REVIEW",
    "operator_notes": "Analyst investigating acoustic features."
  }
  ```
- **Responses**:
  - `200 OK` (`IncidentDetailDto`)

---

## 4. Source Files Covered
- `backend/platform/server/routes/incidents.py`
- `backend/platform/schemas/incidents.py`
