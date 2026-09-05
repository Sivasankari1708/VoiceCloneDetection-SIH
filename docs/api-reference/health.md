# API Reference: Health & System Telemetry

This document details the system health check and statistical telemetry endpoints exposed by the platform server.

---

## 1. System Health Check

- **Path**: `GET /api/health`
- **Authentication**: None (Public endpoint for load balancers and container orchestrators)
- **Source File**: [`backend/platform/server/routes/health.py`](file:///Users/dhurgadevi/Documents/GitHub/VoiceCloneDetection-SIH/backend/platform/server/routes/health.py#L23-L49)
- **Controller Function**: `health_check(db)`

### Response Payload

- **Status Code**: `200 OK`
- **Response Format**:
  ```json
  {
    "status": "healthy",
    "database_connected": true,
    "ai_pipeline_loaded": true,
    "components": {
      "vad": "SileroVAD (active)",
      "deepfake_detector": "DeepfakeCNN v2 (ASVspoof 2019 LA)",
      "speaker_verifier": "SpeechBrain ECAPA-TDNN (192-D)",
      "whisper_asr": "faster-whisper (int8 CPU)",
      "intent_detector": "IntentDetector (active)",
      "risk_engine": "RiskEngine (active)"
    }
  }
  ```

If either the database connection test (`SELECT 1`) fails or the AI pipeline fails to initialize, `status` returns `"degraded"` and the respective boolean indicator is set to `false`.

---

## 2. Organization Telemetry Statistics

- **Path**: `GET /api/stats`
- **Authentication**: Bearer JWT (Header: `Authorization: Bearer <token>`)
- **Required Role**: Any authenticated role (`USER`, `SECURITY_OPERATOR`, `ADMIN`)
- **Source File**: [`backend/platform/server/routes/health.py`](file:///Users/dhurgadevi/Documents/GitHub/VoiceCloneDetection-SIH/backend/platform/server/routes/health.py#L51-L91)
- **Controller Function**: `get_stats(user, db)`

### Response Payload

- **Status Code**: `200 OK`
- **Response Format**:
  ```json
  {
    "org_id": "org-00000000-0000-0000-0000-000000000001",
    "calls": {
      "total": 42,
      "active": 3,
      "clones_detected": 5
    },
    "incidents": {
      "total": 5,
      "open": 1,
      "confirmed_attacks": 4
    },
    "protected_identities": 1
  }
  ```

### Metrics Breakdown

- `calls.total`: Total call sessions ever registered in this organization.
- `calls.active`: Currently running call sessions (`status == "ACTIVE"`).
- `calls.clones_detected`: Sessions where the final verdict was confirmed as `"cloned"`.
- `incidents.total`: Total security incidents generated for this tenant.
- `incidents.open`: Incidents awaiting operator review (`status in ["OPEN", "UNDER_REVIEW"]`).
- `incidents.confirmed_attacks`: Incidents validated as attacks (`status == "CONFIRMED_ATTACK"`).
- `protected_identities`: Number of active VIP/executive profiles enrolled.

---

## 3. Test & Verification Traceability

- Live Server: Validated on `http://localhost:8000/api/health` and `http://localhost:8000/api/stats`.
- Test Suites: Verified under API test fixtures in [`backend/platform/tests/test_api_calls.py`](file:///Users/dhurgadevi/Documents/GitHub/VoiceCloneDetection-SIH/backend/platform/tests/test_api_calls.py).
