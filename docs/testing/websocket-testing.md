# Testing: WebSocket Streaming Verification

This document details the automated and live validation procedures used to verify WebSocket audio ingestion, chunk processing, real-time telemetry streaming, and broadcast alerting.

---

## 1. Automated WebSocket Test Suite

Automated WebSocket verification is located in [`backend/platform/tests/test_websocket.py`](file:///Users/dhurgadevi/Documents/GitHub/VoiceCloneDetection-SIH/backend/platform/tests/test_websocket.py).

### 1.1 `test_websocket_stream_chunk_and_risk_update`
- **Objective**: Verifies that streaming 1-second binary audio chunks yields valid `RISK_UPDATE` JSON events.
- **Setup**:
  - Uses `TestClient.websocket_connect(f"/ws/stream/{session_id}")`.
  - Injects a synthetic 1-second 16 kHz 16-bit PCM binary chunk (32,000 bytes).
- **Assertions**:
  - Received JSON payload contains:
    - `event == "RISK_UPDATE"`
    - Valid `risk_score` (float)
    - Valid `risk_level` (`SAFE`, `LOW`, `MEDIUM`, `HIGH`, `CRITICAL`)
    - Valid `synthetic_probability`
    - Valid `latency_ms`

### 1.2 `test_websocket_dual_alert_on_critical_voice_clone`
- **Objective**: Verifies simultaneous delivery of security alerts to both the active call recipient and the SOC dashboard.
- **Setup**:
  - Connects caller WebSocket to `/ws/stream/{session_id}`.
  - Connects SOC dashboard WebSocket to `/ws/org/{org_id}/alerts` using an authenticated operator token.
  - Injects an audio chunk triggering a critical voice clone detection.
- **Assertions**:
  - Caller socket receives `USER_SECURITY_ALERT` containing warning banner text.
  - SOC socket receives `ORGANIZATION_SECURITY_ALERT` containing incident forensic details (`synthetic_probability`, `speaker_similarity`, `reasons`).

---

## 2. Live WebSocket Validation with Real AI

During live testing against `http://localhost:8000`:
- Raw binary chunks were streamed over `ws://localhost:8000/ws/stream/{session_id}` using `websockets` Python client.
- The server processed chunks in real-time ($< 250\text{ ms}$ processing latency per 1.0s audio chunk).
- The SOC channel at `ws://localhost:8000/ws/org/{org_id}/alerts` confirmed instant broadcast upon critical detection.

---

## 3. Disconnection & Error Handling Tests

1. **Client Disconnect**: When a caller closes the WebSocket, the server invokes `AlertDispatcher.unregister_call_socket()`, purges socket references, and updates session duration.
2. **Operator Disconnect**: If one operator disconnects from `/ws/org/{org_id}/alerts`, remaining connected operators continue receiving alerts without socket leaks or exceptions.
3. **Malformed Frame Handling**: If an invalid binary frame or unparseable string is received, the server logs a warning and returns an `ERROR` event without terminating the connection loop.
