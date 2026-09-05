# Module: Pydantic Data Transfer Objects (Schemas) Overview

**Package**: `backend.platform.schemas`

---

## 1. Module Overview & Responsibilities

The `schemas` package defines the strongly-typed Pydantic request and response models across REST endpoints and real-time WebSocket communication channels.

---

## 2. Schema Catalog by Domain

### 2.1 Authentication & RBAC (`auth.py`)
- `RoleEnum`: Defines string roles `USER`, `SECURITY_OPERATOR`, `ADMIN`.
- `LoginRequest`:
  - `username: str`: User handle or email.
  - `password: str`: Plaintext credential.
- `UserDto`:
  - `id: str`, `org_id: str`, `username: str`, `email: str`, `full_name: str`, `role: str`, `is_active: bool`, `created_at: Optional[str]`.
- `UserCreateDto`: Model for account creation.
- `TokenResponse`: Returns `access_token`, `token_type = "bearer"`, `expires_in_minutes`, and `user: UserDto`.

### 2.2 Call Sessions (`calls.py`)
- `CallStartRequest`: Accepts `session_id`, `caller_number`, `caller_name`, and `claimed_speaker_id`.
- `CallEndRequest`: Accepts termination `reason` (`NORMAL_HANGUP`, `USER_HANGUP`, `SECURITY_BLOCKED`).
- `CallSessionDto`: Full state representation of a call session including total speech seconds, peak risk, and final verdict.
- `CallSummaryDto`: Summary payload computed at session completion.

### 2.3 Real-Time WebSocket Events (`events.py`)
- `WebSocketEventType` (Enum): `CALL_STARTED`, `RISK_UPDATE`, `USER_SECURITY_ALERT`, `ORGANIZATION_SECURITY_ALERT`, `INCIDENT_CREATED`, `INCIDENT_UPDATED`, `SECURITY_ACTION`, `CALL_ENDED`, `ERROR`.
- `BaseWebSocketMessage`: Generic message envelope with `event`, `timestamp`, and `data`.
- `RiskUpdatePayload`: High-resolution per-chunk telemetry with acoustic probabilities, biometric similarity, speech recognition transcripts, and detected intents.
- `UserSecurityAlertPayload`: Immediate caller security banner payload.
- `OrganizationSecurityAlertPayload`: Incident broadcast payload delivered to SOC operator dashboards.
- `IncidentEventPayload`: Incident state update event.
- `SecurityActionPayload`: Operator mitigation notification.
- `CallEndedPayload`: Final summary packet.

### 2.4 Security Incidents & Mitigations (`incidents.py`)
- `IncidentActionRequest`: Operator action submission (`action_type`, optional `notes`).
- `IncidentUpdateDto`: Patch update for status and notes.
- `SecurityActionDto`: Persisted response action.
- `IncidentDto`: Comprehensive incident forensic breakdown with nested list of `actions`.
- `IncidentFilterParams`: Query filter schema.

### 2.5 Protected Identities & Biometrics (`protected_identities.py`)
- `ProtectedIdentityCreateDto`: Identity registration payload (`full_name`, `title`, `department`, `risk_priority`, `speaker_id`).
- `ProtectedIdentityDto`: Identity profile record including `is_enrolled` flag.
- `EnrollmentRequestDto`: List of audio clips (Base64 or server file paths).
- `EnrollmentResponseDto`: Enrollment outcome containing `success`, `accepted_samples`, `consistency_score`, and `quality_warnings`.

### 2.6 Security Policies (`policies.py`)
- `SecurityPolicyDto`: Thresholds (`risk_score_high_threshold`, `risk_score_critical_threshold`), automation flags (`auto_warn_user_on_high`, `auto_alert_org_on_high`, `auto_block_on_critical_clone`), VIP rules, and sensitive intent escalation.
- `PolicyUpdateDto`: Optional fields for updating tenant policies.

### 2.7 Forensic Audit Logs (`audit.py`)
- `AuditLogDto`: Forensic audit log model (`id`, `org_id`, `actor_id`, `session_id`, `event_type`, `ip_address`, `details`, `timestamp`).

### 2.8 Tenant Organizations (`organizations.py`)
- `OrganizationCreateDto`: Tenant creation payload (`name`, `code`).
- `OrganizationDto`: Public organization view.

---

## 3. Source Files Covered

- [`backend/platform/schemas/auth.py`](file:///Users/dhurgadevi/Documents/GitHub/VoiceCloneDetection-SIH/backend/platform/schemas/auth.py)
- [`backend/platform/schemas/calls.py`](file:///Users/dhurgadevi/Documents/GitHub/VoiceCloneDetection-SIH/backend/platform/schemas/calls.py)
- [`backend/platform/schemas/events.py`](file:///Users/dhurgadevi/Documents/GitHub/VoiceCloneDetection-SIH/backend/platform/schemas/events.py)
- [`backend/platform/schemas/incidents.py`](file:///Users/dhurgadevi/Documents/GitHub/VoiceCloneDetection-SIH/backend/platform/schemas/incidents.py)
- [`backend/platform/schemas/protected_identities.py`](file:///Users/dhurgadevi/Documents/GitHub/VoiceCloneDetection-SIH/backend/platform/schemas/protected_identities.py)
- [`backend/platform/schemas/policies.py`](file:///Users/dhurgadevi/Documents/GitHub/VoiceCloneDetection-SIH/backend/platform/schemas/policies.py)
- [`backend/platform/schemas/audit.py`](file:///Users/dhurgadevi/Documents/GitHub/VoiceCloneDetection-SIH/backend/platform/schemas/audit.py)
- [`backend/platform/schemas/organizations.py`](file:///Users/dhurgadevi/Documents/GitHub/VoiceCloneDetection-SIH/backend/platform/schemas/organizations.py)
