"""
backend/platform/server/routes/protected_identities.py
=====================================================
Endpoints for VIP protected identities and biometric speaker enrollment.
"""

from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from backend.platform.db.models import ProtectedIdentity, User, generate_uuid
from backend.platform.db.session import get_db
from backend.platform.schemas.protected_identities import (
    EnrollmentRequestDto,
    EnrollmentResponseDto,
    ProtectedIdentityCreateDto,
    ProtectedIdentityDto,
)
from backend.platform.server.dependencies import get_current_user, require_role
from backend.platform.services.speaker_service import SpeakerService

router = APIRouter(prefix="/api/protected-identities", tags=["Protected Identities"])


@router.get("", response_model=List[ProtectedIdentityDto])
def list_protected_identities(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List all VIP protected identities enrolled in the user's organization."""
    identities = db.query(ProtectedIdentity).filter_by(org_id=user.org_id, is_active=True).all()
    return [ProtectedIdentityDto(**i.to_dict()) for i in identities]


@router.post("", response_model=ProtectedIdentityDto, status_code=status.HTTP_201_CREATED)
def create_protected_identity(
    req: ProtectedIdentityCreateDto,
    user: User = Depends(require_role(["ADMIN", "SECURITY_OPERATOR"])),
    db: Session = Depends(get_db),
):
    """Register a new VIP executive identity to protect against voice-cloning."""
    speaker_id = req.speaker_id or f"spk_{user.org_id[:6]}_{generate_uuid()[:8]}"

    # Check speaker_id uniqueness
    existing = db.query(ProtectedIdentity).filter_by(speaker_id=speaker_id).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Speaker ID '{speaker_id}' already exists.",
        )

    identity = ProtectedIdentity(
        org_id=user.org_id,
        full_name=req.full_name,
        title=req.title,
        department=req.department,
        email=req.email,
        phone=req.phone,
        risk_priority=req.risk_priority,
        speaker_id=speaker_id,
    )
    db.add(identity)
    db.commit()
    db.refresh(identity)
    return ProtectedIdentityDto(**identity.to_dict())


@router.get("/{identity_id}", response_model=ProtectedIdentityDto)
def get_protected_identity(
    identity_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Retrieve details of a protected identity."""
    identity = db.query(ProtectedIdentity).filter_by(id=identity_id, org_id=user.org_id).first()
    if not identity:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Protected identity not found.")
    return ProtectedIdentityDto(**identity.to_dict())


@router.post("/{identity_id}/enroll", response_model=EnrollmentResponseDto)
def enroll_protected_identity_audio(
    identity_id: str,
    req: EnrollmentRequestDto,
    user: User = Depends(require_role(["ADMIN", "SECURITY_OPERATOR"])),
    db: Session = Depends(get_db),
):
    """
    Enroll reference audio samples for biometric speaker profile creation.
    Reuses Member 1's ECAPA-TDNN multi-sample enrollment engine.
    """
    identity = db.query(ProtectedIdentity).filter_by(id=identity_id, org_id=user.org_id).first()
    if not identity:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Protected identity not found.")

    service = SpeakerService(db=db)
    try:
        res = service.enroll_identity(
            protected_identity_id=identity_id,
            audio_samples=req.audio_samples,
        )
        return res
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Enrollment failed: {str(exc)}",
        )


@router.delete("/{identity_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_protected_identity(
    identity_id: str,
    user: User = Depends(require_role(["ADMIN"])),
    db: Session = Depends(get_db),
):
    """Delete a protected identity and its associated biometric embedding."""
    identity = db.query(ProtectedIdentity).filter_by(id=identity_id, org_id=user.org_id).first()
    if not identity:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Protected identity not found.")

    db.delete(identity)
    db.commit()
