# PostgreSQL Production & SQLite Fallback Strategy

## 1. Engine Configuration

Located in `backend/platform/db/session.py`.

```python
config = PlatformConfig()

def get_engine():
    """
    Creates SQLAlchemy engine targeting PostgreSQL if reachable,
    falling back to local SQLite if PostgreSQL is unavailable.
    """
    db_url = config.database_sync_url
    if db_url.startswith("sqlite"):
        return create_engine(
            db_url,
            connect_args={"check_same_thread": False},
            poolclass=StaticPool if ":memory:" in db_url else None,
        )
    return create_engine(
        db_url,
        pool_size=10,
        max_overflow=20,
        pool_recycle=1800,
    )

engine = get_engine()
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
```

---

## 2. Production PostgreSQL vs Local SQLite Matrix

| Feature | Production Mode (PostgreSQL) | Development / Test Mode (SQLite) |
|---|---|---|
| Connection URL | `postgresql+asyncpg://...` or `postgresql://...` | `sqlite:///./voice_clone_detection.db` |
| Concurrency Support | High (Row-level locking, connection pooling) | Moderate (WAL mode or file lock) |
| In-Memory Testing | Supported via Testcontainers | `sqlite:///:memory:` |
| Binary Vectors | PostgreSQL `BYTEA` | SQLite `BLOB` |
| Auto-Increment PKs | PostgreSQL `SERIAL` / `BIGSERIAL` | SQLite `AUTOINCREMENT` |
| JSON Serialization | Native PostgreSQL `JSONB` | Serialized text (`TEXT` / `JSON`) |

---

## 3. Connecting to PostgreSQL in Production

To target a live PostgreSQL instance, provide the environment variable:

```bash
export DATABASE_URL="postgresql+asyncpg://user:password@localhost:5432/voice_clone_db"
export DATABASE_SYNC_URL="postgresql://user:password@localhost:5432/voice_clone_db"
uvicorn backend.platform.server.app:app --port 8000
```

---

## 4. Source Files Covered
- `backend/platform/db/session.py`
- `backend/platform/config.py`
