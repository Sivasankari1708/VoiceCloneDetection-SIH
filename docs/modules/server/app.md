# Module: Server Application Factory

**File**: [`backend/platform/server/app.py`](file:///Users/dhurgadevi/Documents/GitHub/VoiceCloneDetection-SIH/backend/platform/server/app.py)  
**Package**: `backend.platform.server`

---

## 1. Module Purpose & Responsibilities

`app.py` is the central FastAPI application factory and entry point for the Member 2 Backend Platform. It coordinates startup initialization, database table creation, initial demo seed data population, AI model pre-warming, CORS configuration, and mounting of all REST and WebSocket route controllers.

### Key Responsibilities
- **Lifespan Management**: Initializes database schema and pre-warms Member 1 AI models on server startup.
- **Demo Data Seeding**: Populates `DEMO_CORP`, three default users (`admin`, `operator`, `employee`), a default `SecurityPolicy`, and a protected VIP CFO profile (`David Vance`, `LA_0069`).
- **CORS Middleware**: Implements cross-origin resource sharing controls per `platform_config.cors_origins`.
- **Router Composition**: Registers 9 REST routers and 1 WebSocket router.
- **Server Instance**: Exposes the root ASGI `app` callable for `uvicorn`.

---

## 2. Dependencies & Imports

- **FastAPI Core**: `FastAPI`, `CORSMiddleware`, `contextlib.asynccontextmanager`
- **Database**: `SessionLocal`, `init_db` from [`backend.platform.db.session`](file:///Users/dhurgadevi/Documents/GitHub/VoiceCloneDetection-SIH/backend/platform/db/session.py)
- **SQLAlchemy Models**: `Organization`, `ProtectedIdentity`, `SecurityPolicy`, `User` from [`backend.platform.db.models`](file:///Users/dhurgadevi/Documents/GitHub/VoiceCloneDetection-SIH/backend/platform/db/models.py)
- **Configuration**: `platform_config` from [`backend.platform.config`](file:///Users/dhurgadevi/Documents/GitHub/VoiceCloneDetection-SIH/backend/platform/config.py)
- **AI Integration**: `AIAdapter` from [`backend.platform.services.ai_adapter`](file:///Users/dhurgadevi/Documents/GitHub/VoiceCloneDetection-SIH/backend/platform/services/ai_adapter.py)
- **Security**: `hash_password` from [`backend.platform.services.auth_service`](file:///Users/dhurgadevi/Documents/GitHub/VoiceCloneDetection-SIH/backend/platform/services/auth_service.py)
- **Route Modules**:
  - `health_router` (`/api/health`, `/api/stats`)
  - `auth_router` (`/api/auth`)
  - `org_router` (`/api/organizations`)
  - `protected_identities_router` (`/api/protected-identities`)
  - `calls_router` (`/api/calls`)
  - `incidents_router` (`/api/incidents`)
  - `policies_router` (`/api/policies`)
  - `audit_router` (`/api/audit-logs`)
  - `analyze_router` (`/api/analyze`)
  - `websocket_router` (`/ws/stream/{session_id}`, `/ws/org/{org_id}/alerts`)

---

## 3. Functions & Lifespan

### `seed_demo_data(db: Session) -> None`
- **Purpose**: Checks if demo tenant `DEMO_CORP` exists. If missing, creates the default tenant organization, three role-differentiated accounts, a default security policy, and an enrolled executive VIP CFO.
- **Seeded Entities**:
  1. `Organization`: `id="org_demo_001"`, `code="DEMO_CORP"`, `name="Apex Financial Corp (Demo)"`
  2. `SecurityPolicy`: Default thresholds (`high=65.0`, `critical=85.0`, `auto_warn_user_on_high=true`)
  3. `User` (Admin): `id="user_admin_001"`, `username="admin"`, `role="ADMIN"`, password `admin123`
  4. `User` (Operator): `id="user_operator_001"`, `username="operator"`, `role="SECURITY_OPERATOR"`, password `operator123`
  5. `User` (Employee): `id="user_employee_001"`, `username="employee"`, `role="USER"`, password `employee123`
  6. `ProtectedIdentity`: `id="vip_cfo_001"`, `full_name="David Vance"`, `title="Chief Financial Officer"`, `speaker_id="LA_0069"`

### `lifespan(app: FastAPI)`
- **Decorator**: `@contextlib.asynccontextmanager`
- **Workflow**:
  1. Invokes `init_db()` to create SQLite/PostgreSQL schema.
  2. Opens database session and calls `seed_demo_data(db)`.
  3. Calls `AIAdapter.get_instance()` to load Silero VAD, DeepfakeCNN v2, SpeechBrain ECAPA-TDNN, Whisper, and RiskEngine into memory before serving requests.
  4. Yields control to FastAPI request handling loop.
  5. On shutdown, logs termination cleanly.

### `create_app() -> FastAPI`
- **Purpose**: Factory function building the fully configured FastAPI app instance with metadata, CORS middleware, and attached routers.
- **Return**: `FastAPI` application instance.

---

## 4. Module Relationships

```
[ uvicorn ]
    │
    ▼
app.py (create_app & lifespan)
    ├── init_db() & seed_demo_data()
    ├── AIAdapter.get_instance() (Member 1 AI pre-warming)
    └── Mounts Routers:
        ├── auth_router
        ├── calls_router
        ├── incidents_router
        ├── protected_identities_router
        ├── policies_router
        ├── audit_router
        ├── health_router
        ├── analyze_router
        └── websocket_router
```

---

## 5. Source Files Covered

- [`backend/platform/server/app.py`](file:///Users/dhurgadevi/Documents/GitHub/VoiceCloneDetection-SIH/backend/platform/server/app.py)
