"""
backend/platform/server/routes/auth.py
======================================
Authentication endpoints: login and profile identity.
"""

from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from backend.platform.config import platform_config
from backend.platform.db.models import Organization, User
from backend.platform.db.session import get_db
from backend.platform.schemas.auth import LoginRequest, TokenResponse, UserCreateDto, UserDto
from backend.platform.server.dependencies import get_current_user, get_current_user_optional
from backend.platform.services.auth_service import create_access_token, hash_password, verify_password

router = APIRouter(prefix="/api/auth", tags=["Authentication"])


@router.post("/login", response_model=TokenResponse)
def login(req: LoginRequest, db: Session = Depends(get_db)):
    """Authenticate user with username and password, returning signed JWT."""
    user = db.query(User).filter(
        (User.username == req.username) | (User.email == req.username)
    ).first()

    if not user or not verify_password(req.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is deactivated.",
        )

    token = create_access_token(user)
    return TokenResponse(
        access_token=token,
        token_type="bearer",
        expires_in_minutes=platform_config.access_token_expire_minutes,
        user=UserDto(**user.to_dict()),
    )


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def register(req: UserCreateDto, db: Session = Depends(get_db)):
    """Register a new operator or user and return signed JWT."""
    existing = db.query(User).filter(
        (User.username == req.username) | (User.email == req.email)
    ).first()
    if existing:
        if existing.username == req.username:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Username '{req.username}' is already registered.",
            )
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Email '{req.email}' is already registered.",
            )

    org_id = req.org_id
    if not org_id:
        org = db.query(Organization).filter_by(is_active=True).first()
        if not org:
            org = Organization(name="Apex Financial Corp (Demo)", code="DEMO_CORP")
            db.add(org)
            db.flush()
        org_id = org.id

    new_user = User(
        org_id=org_id,
        username=req.username,
        email=req.email,
        hashed_password=hash_password(req.password),
        full_name=req.full_name,
        role=req.role or "SECURITY_OPERATOR",
        is_active=True,
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    token = create_access_token(new_user)
    return TokenResponse(
        access_token=token,
        token_type="bearer",
        expires_in_minutes=platform_config.access_token_expire_minutes,
        user=UserDto(**new_user.to_dict()),
    )


@router.get("/me", response_model=UserDto)
def get_me(user: User = Depends(get_current_user)):
    """Return currently authenticated user profile."""
    return UserDto(**user.to_dict())


@router.get("/users", response_model=List[UserDto])
def list_org_users(
    user: Optional[User] = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
):
    """Return active users available to initiate or receive calls."""
    users = db.query(User).filter_by(is_active=True).all()
    return [UserDto(**u.to_dict()) for u in users]
