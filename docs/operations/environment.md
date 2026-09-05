# Operations: Environment Configuration Reference

This document catalogs all environment variables supported by [`backend/platform/config.py`](file:///Users/dhurgadevi/Documents/GitHub/VoiceCloneDetection-SIH/backend/platform/config.py).

---

## 1. Environment Variable Reference

| Variable Name | Type | Default Value | Description |
| :--- | :--- | :--- | :--- |
| `HOST` | `string` | `"0.0.0.0"` | Network interface to bind the HTTP and WebSocket server. |
| `PORT` | `integer` | `8000` | Port number to listen on. |
| `DEBUG` | `boolean` | `false` | Enables debug mode and verbose log formatting. |
| `CORS_ORIGINS` | `string` | `"*"` | Comma-separated list of allowed CORS origins. |
| `DATABASE_URL` | `string` | `"sqlite:///./voice_clone_detection.db"` | SQLAlchemy connection URI. Supports PostgreSQL and SQLite. |
| `DB_ECHO` | `boolean` | `false` | If true, logs all raw SQL queries to stdout. |
| `JWT_SECRET` | `string` | `"sih_voice_clone_detection_secret_key_..."` | Secret cryptographic key for signing and verifying tokens. |
| `JWT_ALGORITHM` | `string` | `"HS256"` | Symmetric encryption algorithm for PyJWT. |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `integer` | `480` | Token lifetime before expiration (default 8 hours). |
| `TARGET_SAMPLE_RATE` | `integer` | `16000` | Target audio sample rate for neural feature extraction. |
| `DEFAULT_CHUNK_DURATION_MS` | `integer` | `1000` | Chunk duration for streaming inference (1.0 second). |
| `MAX_CHUNK_PAYLOAD_BYTES` | `integer` | `4194304` (4 MB) | Maximum permitted size for individual audio frames. |
| `RISK_SCORE_HIGH_THRESHOLD` | `float` | `65.0` | Default score threshold triggering `HIGH` risk warnings. |
| `RISK_SCORE_CRITICAL_THRESHOLD`| `float` | `85.0` | Default score threshold triggering `CRITICAL` risk alerts. |
| `FAST_ALERT_SYNTHETIC_THRESHOLD`| `float` | `0.85` | Synthetic probability threshold triggering immediate fast alert. |
| `CLONE_DEEPFAKE_THRESHOLD` | `float` | `0.50` | Base deepfake classifier threshold. |
| `SPEAKER_SIMILARITY_THRESHOLD` | `float` | `0.70` | ECAPA-TDNN cosine threshold for speaker identity match. |
| `SPEAKER_STORAGE_DIR` | `string` | `"data/enrolled_speakers"` | Filesystem fallback directory for speaker profiles. |

---

## 2. Sample `.env` File for Production

```ini
HOST=0.0.0.0
PORT=8000
DEBUG=false
CORS_ORIGINS=https://dashboard.apexcorp.com,https://call.apexcorp.com
DATABASE_URL=postgresql://vcd_user:Secr3tP@ss!@postgres-db.internal:5432/vcd_prod
DB_ECHO=false
JWT_SECRET=c29tZV9yZWFsbHlfc3Ryb25nX3JhbmRvbV9zZWNyZXRfa2V5XzIwMjY=
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=480
```
