# Database Architecture Overview

## 1. Role & Persistence Philosophy

The database layer serves as the persistent system of record for the entire enterprise security platform. It provides:
1. **Multi-Tenant Organization Isolation**: Every record is scoped to an `org_id`.
2. **Biometric Privacy Safeguards**: Stores 192-D numerical speaker embeddings without saving raw acoustic voice audio.
3. **Session & Incident State Tracking**: Maintains the real-time status of all inbound calls and security incidents.
4. **Immutable Audit History**: Preserves an append-only audit trail of security alerts and operator mitigation actions.

---

## 2. Storage Engine Strategy: PostgreSQL & SQLite Fallback

Located in `backend/platform/db/session.py`.

The platform implements a resilient dual-engine strategy:
- **Primary Engine**: PostgreSQL (`postgresql+asyncpg://...` or `psycopg2`).
- **Development & Test Fallback**: Zero-configuration local SQLite (`sqlite:///./voice_clone_detection.db` or `sqlite:///:memory:`).
- **Automated Fallback Logic**: `init_db()` attempts connection to the configured database. If a PostgreSQL daemon is unreachable during local development or test runs, the system automatically falls back to SQLite without crashing.

---

## 3. Entity Inventory Summary

| Entity Model | Table Name | Purpose | Primary Key | Parent Entity |
|---|---|---|---|---|
| `Organization` | `organizations` | Tenant root | `id` (UUID) | None |
| `User` | `users` | User credentials & RBAC | `id` (UUID) | `organizations` |
| `ProtectedIdentity` | `protected_identities` | VIP identity registry | `id` (UUID) | `organizations` |
| `SpeakerProfileModel`| `speaker_profiles` | Biometric embedding vector | `id` (UUID) | `protected_identities` |
| `CallSession` | `call_sessions` | Call session state | `id` (UUID) | `organizations` |
| `RiskEvent` | `risk_events` | Per-chunk telemetry log | `id` (Integer) | `call_sessions` |
| `SecurityIncident` | `security_incidents` | Tracked security cases | `id` (UUID) | `organizations` |
| `SecurityAction` | `security_actions` | Operator mitigation actions | `id` (UUID) | `security_incidents` |
| `SecurityPolicy` | `security_policies` | Org-level risk thresholds | `id` (UUID) | `organizations` |
| `AuditLog` | `audit_logs` | Immutable security audit | `id` (UUID) | `organizations` |

---

## 4. Source Files Covered
- `backend/platform/db/models.py`
- `backend/platform/db/session.py`
- `backend/platform/db/speaker_repo_adapter.py`
