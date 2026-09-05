# Integration: Member 3 (Employee UI) Contract

This document specifies the exact API and WebSocket interface required by Member 3 to build the Employee / Call Recipient interface.

---

## 1. Overview of Member 3 Role

Member 3 builds the client-side employee calling screen. This interface allows employees to answer incoming calls, stream microphone audio to the backend, observe real-time risk gauges, receive instant clone warning alerts, and view live transcripts.

---

## 2. API Lifecycle for Member 3

### Step 1: Employee Authentication
- **Endpoint**: `POST /api/auth/login`
- **Request Body**:
  ```json
  {
    "username": "employee",
    "password": "employee123"
  }
  ```
- **Response**:
  ```json
  {
    "access_token": "eyJhbGciOiJIUzI1NiIs...",
    "token_type": "bearer",
    "expires_in_minutes": 480,
    "user": {
      "id": "user_employee_001",
      "org_id": "org_demo_001",
      "username": "employee",
      "role": "USER",
      "full_name": "Alice Johnson (Finance)"
    }
  }
  ```
- Store the returned `access_token` in memory or local storage.

---

### Step 2: Register Incoming Call Session
- **Endpoint**: `POST /api/calls`
- **Headers**: `Authorization: Bearer <access_token>`
- **Request Body**:
  ```json
  {
    "caller_number": "+1-555-0199",
    "caller_name": "David Vance (CFO)",
    "claimed_speaker_id": "LA_0069"
  }
  ```
- **Response**:
  ```json
  {
    "session_id": "call-18392193-4921-4f12-b539-712839102938",
    "status": "ACTIVE",
    "claimed_speaker_id": "LA_0069",
    "start_time": "2026-09-05T07:30:00.123456Z"
  }
  ```
- Save `session_id` to open the streaming WebSocket.

---

### Step 3: Connect Streaming WebSocket & Send Audio
- **URL**: `ws://<host>:8000/ws/stream/{session_id}`
- **Audio Format**: Send raw 16 kHz 16-bit PCM binary chunks (or Base64 / WAV) every 1.0 second ($\approx 32,000$ bytes per chunk).
- **Incoming Messages**:
  1. **Telemetry Update**:
     ```json
     {
       "event": "RISK_UPDATE",
       "data": {
         "chunk_id": 1,
         "speech_detected": true,
         "risk_score": 12.0,
         "risk_level": "SAFE",
         "transcript": "Hello Alice, this is David.",
         "verdict": "genuine"
       }
     }
     ```
  2. **Urgent Warning Alert**:
     ```json
     {
       "event": "USER_SECURITY_ALERT",
       "data": {
         "severity": "CRITICAL",
         "risk_score": 98.0,
         "warning_message": "🚨 CRITICAL SECURITY WARNING: Potential AI Voice Clone Impersonation Detected! Do NOT share passwords, OTPs, or transfer funds.",
         "reasons": [
           "CRITICAL: High-confidence voice clone impersonating protected Chief Financial Officer (David Vance)!"
         ]
       }
     }
     ```
  3. **Call Termination by Security**:
     ```json
     {
       "event": "SECURITY_ACTION_DISPATCHED",
       "data": {
         "action_type": "BLOCK_CALL",
         "notes": "Verified fraudulent CFO clone requesting urgent wire transfer."
       }
     }
     ```
     *(The socket will be closed by the server immediately after this event).*

---

### Step 4: Finish Call
- **Endpoint**: `POST /api/calls/{session_id}/finish`
- **Request Body**:
  ```json
  {
    "reason": "USER_HANGUP"
  }
  ```
