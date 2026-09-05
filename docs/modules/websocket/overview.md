# Module: WebSocket Subsystem

**Package**: `backend.platform.services` & `backend.platform.server.routes`

---

## 1. Scope

The WebSocket subsystem provides two asynchronous real-time endpoints:
1. **Audio Streaming & Caller Telemetry**:
   - Route: `/ws/stream/{session_id}`
   - Controller: [`backend/platform/server/routes/websocket_stream.py`](file:///Users/dhurgadevi/Documents/GitHub/VoiceCloneDetection-SIH/backend/platform/server/routes/websocket_stream.py#L31-L121)
2. **SOC Security Alert Broadcasting**:
   - Route: `/ws/org/{org_id}/alerts`
   - Controller: [`backend/platform/server/routes/websocket_stream.py`](file:///Users/dhurgadevi/Documents/GitHub/VoiceCloneDetection-SIH/backend/platform/server/routes/websocket_stream.py#L123-L177)
3. **Pub/Sub Hub & Connection Lifecycle**:
   - Service: `AlertDispatcher` in [`backend/platform/services/alert_dispatcher.py`](file:///Users/dhurgadevi/Documents/GitHub/VoiceCloneDetection-SIH/backend/platform/services/alert_dispatcher.py)

For comprehensive event specifications and sequence diagrams, refer to:
- [Backend WebSocket Architecture](file:///Users/dhurgadevi/Documents/GitHub/VoiceCloneDetection-SIH/docs/backend/websocket.md)
- [API Reference: Streaming](file:///Users/dhurgadevi/Documents/GitHub/VoiceCloneDetection-SIH/docs/api-reference/streaming.md)
- [Real-time Flow Guide](file:///Users/dhurgadevi/Documents/GitHub/VoiceCloneDetection-SIH/docs/architecture/realtime-flow.md)
