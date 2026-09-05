# Repositories & Database Adapters

## 1. File Location & Purpose
- **Source File**: `backend/platform/db/speaker_repo_adapter.py`
- **Purpose**: Implements `DatabaseSpeakerRepository`, adapting Member 1's abstract `BaseSpeakerRepository` to the SQL relational database.

---

## 2. Class: `DatabaseSpeakerRepository`

```python
class DatabaseSpeakerRepository(BaseSpeakerRepository):
    """
    SQLAlchemy-backed implementation of Member 1's BaseSpeakerRepository.
    Persists 192-D speaker verification embeddings as binary blobs.
    """
    def __init__(self, session_factory: Optional[Callable[[], Session]] = None) -> None:
        self.session_factory = session_factory or SessionLocal
```

### Methods Implemented:

#### `save_profile(profile: SpeakerProfile) -> None`
- **Purpose**: Saves or updates a speaker biometric profile in SQL.
- **Workflow**:
  1. Queries `ProtectedIdentity` by `speaker_id = profile.speaker_id`.
  2. If identity missing: creates identity record automatically to host the profile.
  3. Serializes `profile.reference_embedding` (192-D float32 numpy array) via `pickle.dumps()`.
  4. Inserts or updates `SpeakerProfileModel` linked to `identity.id`.
  5. Commits transaction.

#### `get_profile(speaker_id: str) -> Optional[SpeakerProfile]`
- **Purpose**: Retrieves a speaker profile and deserializes the embedding vector.
- **Workflow**:
  1. Queries `ProtectedIdentity` and joins `SpeakerProfileModel`.
  2. If found: deserializes `pickle.loads(db_profile.embedding_vector)`.
  3. Returns reconstituted Member 1 `SpeakerProfile` object.

#### `has_speaker(speaker_id: str) -> bool`
- **Purpose**: Checks whether an enrolled profile exists for `speaker_id`.

#### `list_speakers() -> List[str]`
- **Purpose**: Returns a list of all enrolled `speaker_id` strings.

#### `delete_profile(speaker_id: str) -> bool`
- **Purpose**: Removes the biometric profile from the database.

---

## 3. Source Files Covered
- `backend/platform/db/speaker_repo_adapter.py`
- `backend/models/speaker_repository.py`
