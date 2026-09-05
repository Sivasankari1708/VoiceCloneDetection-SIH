# Module: Alert Dispatcher & WebSocket Hub

**File**: [`backend/platform/services/alert_dispatcher.py`](file:///Users/dhurgadevi/Documents/GitHub/VoiceCloneDetection-SIH/backend/platform/services/alert_dispatcher.py)  
**Package**: `backend.platform.services`

---

## 1. Module Purpose & Responsibilities

`AlertDispatcher` is an asynchronous, thread-safe, in-memory WebSocket connection manager that provides dual alert and telemetry routing. It ensures strict session isolation for callers and multi-tenant organization isolation for Security Operations Center (SOC) dashboards.

### Core Guarantees
1. **Strict Organization Isolation**: Organization A never receives security alerts or incidents belonging to Organization B.
2. **Session Isolation**: Real-time chunk telemetry and user warnings are delivered strictly to the matching `session_id`.

---

## 2. Class: `AlertDispatcher`

### State Maintained
- `_call_sockets: Dict[str, Set[WebSocket]]`: Maps `session_id` to the caller's active WebSocket connection(s).
- `_org_sockets: Dict[str, Set[WebSocket]]`: Maps `org_id` to all connected security operator SOC dashboard WebSockets.
- `_lock: asyncio.Lock`: Mutex safeguarding concurrency during registration and unregistration.
- `_instance: Optional[AlertDispatcher]`: Class-level singleton instance.

---

### Methods

#### 2.1 `get_instance() -> AlertDispatcher`
Class method providing a singleton instance.

#### 2.2 Call Stream Connections (Per-Session)
- `register_call_socket(session_id: str, websocket: WebSocket) -> None`: Adds a caller WebSocket to `_call_sockets[session_id]`.
- `unregister_call_socket(session_id: str, websocket: WebSocket) -> None`: Removes socket; cleans up session entry when empty.
- `send_to_call(session_id: str, message: Dict[str, Any]) -> None`: Serializes `message` to JSON and delivers it to the specific call session. Automatically purges disconnected sockets if `send_text` raises an exception.

#### 2.3 Organization Alert Feed Connections (Per-Organization)
- `register_org_socket(org_id: str, websocket: WebSocket) -> None`: Adds an operator WebSocket to `_org_sockets[org_id]`.
- `unregister_org_socket(org_id: str, websocket: WebSocket) -> None`: Removes operator socket.
- `send_to_org(org_id: str, message: Dict[str, Any]) -> None`: Broadcasts security alerts or incident updates to all operators connected to `org_id`. Automatically purges stale sockets.

---

## 3. Disconnect & Concurrency Behavior

- Whenever a socket throws an error during transmission, it is collected into a `dead` set and cleanly removed under the `asyncio.Lock`.
- When an operator disconnects, remaining operators in that tenant continue receiving alerts without interruption.

---

## 4. Test Traceability

- Automated Tests: [`backend/platform/tests/test_alert_dispatcher.py`](file:///Users/dhurgadevi/Documents/GitHub/VoiceCloneDetection-SIH/backend/platform/tests/test_alert_dispatcher.py)
- Live Server Validation: Check 8 of 11-point live validation verified simultaneous delivery of `USER_SECURITY_ALERT` and `ORGANIZATION_SECURITY_ALERT`.

---

## 5. Source Files Covered

- [`backend/platform/services/alert_dispatcher.py`](file:///Users/dhurgadevi/Documents/GitHub/VoiceCloneDetection-SIH/backend/platform/services/alert_dispatcher.py)
