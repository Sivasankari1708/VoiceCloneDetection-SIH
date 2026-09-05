# Incident Management: Triage, Investigation & Case Handling

## 1. Incident Lifecycle

The `SecurityIncident` entity in `backend/platform/db/models.py` serves as the core investigative artifact for security operators:

```
Detection (Risk >= HIGH)
       │
       ▼
Incident Opened (status="OPEN")
       │
       ▼
Operator Review (status="UNDER_REVIEW")
       │
       ├── Case A: Impersonation Validated -> (status="CONFIRMED_ATTACK")
       │                                           │
       │                                           ▼
       │                                    Action: BLOCK_CALL
       │
       └── Case B: Erroneous Classification -> (status="FALSE_POSITIVE")
       │
       ▼
Incident Closed (status="RESOLVED", resolved_at=utcnow())
       │
       ▼
Audit Record Committed
```

---

## 2. Incident Statuses & Transitions

| Status | Meaning | Permitted Transitions | Set By |
|---|---|---|---|
| `OPEN` | New threat flagged by PolicyEngine | `UNDER_REVIEW`, `CONFIRMED_ATTACK`, `FALSE_POSITIVE` | System (Automated) |
| `UNDER_REVIEW` | Assigned to operator for analysis | `CONFIRMED_ATTACK`, `FALSE_POSITIVE`, `RESOLVED` | Operator (`PATCH /incidents/{id}`) |
| `CONFIRMED_ATTACK` | Validated voice clone or imposter threat | `RESOLVED` | Operator (`POST /incidents/{id}/action`) |
| `FALSE_POSITIVE` | Benign audio misclassified | `RESOLVED` | Operator (`POST /incidents/{id}/action`) |
| `RESOLVED` | Case concluded and mitigated | None (Terminal) | Operator (`POST /incidents/{id}/action`) |

---

## 3. Incident Data Elements
- `incident_id`: Unique external tracking identifier (`inc_...`).
- `severity`: `HIGH` or `CRITICAL`.
- `scenario`: Identified attack profile (`AI_CLONE_ENROLLED_SPEAKER`, `DIFFERENT_GENUINE_SPEAKER`, `UNKNOWN_AI_VOICE`).
- `claimed_identity`: Speaker ID or VIP identity claimed during the call.
- `synthetic_probability`: Maximum recorded deepfake score.
- `speaker_similarity`: Minimum recorded cosine similarity against VIP reference.
- `intent`: Flagged social engineering intent category.
- `reasons_json`: Full audit trail of justifications explaining why the incident was opened.
- `recommended_action`: System-suggested response (`BLOCK_CALL`, `REQUIRE_ADDITIONAL_VERIFICATION`).
- `operator_id` & `operator_notes`: Human notes added during investigation.

---

## 4. Source Files Covered
- `backend/platform/db/models.py`
- `backend/platform/services/orchestrator.py`
- `backend/platform/server/routes/incidents.py`
- `backend/platform/schemas/incidents.py`
