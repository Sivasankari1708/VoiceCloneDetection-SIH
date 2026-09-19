"""
backend/intent/identity_claim_extractor.py
==========================================
Detection-driven extraction of identity and organization claims from speech transcripts.

Distinguishes:
  1. Claimed Person (e.g. 'Rajesh Malhotra') vs Authenticated Caller Account vs Caller ID.
  2. Claimed Organization (e.g. 'Apex Financial Corp' vs 'XYZ Government Department').
  3. Registered Tenant Organization (has active VoiceShield SOC) vs External / Unregistered Org.
  4. Enrolled Biometric Identity (e.g. Rajesh Malhotra -> LA_0069) vs Unenrolled Person.

Rule:
  If no identity claim exists in the conversation, the caller is UNVERIFIED and
  speaker verification is NOT_AVAILABLE.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Optional, Tuple
from sqlalchemy.orm import Session

from backend.platform.db.models import Organization, ProtectedIdentity
from backend.utils.logger import get_logger

log = get_logger(__name__)

# Regular expressions for self-identification patterns in English telephone dialogue
PERSON_CLAIM_PATTERNS = [
    re.compile(r"\b(?:this is|this's|speaking is|it is|it's)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})", re.IGNORECASE),
    re.compile(r"\b(?:i am|i'm|my name is)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})", re.IGNORECASE),
    re.compile(r"\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+))\s+here\b", re.IGNORECASE),
]

# Patterns for organization claims in dialogue
ORG_CLAIM_PATTERNS = [
    re.compile(
        r"\b(?:calling from|from|with|represent|representing|work for|working for|on behalf of)\s+([A-Za-z0-9\s&]{2,40}?)(?:\.|\,|$|\s+(?:i|we|can|to|for|please|and|regarding|about|calling|need))",
        re.IGNORECASE,
    ),
    re.compile(r"\b(?:of)\s+([A-Za-z0-9\s&]{2,35}?)(?:\.|\,|$|\s+(?:i|we|can|to|for|please|and|regarding|about|calling|need))", re.IGNORECASE),
]

# Canonical organization alias mapping for robust conversational extraction
ORGANIZATION_ALIASES = {
    "org_sbi": {
        "canonical_name": "State Bank of India",
        "aliases": ["state bank of india", "sbi", "state bank"],
    },
    "org_iob": {
        "canonical_name": "Indian Overseas Bank",
        "aliases": ["indian overseas bank", "iob"],
    },
    "org_uidai": {
        "canonical_name": "UIDAI",
        "aliases": ["uidai", "aadhaar authority", "unique identification authority of india", "aadhaar", "uidai authority"],
    },
    "org_police": {
        "canonical_name": "Police Department",
        "aliases": ["police department", "cyber crime police", "police", "cyber crime officer", "cyber police", "police officer"],
    },
    "org_drdo": {
        "canonical_name": "DRDO",
        "aliases": ["drdo", "defence research and development organisation", "defence research and development organization"],
    },
}


@dataclass(frozen=True)
class IdentityClaimResult:
    """Structured extraction of claimed conversational identity."""
    has_claim: bool
    claimed_person: Optional[str] = None
    claimed_speaker_id: Optional[str] = None
    protected_identity: Optional[ProtectedIdentity] = None
    claimed_org_name: Optional[str] = None
    claimed_org_id: Optional[str] = None
    is_registered_org: bool = False
    organization: Optional[Organization] = None

    def summary(self) -> str:
        person_str = f"{self.claimed_person} (spk={self.claimed_speaker_id})" if self.claimed_person else "UNVERIFIED"
        org_str = f"{self.claimed_org_name} (registered={self.is_registered_org})" if self.claimed_org_name else "NONE"
        return f"[IdentityClaim] Person: {person_str} | Org: {org_str}"


def extract_identity_claim(transcript: str, db: Session) -> IdentityClaimResult:
    """
    Parse speech transcript for person and organization claims.
    Cross-references discovered entities against the database.
    """
    if not transcript or not transcript.strip():
        return IdentityClaimResult(has_claim=False)

    clean_text = transcript.strip()

    # Query active protected identities and organizations from DB
    protected_identities = db.query(ProtectedIdentity).filter_by(is_active=True).all()
    organizations = db.query(Organization).filter_by(is_active=True).all()

    found_person_name: Optional[str] = None
    found_protected_id: Optional[ProtectedIdentity] = None
    found_speaker_id: Optional[str] = None

    found_org_name: Optional[str] = None
    found_org: Optional[Organization] = None
    is_registered_org: bool = False

    # ── 1. Check for Protected Identity direct occurrence or pattern match ─────
    # First, check if any enrolled VIP's name is directly mentioned in the transcript
    text_lower = clean_text.lower()
    for prot in protected_identities:
        full_name_lower = prot.full_name.lower()
        if full_name_lower in text_lower:
            found_person_name = prot.full_name
            found_protected_id = prot
            found_speaker_id = prot.speaker_id
            break

    # If not found directly, check regex patterns
    if not found_person_name:
        for pat in PERSON_CLAIM_PATTERNS:
            match = pat.search(clean_text)
            if match:
                candidate = match.group(1).strip()
                # Strip trailing prepositions
                candidate = re.sub(r"\s+(?:from|with|at|calling|of)$", "", candidate, flags=re.IGNORECASE).strip()
                # Exclude common false positives like "Hello", "Yes", "This is Sreya" (recipient)
                if len(candidate) > 2 and candidate.lower() not in ("sreya", "sreya sengupta", "hello", "sir", "madam"):
                    found_person_name = candidate
                    # Check if candidate matches any protected identity
                    cand_lower = candidate.lower()
                    for prot in protected_identities:
                        if cand_lower in prot.full_name.lower() or prot.full_name.lower() in cand_lower:
                            found_protected_id = prot
                            found_speaker_id = prot.speaker_id
                            found_person_name = prot.full_name
                            break
                    break

    # ── 2. Check for Organization Claims with Alias Mapping ───────────────────
    # 2a. Priority check against canonical alias dictionary (SBI, IOB, UIDAI, Police, DRDO)
    for org_id, org_info in ORGANIZATION_ALIASES.items():
        for alias in org_info["aliases"]:
            # Word boundary check for alias (e.g. \bsbi\b, \biob\b)
            if re.search(rf"\b{re.escape(alias)}\b", text_lower):
                matched_org = db.query(Organization).filter((Organization.id == org_id) | (Organization.code == org_info["canonical_name"]) | (Organization.name == org_info["canonical_name"])).first()
                if matched_org:
                    found_org = matched_org
                    found_org_name = matched_org.name
                    is_registered_org = True
                    break
                else:
                    found_org_name = org_info["canonical_name"]
                    is_registered_org = True
                    break
        if found_org:
            break

    # 2b. Check regex patterns for claimed org if not matched by canonical aliases
    if not found_org_name:
        for pat in ORG_CLAIM_PATTERNS:
            match = pat.search(clean_text)
            if match:
                raw_org = match.group(1).strip()
                raw_org = re.sub(r"^(the|an|a)\s+", "", raw_org, flags=re.IGNORECASE)
                if len(raw_org) > 2 and raw_org.lower() not in ("the bank", "the police", "security", "phone", "here"):
                    found_org_name = raw_org
                    break

    # 2c. Check against known registered organizations in DB
    if not found_org:
        for org in organizations:
            org_name_lower = org.name.lower()
            if org_name_lower in text_lower or (found_org_name and (org_name_lower in found_org_name.lower() or found_org_name.lower() in org_name_lower)):
                found_org = org
                found_org_name = org.name
                is_registered_org = True
                break

    # If person was matched to a ProtectedIdentity with an associated Organization,
    # and no conflicting org was claimed, resolve organization from the protected identity
    if found_protected_id and found_protected_id.organization and not found_org:
        found_org = found_protected_id.organization
        found_org_name = found_protected_id.organization.name
        is_registered_org = True

    has_claim = bool(found_person_name or found_org_name or found_protected_id)

    result = IdentityClaimResult(
        has_claim=has_claim,
        claimed_person=found_person_name,
        claimed_speaker_id=found_speaker_id,
        protected_identity=found_protected_id,
        claimed_org_name=found_org_name,
        claimed_org_id=found_org.id if found_org else None,
        is_registered_org=is_registered_org,
        organization=found_org,
    )

    if has_claim:
        log.info("[IdentityExtractor] Discovery: %s", result.summary())

    return result
