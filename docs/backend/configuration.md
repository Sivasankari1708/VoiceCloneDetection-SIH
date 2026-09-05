# Configuration & Environment Management

## 1. File Location & Purpose
- **Primary Source File**: `backend/platform/config.py`
- **Purpose**: Defines strongly-typed platform configuration variables, database connection strings, JWT cryptographic parameters, and baseline risk thresholds loaded from environment variables with sensible defaults.

---

## 2. Configuration Schema (`PlatformConfig`)

Located in `backend/platform/config.py`:

```python
@dataclass(frozen=True)
class PlatformConfig:
    # Server & Runtime
    app_name: str = "VoiceCloneDetection-Platform"
    app_version: str = "1.0.0"
    debug: bool = False

    # Database
    database_url: str = field(
        default_factory=lambda: os.getenv(
            "DATABASE_URL",
            "postgresql+asyncpg://postgres:postgres@localhost:5432/voice_clone_db",
        )
    )
    database_sync_url: str = field(
        default_factory=lambda: os.getenv(
            "DATABASE_SYNC_URL",
            "sqlite:///./voice_clone_detection.db",
        )
    )

    # Security & Authentication
    jwt_secret: str = field(
        default_factory=lambda: os.getenv(
            "JWT_SECRET",
            "super-secret-sih-hackathon-key-change-in-production",
        )
    )
    jwt_algorithm: str = "HS256"
    jwt_expiration_minutes: int = 1440  # 24 hours

    # Baseline Risk Engine Defaults
    default_high_risk_threshold: float = 70.0
    default_critical_risk_threshold: float = 85.0
    default_synthetic_threshold: float = 0.50
    default_speaker_similarity_threshold: float = 0.70

    # Auto Mitigation Policies
    auto_block_critical_clones: bool = False
```

---

## 3. Environment Variables Reference

| Variable Name | Type | Default Value | Description |
|---|---|---|---|
| `DATABASE_URL` | String | `postgresql+asyncpg://postgres:postgres@localhost:5432/voice_clone_db` | Primary async connection string for PostgreSQL |
| `DATABASE_SYNC_URL` | String | `sqlite:///./voice_clone_detection.db` | Synchronous connection string for SQLAlchemy migrations and fallback |
| `JWT_SECRET` | String | `super-secret-sih-hackathon-key-change-in-production` | Secret key used for signing JWT bearer tokens |
| `JWT_ALGORITHM` | String | `HS256` | Cryptographic algorithm for JWT encoding/decoding |
| `JWT_EXPIRATION_MINUTES` | Integer | `1440` | Token validity duration in minutes |
| `DEFAULT_HIGH_RISK_THRESHOLD` | Float | `70.0` | Risk score threshold to trigger high-risk alerts |
| `DEFAULT_CRITICAL_RISK_THRESHOLD`| Float | `85.0` | Risk score threshold to trigger critical incidents |
| `DEFAULT_SYNTHETIC_THRESHOLD` | Float | `0.50` | Threshold above which speech is classified as synthetic |
| `DEFAULT_SPEAKER_SIMILARITY_THRESHOLD` | Float | `0.70` | Threshold above which speaker is verified as authentic |

---

## 4. Source Files Covered
- `backend/platform/config.py`
