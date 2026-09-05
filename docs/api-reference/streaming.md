# API Reference: Streaming & WebSocket Endpoints

## 1. `WS /ws/stream/{session_id}`
- **Purpose**: Real-time bidirectional streaming channel between the caller's browser microphone and the backend platform.
- **Access**: Public / Session Knowledge (client must provide valid `session_id`).
- **Binary In**: Raw 16 kHz mono audio chunks (16-bit PCM, WAV, WebM).
- **JSON Out Frames**:
  - `CALL_STARTED`
  - `RISK_UPDATE`
  - `USER_SECURITY_ALERT`
  - `CALL_ENDED`

---

## 2. `WS /ws/org/{org_id}/alerts?token=<jwt>`
- **Purpose**: Real-time broadcast channel delivering threat alerts and incident events to security analysts in the SOC dashboard.
- **Access**: Restricted to `SECURITY_OPERATOR` and `ADMIN`.
- **Query Parameter**: `token` (String, valid JWT bearer token).
- **JSON Out Frames**:
  - `ORGANIZATION_SECURITY_ALERT`
  - `INCIDENT_CREATED`
  - `INCIDENT_UPDATED`
  - `SECURITY_ACTION`

---

## 3. `POST /api/analyze/file`
- **Purpose**: Batch audio file analysis route for offline file inspection.
- **Access**: Any authenticated user.
- **Headers**: `Authorization: Bearer <token>`, `Content-Type: multipart/form-data`
- **Form Parameters**:
  - `file`: Audio file (WAV, FLAC, MP3, AIFF).
  - `claimed_speaker_id`: Optional enrolled speaker ID.
- **Responses**:
  - `200 OK` (`InferenceResultDto`):
    ```json
    {
      "verdict": "cloned",
      "risk_score": 95.0,
      "risk_level": "CRITICAL",
      "synthetic_probability": 0.9995,
      "speaker_similarity": 0.8995,
      "speaker_match": true,
      "transcript": "Please transfer the funds immediately.",
      "intent": "PAYMENT_TRANSFER",
      "reasons": [
        "High speaker match combined with high synthetic probability indicates AI clone."
      ]
    }
    ```

---

## 4. Source Files Covered
- `backend/platform/server/routes/websocket_stream.py`
- `backend/platform/server/routes/analyze.py`
- `backend/platform/schemas/events.py`
