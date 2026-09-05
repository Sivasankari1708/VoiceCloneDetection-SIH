# Testing: Manual Verification & Reproduction Guide

This document provides step-by-step instructions for developers, evaluators, and judges to manually reproduce and inspect the Member 2 Backend Platform.

---

## 1. Prerequisites & Server Startup

1. **Activate Virtual Environment**:
   ```bash
   source .venv/bin/activate
   ```
2. **Launch Live Server**:
   ```bash
   uvicorn backend.platform.server.app:app --host 0.0.0.0 --port 8000 --reload
   ```
3. **Verify Health Endpoint**:
   Open browser or run curl:
   ```bash
   curl http://localhost:8000/api/health
   ```
   **Expected Response**:
   ```json
   {
     "status": "healthy",
     "database_connected": true,
     "ai_pipeline_loaded": true
   }
   ```

---

## 2. Interactive Swagger UI Verification

Navigate to `http://localhost:8000/docs` in your browser.

### Step 1: Authenticate as Security Operator
1. Scroll to `POST /api/auth/login`.
2. Click **Try it out** and execute with body:
   ```json
   {
     "username": "operator",
     "password": "operator123"
   }
   ```
3. Copy the returned `access_token` string.
4. Click the green **Authorize** button at the top of the Swagger page.
5. Paste the token into the **Value** field and click **Authorize**. *(Note: `HTTPBearer` handles the `Bearer ` prefix automatically).*

### Step 2: Inspect Seeded Protected CFO Identity
1. Execute `GET /api/protected-identities`.
2. Observe seeded CFO record:
   ```json
   [
     {
       "id": "vip_cfo_001",
       "full_name": "David Vance",
       "title": "Chief Financial Officer",
       "risk_priority": "CRITICAL",
       "speaker_id": "LA_0069",
       "is_enrolled": true
     }
   ]
   ```

### Step 3: Inspect Incidents & Audit Logs
1. Execute `GET /api/incidents` to review detected voice cloning incidents.
2. Execute `GET /api/audit-logs` to inspect the chronological compliance trail.

---

## 3. Running the Automated 11-Check Validation Script

Execute the standalone validation script:
```bash
python3 scratch/validate_all_11.py
```
This runs all 11 live verification checks against the running server and outputs the step-by-step PASS/FAIL report.
