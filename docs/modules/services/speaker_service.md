# Module: Speaker Service & Biometric Enrollment

**File**: [`backend/platform/services/speaker_service.py`](file:///Users/dhurgadevi/Documents/GitHub/VoiceCloneDetection-SIH/backend/platform/services/speaker_service.py)  
**Package**: `backend.platform.services`

---

## 1. Module Purpose & Responsibilities

`SpeakerService` coordinates the biometric enrollment workflow for protected executives and VIPs. It decodes audio samples, delegates biometric voice modeling to Member 1's `SpeakerEnrollmentService`, and links the resulting enrolled speaker profiles to `ProtectedIdentity` database models.

---

## 2. Dependencies & Imports

- **Member 1 AI**:
  - `SpeakerEnrollmentService`, `EnrollmentResult` from [`backend.models.speaker_enrollment`](file:///Users/dhurgadevi/Documents/GitHub/VoiceCloneDetection-SIH/backend/models/speaker_enrollment.py)
- **Database & Persistence**:
  - `ProtectedIdentity`, `SpeakerProfileModel` from [`backend.platform.db.models`](file:///Users/dhurgadevi/Documents/GitHub/VoiceCloneDetection-SIH/backend/platform/db/models.py)
  - `DatabaseSpeakerRepository` from [`backend.platform.db.speaker_repo_adapter`](file:///Users/dhurgadevi/Documents/GitHub/VoiceCloneDetection-SIH/backend/platform/db/speaker_repo_adapter.py)
  - `Session` from `sqlalchemy.orm`
- **AI Adapter**: `AIAdapter` from [`backend.platform.services.ai_adapter`](file:///Users/dhurgadevi/Documents/GitHub/VoiceCloneDetection-SIH/backend/platform/services/ai_adapter.py)
- **Schemas**: `EnrollmentResponseDto` from [`backend.platform.schemas.protected_identities`](file:///Users/dhurgadevi/Documents/GitHub/VoiceCloneDetection-SIH/backend/platform/schemas/protected_identities.py)

---

## 3. Class: `SpeakerService`

### Constructor
```python
def __init__(self, db: Session) -> None
```
- Holds database session `self.db`.
- Retrieves `AIAdapter.get_instance()`.
- Initializes `DatabaseSpeakerRepository()`.
- Binds `self.enrollment_service: SpeakerEnrollmentService` from `self.ai_adapter.pipeline.speaker_service`.

---

### Method: `enroll_identity(...) -> EnrollmentResponseDto`
```python
def enroll_identity(
    self,
    protected_identity_id: str,
    audio_samples: List[str],
) -> EnrollmentResponseDto
```

#### Parameters
- `protected_identity_id: str`: UUID of target `ProtectedIdentity`.
- `audio_samples: List[str]`: List of audio sample payloads, which may be either Base64-encoded strings or local file paths.

#### Processing Steps
1. Validates that `ProtectedIdentity` exists in database. Retrieves `speaker_id`.
2. Converts any Base64 strings into temporary `.wav` files on disk.
3. Invokes Member 1's `SpeakerEnrollmentService.enroll_speaker(speaker_id, audio_samples=parsed_samples)`.
4. If enrollment is successful:
   - Queries `SpeakerProfileModel` for `speaker_id`.
   - Associates `profile_model.protected_identity_id = identity.id`.
   - Commits transaction.
5. In a `finally` block, unlinks all temporary `.wav` files.
6. Returns `EnrollmentResponseDto` with enrollment statistics (`accepted_samples`, `consistency_score`, `quality_warnings`).

---

## 4. Test Traceability

- Automated Tests: Covered in [`backend/platform/tests/test_speaker_service.py`](file:///Users/dhurgadevi/Documents/GitHub/VoiceCloneDetection-SIH/backend/platform/tests/test_speaker_service.py)
- E2E Validation: Tested during biometric voice matching workflows.

---

## 5. Source Files Covered

- [`backend/platform/services/speaker_service.py`](file:///Users/dhurgadevi/Documents/GitHub/VoiceCloneDetection-SIH/backend/platform/services/speaker_service.py)
