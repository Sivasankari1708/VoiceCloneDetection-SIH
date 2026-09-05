# Backend Server Architecture: FastAPI & Uvicorn

## 1. File Location & Purpose
- **Source File**: `backend/platform/server/app.py`
- **Purpose**: Instantiates and configures the core FastAPI application, establishes CORS policies, coordinates startup and shutdown lifecycles, mounts modular REST routers, registers WebSocket endpoints, and triggers automated database seeding.

---

## 2. Server Initialization & Lifespan

### 2.1 Lifespan Context Manager (`lifespan`)
```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup logic
    log.info("[Platform] Initializing database schema...")
    init_db()
    log.info("[Platform] Seeding default organization, demo accounts, and CFO identity...")
    seed_demo_data()
    log.info("[Platform] Pre-loading Member 1 AI models into singleton adapter...")
    AIAdapter.get_instance()
    log.info("[Platform] Server startup complete. Ready for real-time traffic.")
    yield
    # Shutdown logic
    log.info("[Platform] Server shutting down. Cleaning active WebSocket sessions...")
```

### Key Operations Executed on Startup:
1. `init_db()`: Initializes SQLAlchemy metadata and creates tables if they do not exist.
2. `seed_demo_data()`: Creates default organization `DEMO_CORP` (`org_demo_001`), default users (`admin`, `operator`, `employee`), default security policy, and seeds protected identity David Vance (CFO, speaker `LA_0069`).
3. `AIAdapter.get_instance()`: Eagerly pre-loads Member 1 PyTorch models (Silero VAD, DeepfakeCNN v2, SpeechBrain ECAPA-TDNN, Faster-Whisper, IntentDetector) into memory to eliminate cold-start latency on the first call.

---

## 3. Middleware & Security Configuration

### CORS Configuration
```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```
- Configured to allow all origins during local hackathon prototyping, enabling Member 3 (Employee UI) and Member 4 (SOC UI) to run on Vite/React development ports (`http://localhost:3000`, `http://localhost:5173`, etc.) without cross-origin blocks.

---

## 4. Router Mounting Inventory

All REST API sub-routers are mounted with standard `/api` prefixes:
- `app.include_router(auth_router, prefix="/api/auth", tags=["Authentication"])`
- `app.include_router(org_router, prefix="/api/organizations", tags=["Organizations"])`
- `app.include_router(identities_router, prefix="/api/protected-identities", tags=["Protected Identities"])`
- `app.include_router(calls_router, prefix="/api/calls", tags=["Call Sessions"])`
- `app.include_router(incidents_router, prefix="/api/incidents", tags=["Security Incidents"])`
- `app.include_router(policies_router, prefix="/api/policies", tags=["Security Policies"])`
- `app.include_router(audit_router, prefix="/api/audit-logs", tags=["Audit Logging"])`
- `app.include_router(health_router, prefix="/api", tags=["Health & Statistics"])`
- `app.include_router(analyze_router, prefix="/api", tags=["Batch Analysis"])`
- `app.include_router(ws_router, tags=["WebSocket Streaming & Alerts"])`

---

## 5. Execution Command
```bash
uvicorn backend.platform.server.app:app --host 0.0.0.0 --port 8000 --reload
```

---

## 6. Source Files Covered
- `backend/platform/server/app.py`
- `backend/platform/db/session.py`
- `backend/platform/services/ai_adapter.py`
