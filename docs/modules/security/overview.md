# Module: Security & Policy Subsystem

**Package**: `backend.platform.services` & `backend.platform.db`

---

## 1. Scope

The Security subsystem comprises:
- **Policy Evaluation**: [`backend/platform/services/policy_engine.py`](file:///Users/dhurgadevi/Documents/GitHub/VoiceCloneDetection-SIH/backend/platform/services/policy_engine.py)
- **Incident Lifecycle & Mitigation**: Handled via `SecurityOrchestrator` in [`backend/platform/services/orchestrator.py`](file:///Users/dhurgadevi/Documents/GitHub/VoiceCloneDetection-SIH/backend/platform/services/orchestrator.py)
- **Multi-Tenant Isolation**: Enforced across models in [`backend/platform/db/models.py`](file:///Users/dhurgadevi/Documents/GitHub/VoiceCloneDetection-SIH/backend/platform/db/models.py)
- **Audit Logging**: Recorded in `audit_logs` table via `SecurityOrchestrator`

For in-depth architectural and operational guides, refer to:
- [Security Policy Engine Documentation](file:///Users/dhurgadevi/Documents/GitHub/VoiceCloneDetection-SIH/docs/security/policy-engine.md)
- [Risk Orchestration](file:///Users/dhurgadevi/Documents/GitHub/VoiceCloneDetection-SIH/docs/security/risk-orchestration.md)
- [Incident Management & Deduplication](file:///Users/dhurgadevi/Documents/GitHub/VoiceCloneDetection-SIH/docs/security/incident-deduplication.md)
- [Security Actions](file:///Users/dhurgadevi/Documents/GitHub/VoiceCloneDetection-SIH/docs/security/security-actions.md)
- [Audit Logging](file:///Users/dhurgadevi/Documents/GitHub/VoiceCloneDetection-SIH/docs/security/audit-logging.md)
- [Tenant Isolation](file:///Users/dhurgadevi/Documents/GitHub/VoiceCloneDetection-SIH/docs/security/tenant-isolation.md)
