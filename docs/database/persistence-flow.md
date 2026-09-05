# Persistence Flow: Transactions & Session Lifecycle

## 1. Database Session Lifecycle

Located in `backend/platform/db/session.py`.

The platform implements the standard FastAPI Dependency Injection pattern for database sessions:

```python
def get_db() -> Generator[Session, None, None]:
    """
    FastAPI dependency yielding a thread-local database session.
    Closes the session after request completion.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
```

---

## 2. Transaction Handling Across Scenarios

### 2.1 Synchronous REST Handlers
- Handlers receive `db: Session = Depends(get_db)`.
- Operations (`db.add()`, `db.flush()`) occur within the request transaction.
- Explicit `db.commit()` commits changes. If an exception occurs, FastAPI's exception handler aborts the transaction and `finally: db.close()` rolls it back.

### 2.2 Streaming WebSocket Ingestion
- In `process_stream_chunk()` inside `SecurityOrchestrator`:
  1. Opens or uses injected `self.db`.
  2. Inserts `RiskEvent`.
  3. Updates or creates `SecurityIncident`.
  4. Updates `CallSession` status and counters.
  5. Commits in a single atomic transaction: `self.db.commit()`.
  6. If persistence fails, logs error without dropping the live WebSocket audio stream.

---

## 3. Seed Data Injection (`seed_demo_data`)

On startup, `seed_demo_data()` executes an idempotent seeding routine:
- Checks if `Organization` with `code="DEMO_CORP"` exists. If missing:
  - Creates `Organization(id="org_demo_001", name="Demo Enterprise Corp", code="DEMO_CORP")`.
  - Creates default `SecurityPolicy`.
  - Creates `admin`, `operator`, `employee` accounts with pre-hashed passwords.
  - Creates `ProtectedIdentity(id="vip_cfo_001", speaker_id="LA_0069", full_name="David Vance", title="Chief Financial Officer")`.
  - Commits to database.

---

## 4. Source Files Covered
- `backend/platform/db/session.py`
- `backend/platform/services/orchestrator.py`
