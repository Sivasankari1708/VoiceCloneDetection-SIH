# Module: Speaker Repository Database Adapter

**File**: [`backend/platform/db/speaker_repo_adapter.py`](file:///Users/dhurgadevi/Documents/GitHub/VoiceCloneDetection-SIH/backend/platform/db/speaker_repo_adapter.py)  
**Package**: `backend.platform.db`

---

## 1. Module Purpose & Responsibilities

`speaker_repo_adapter.py` implements Member 1's abstract `BaseSpeakerRepository` interface using SQLAlchemy. It allows Member 1's AI models (`SpeakerEnrollmentService`, `ECAPAModel`, `InferencePipeline`) to persist and retrieve 192-dimensional biometric speaker voice vectors from PostgreSQL or SQLite without altering any lines of Member 1 code.

---

## 2. Dependencies & Invariants

- **Member 1 Contract**: Subclasses `BaseSpeakerRepository` and returns standard `SpeakerProfile` objects from [`backend/models/speaker_repository.py`](file:///Users/dhurgadevi/Documents/GitHub/VoiceCloneDetection-SIH/backend/models/speaker_repository.py).
- **ORM Persistence**: Reads and writes records in the `speaker_profiles` table via `SpeakerProfileModel`.
- **Privacy & Security**: Raw audio waveforms are never saved; only normalized 192-dimensional floating-point vectors are stored in `embedding_vector_json`.

---

## 3. Class: `DatabaseSpeakerRepository`

### Constructor
```python
def __init__(self, session_factory=SessionLocal) -> None
```
- Sets `self.session_factory = session_factory`.

### Methods

#### 3.1 `save_profile(profile: SpeakerProfile) -> None`
- Serializes `profile.reference_embedding` (192-D NumPy array) to JSON.
- Upserts the `SpeakerProfileModel` entry corresponding to `profile.speaker_id`.

#### 3.2 `get_profile(speaker_id: str) -> Optional[SpeakerProfile]`
- Queries `SpeakerProfileModel` for `speaker_id`.
- Deserializes `embedding_vector_json` into a NumPy array with `dtype=np.float32`.
- Returns hydrated `SpeakerProfile` or `None`.

#### 3.3 `get_reference_embedding(speaker_id: str) -> Optional[np.ndarray]`
- Lightweight lookup returning solely the 192-D `float32` embedding vector for cosine similarity computation in Member 1's pipeline.

#### 3.4 `delete_profile(speaker_id: str) -> bool`
- Deletes the biometric model row from `speaker_profiles`. Returns `True` if deleted, `False` otherwise.

#### 3.5 `list_speakers() -> List[str]`
- Returns a list of all enrolled `speaker_id` strings across the repository.

#### 3.6 `has_speaker(speaker_id: str) -> bool`
- Fast count query checking whether a biometric profile exists for `speaker_id`.

---

## 4. Test Traceability

- Automated Unit Tests: Tested in [`backend/platform/tests/test_speaker_service.py`](file:///Users/dhurgadevi/Documents/GitHub/VoiceCloneDetection-SIH/backend/platform/tests/test_speaker_service.py)
- E2E Validation: Live verification against enrolled VIP CFO speaker `LA_0069`.

---

## 5. Source Files Covered

- [`backend/platform/db/speaker_repo_adapter.py`](file:///Users/dhurgadevi/Documents/GitHub/VoiceCloneDetection-SIH/backend/platform/db/speaker_repo_adapter.py)
