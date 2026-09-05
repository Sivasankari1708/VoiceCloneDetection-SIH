# Call Session Management & State Tracking

## 1. File Location & Purpose
- **Primary Source Files**:
  - `backend/platform/services/orchestrator.py`
  - `backend/platform/server/routes/calls.py`
  - `backend/platform/db/models.py`
- **Purpose**: Governs the complete lifecycle of inbound voice call sessions, from initialization and audio streaming to risk telemetry recording, security blocking, and final session summarization.

---

## 2. Call Session Entity (`CallSession`)

Located in `backend/platform/db/models.py`:

```python
class CallSession(Base):
    __tablename__ = "call_sessions"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    session_id = Column(String(64), unique=True, nullable=False, index=True)
    org_id = Column(String(36), ForeignKey("organizations.id"), nullable=False, index=True)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=True, index=True)
    caller_number = Column(String(32), nullable=True)
    caller_name = Column(String(128), nullable=True)
    claimed_speaker_id = Column(String(64), nullable=True)
    claimed_identity_id = Column(String(36), ForeignKey("protected_identities.id"), nullable=True)
    status = Column(String(32), default="ACTIVE", index=True)  # ACTIVE, ENDED, TERMINATED_BY_SECURITY
    current_risk_score = Column(Float, default=0.0)
    current_risk_level = Column(String(16), default="SAFE")
    accumulated_transcript = Column(Text, default="")
    total_chunks = Column(Integer, default=0)
    total_audio_seconds = Column(Float, default=0.0)
    total_speech_seconds = Column(Float, default=0.0)
    start_time = Column(DateTime, default=utcnow, nullable=False)
    end_time = Column(DateTime, nullable=True)
```

---

## 3. Lifecycle Operations

### 3.1 Session Creation (`start_call_session`)
```python
def start_call_session(
    self,
    org_id: str,
    session_id: Optional[str] = None,
    user_id: Optional[str] = None,
    caller_number: Optional[str] = None,
    caller_name: Optional[str] = None,
    claimed_speaker_id: Optional[str] = None,
) -> CallSession:
```
- Generates a UUID `session_id` if omitted.
- Checks if `claimed_speaker_id` corresponds to an enrolled `ProtectedIdentity`. If found, binds `claimed_identity_id`.
- Initializes a new streaming session in Member 1's AI pipeline: `self.ai_adapter.start_streaming_session(session_id, claimed_speaker_id)`.
- Persists the new `CallSession` in the database with status `ACTIVE`.
- Records an audit log row with `event_type="CALL_STARTED"`.

### 3.2 Chunk Ingestion & Risk Tracking (`process_stream_chunk`)
- Receives binary audio buffer and sequential `chunk_id`.
- Forwards to `AIAdapter.process_chunk()`.
- Updates `CallSession`:
  - Increments `total_chunks`.
  - Updates `current_risk_score` and `current_risk_level`.
  - Appends spoken text to `accumulated_transcript`.
- Persists a new `RiskEvent` row tied to `session_id`.

### 3.3 Session Termination (`end_call_session`)
```python
async def end_call_session(self, session_id: str, reason: str = "NORMAL_HANGUP") -> CallSummaryDto:
```
- Queries active `CallSession`.
- Calls Member 1 pipeline `end_session(session_id)` to extract final metrics (`total_audio_seconds`, `total_speech_seconds`, `mean_latency_ms`, `mean_rtf`).
- Updates `CallSession.status = "TERMINATED_BY_SECURITY"` if blocked, or `"ENDED"`.
- Records `end_time = utcnow()`.
- Pushes `CALL_ENDED` event with `CallEndedPayload` over the call WebSocket.
- Cleans up in-memory WebSocket references in `AlertDispatcher`.
- Returns `CallSummaryDto` to caller.

---

## 4. Source Files Covered
- `backend/platform/services/orchestrator.py`
- `backend/platform/server/routes/calls.py`
- `backend/platform/db/models.py`
- `backend/platform/schemas/calls.py`
