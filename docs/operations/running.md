# Operations: Running the Server & Services

This document details how to start, monitor, and run the Member 2 Backend Platform and its background services.

---

## 1. Starting the Platform Gateway

To launch the backend platform in development or demonstration mode:

```bash
uvicorn backend.platform.server.app:app --host 0.0.0.0 --port 8000 --reload
```

### Startup Logs
When launched, the server executes the lifespan context and outputs:
```text
INFO:     Started server process [pid]
INFO:     Waiting for application startup.
INFO:     Starting VoiceCloneDetection-SIH Platform Gateway...
INFO:     Initializing database schema at sqlite:///./voice_clone_detection.db...
INFO:     Database schema initialized successfully.
INFO:     [Seed] Demo organization, users (admin, operator, employee), and protected CFO created.
INFO:     [AIAdapter] Initializing AI adapter wrapping Member 1 pipelines...
INFO:     [AIAdapter] Member 1 models and streaming pipeline initialized successfully.
INFO:     VoiceCloneDetection-SIH Platform ready to serve requests.
INFO:     Application startup complete.
INFO:     Uvicorn running on http://0.0.0.0:8000 (Press CTRL+C to quit)
```

---

## 2. Seed Accounts & Credentials

The startup routine automatically provisions a demo tenant and three role-differentiated accounts:

| Username | Password | Role | Organization Code | Purpose |
| :--- | :--- | :--- | :--- | :--- |
| `admin` | `admin123` | `ADMIN` | `DEMO_CORP` | System administration & policy tuning |
| `operator` | `operator123` | `SECURITY_OPERATOR` | `DEMO_CORP` | SOC dashboard triage & mitigations |
| `employee` | `employee123` | `USER` | `DEMO_CORP` | Call client recipient & audio streaming |

---

## 3. Production Deployment Considerations

For production deployments behind a reverse proxy (NGINX, Caddy, or AWS ALB):
- Run multiple Uvicorn workers behind Gunicorn:
  ```bash
  gunicorn backend.platform.server.app:app -w 4 -k uvicorn.workers.UvicornWorker --bind 0.0.0.0:8000
  ```
- Configure an external PostgreSQL database via `DATABASE_URL`.
- Set a secure, random `JWT_SECRET` in the environment.
- Ensure WebSocket timeout limits on reverse proxies are tuned for long-lived streams (e.g. `proxy_read_timeout 3600s`).
