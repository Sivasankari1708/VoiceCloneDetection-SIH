# Module: Database Engine & Session Management

**File**: [`backend/platform/db/session.py`](file:///Users/dhurgadevi/Documents/GitHub/VoiceCloneDetection-SIH/backend/platform/db/session.py)  
**Package**: `backend.platform.db`

---

## 1. Module Purpose & Responsibilities

`session.py` initializes the SQLAlchemy engine, session maker, base model declarative metadata, and provides the FastAPI request-scoped session generator `get_db`.

---

## 2. Configuration & Engine Initialization

- **Declarative Base**: `Base = declarative_base()`
- **SQLite Concurrency Argument**:
  ```python
  connect_args = {}
  if platform_config.database_url.startswith("sqlite"):
      connect_args["check_same_thread"] = False
  ```
- **Engine Creation**:
  ```python
  engine = create_engine(
      platform_config.database_url,
      connect_args=connect_args,
      echo=platform_config.db_echo,
      pool_pre_ping=True,
  )
  ```
  - `pool_pre_ping=True` ensures stale or severed database connections are transparently recycled.
- **Session Factory**: `SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)`

---

## 3. Functions

### `init_db() -> None`
- **Purpose**: Creates all database tables defined across `backend.platform.db.models`.
- **Called By**: [`backend/platform/server/app.py`](file:///Users/dhurgadevi/Documents/GitHub/VoiceCloneDetection-SIH/backend/platform/server/app.py#L106) during server startup lifespan.

### `get_db() -> Generator[Session, None, None]`
- **Purpose**: Dependency function yielding a transaction-scoped database session.
- **Pattern**:
  ```python
  def get_db() -> Generator[Session, None, None]:
      db = SessionLocal()
      try:
          yield db
      finally:
          db.close()
  ```
  Guarantees that every HTTP or WebSocket request closes its database connection.

---

## 4. Source Files Covered

- [`backend/platform/db/session.py`](file:///Users/dhurgadevi/Documents/GitHub/VoiceCloneDetection-SIH/backend/platform/db/session.py)
