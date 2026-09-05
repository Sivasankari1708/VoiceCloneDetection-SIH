# Operations: Troubleshooting & Diagnostic Guide

This document outlines common operational issues, diagnostics, and remediation procedures for the Member 2 Backend Platform.

---

## 1. Common Issues & Solutions

### 1.1 "Authentication credentials were not provided" (401 Unauthorized)
- **Cause**: The client omitted the `Authorization: Bearer <token>` HTTP header, or supplied an invalid format.
- **Swagger Note**: In the interactive Swagger UI (`/docs`), entering only the raw token string (e.g. `eyJ...`) is required. Entering `Bearer eyJ...` causes duplicate `Bearer Bearer ...` prefixes.
- **Fix**: Re-authenticate via `POST /api/auth/login` and provide the raw access token string.

### 1.2 "Access denied: Requires role in [...]" (403 Forbidden)
- **Cause**: An authenticated user attempted to access an administrative or operator endpoint (e.g., an employee trying to fetch `/api/incidents` or `/api/policies`).
- **Fix**: Ensure the client logs in with the appropriate role credentials (e.g., `operator` or `admin`).

### 1.3 WebSocket Connection Dropped Immediately
- **Cause 1**: Malformed `session_id` or connecting before session registration.
- **Cause 2**: Attempting to connect to `/ws/org/{org_id}/alerts` without supplying the `?token=<access_token>` query parameter or passing a token without `SECURITY_OPERATOR` role.
- **Fix**: Verify session was created via `POST /api/calls` and ensure operator tokens are passed in query params.

### 1.4 High Audio Processing Latency ($> 1.0\text{ s}$)
- **Cause**: Running Whisper or ECAPA-TDNN on severely constrained CPU hardware with multiple concurrent audio streams.
- **Fix**: Adjust `chunk_duration_ms` or run on multi-core CPU instances.

---

## 2. Health & Telemetry Diagnostics

Inspect real-time health using:
```bash
curl http://localhost:8000/api/health
```
If `status` is `"degraded"`:
- Check if `database_connected` is `false`: Verify `DATABASE_URL` connectivity and file permissions.
- Check if `ai_pipeline_loaded` is `false`: Verify Member 1 model weights exist under `weights/deepfake_detector/best_model.pt`.
