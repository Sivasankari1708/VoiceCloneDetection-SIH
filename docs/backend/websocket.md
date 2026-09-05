# WebSocket Architecture: Audio Streaming & Real-Time Alert Dispatch

## 1. File Location & Purpose
- **Primary Source Files**:
  - `backend/platform/server/routes/websocket_stream.py`
  - `backend/platform/services/alert_dispatcher.py`
  - `backend/platform/schemas/events.py`
- **Purpose**: Establishes full-duplex WebSocket channels for live browser microphone audio streaming and real-time security alerts.

---

## 2. WebSocket Endpoints

### 2.1 `/ws/stream/{session_id}` (Audio Streaming & User Warnings)
- **Direction**: Bidirectional
- **Client**: Caller / Employee UI (Member 3)
- **Path Parameter**: `session_id` (Call session ID obtained from `POST /api/calls/start`).
- **Data In**: Binary audio chunks (raw 16 kHz 16-bit PCM, WAV containers, or WebM audio slices).
- **Data Out**: JSON event frames (`RISK_UPDATE`, `USER_SECURITY_ALERT`, `CALL_ENDED`).
- **Lifecycle**:
  1. `await websocket.accept()`
  2. Registers socket with `alert_dispatcher.register_call_socket(session_id, websocket)`.
  3. Emits `CALL_STARTED` event.
  4. While connected: receives audio bytes $\rightarrow$ invokes `orchestrator.process_stream_chunk()`.
  5. Upon disconnect or error: unregisters socket and invokes `orchestrator.end_call_session(session_id, reason="CLIENT_DISCONNECTED")`.

### 2.2 `/ws/org/{org_id}/alerts` (SOC Security Feed)
- **Direction**: Server-to-Client Broadcast
- **Client**: Security Operations Center Console (Member 4)
- **Path Parameter**: `org_id` (Organization ID).
- **Query Parameter**: `?token=<jwt>` (Required JWT token with role `SECURITY_OPERATOR` or `ADMIN`).
- **Data Out**: JSON event frames (`ORGANIZATION_SECURITY_ALERT`, `INCIDENT_CREATED`, `INCIDENT_UPDATED`, `SECURITY_ACTION`).
- **Authentication Handshake**:
  - Extracts `token` query param.
  - Decodes token via `auth_service.decode_access_token()`.
  - Verifies user's role is in `["SECURITY_OPERATOR", "ADMIN"]` and `user.org_id == org_id`.
  - If invalid, rejects connection with WebSocket close code `1008 Policy Violation`.

---

## 3. Connection Manager (`AlertDispatcher`)

Located in `backend/platform/services/alert_dispatcher.py`.

### 3.1 Data Structures
```python
class AlertDispatcher:
    _instance: Optional[AlertDispatcher] = None
    _call_sockets: Dict[str, Set[WebSocket]]   # Keyed by session_id
    _org_sockets: Dict[str, Set[WebSocket]]    # Keyed by org_id
```

### 3.2 Key Methods
- `register_call_socket(session_id, websocket)`: Adds connection to call socket pool.
- `unregister_call_socket(session_id, websocket)`: Removes connection from call socket pool.
- `register_org_socket(org_id, websocket)`: Adds connection to SOC pool.
- `unregister_org_socket(org_id, websocket)`: Removes connection from SOC pool.
- `send_to_call(session_id, event_dict)`: Iterates over sockets registered for `session_id`, sending text JSON frames. Silently catches dead sockets and removes them.
- `send_to_org(org_id, event_dict)`: Iterates over sockets registered for `org_id`, broadcasting alert JSON frames.

---

## 4. Message Contract & Event Types

Defined in `backend/platform/schemas/events.py`:

```json
{
  "event": "EVENT_NAME",
  "timestamp": "2026-09-05T12:00:00Z",
  "data": { ... }
}
```

### Event Taxonomy:
1. `CALL_STARTED`: Confirms streaming pipeline initialization for session.
2. `RISK_UPDATE`: Per-chunk acoustic and semantic metrics.
3. `USER_SECURITY_ALERT`: Urgent warning banner sent to call recipient.
4. `ORGANIZATION_SECURITY_ALERT`: Urgent threat alert sent to SOC console.
5. `INCIDENT_CREATED`: Dispatched to SOC when an incident is opened.
6. `INCIDENT_UPDATED`: Dispatched to SOC when incident severity or status changes.
7. `SECURITY_ACTION`: Dispatched to SOC when an operator mitigation is executed.
8. `CALL_ENDED`: Notifies caller client that session has concluded or was blocked by security.

---

## 5. Source Files Covered
- `backend/platform/server/routes/websocket_stream.py`
- `backend/platform/services/alert_dispatcher.py`
- `backend/platform/schemas/events.py`
