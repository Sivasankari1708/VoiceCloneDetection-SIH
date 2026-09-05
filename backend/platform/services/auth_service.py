"""
backend/platform/services/auth_service.py
=========================================
Authentication and password security service.
Uses PBKDF2-HMAC-SHA256 for password hashing and PyJWT for bearer tokens.
"""

from __future__ import annotations

import hashlib
import hmac
import os
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

import jwt

from backend.platform.config import platform_config
from backend.platform.db.models import User
from backend.utils.logger import get_logger

log = get_logger(__name__)

_HASH_ITERATIONS = 100_000
_HASH_NAME = "sha256"


def hash_password(password: str) -> str:
    """Hash password using PBKDF2 with a random salt."""
    salt = secrets.token_hex(16)
    key = hashlib.pbkdf2_hmac(
        _HASH_NAME,
        password.encode("utf-8"),
        salt.encode("utf-8"),
        _HASH_ITERATIONS,
    )
    return f"{salt}${key.hex()}"


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify plain password against PBKDF2 salt$hash format."""
    try:
        salt, key_hex = hashed_password.split("$", 1)
        expected_key = hashlib.pbkdf2_hmac(
            _HASH_NAME,
            plain_password.encode("utf-8"),
            salt.encode("utf-8"),
            _HASH_ITERATIONS,
        )
        return hmac.compare_digest(expected_key.hex(), key_hex)
    except Exception as exc:
        log.warning("Password verification failed with error: %s", exc)
        return False


def create_access_token(user: User, expires_delta: Optional[timedelta] = None) -> str:
    """Create a signed JWT bearer token containing user and organization context."""
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=platform_config.access_token_expire_minutes)

    payload = {
        "sub": user.id,
        "username": user.username,
        "email": user.email,
        "role": user.role,
        "org_id": user.org_id,
        "exp": expire,
        "iat": datetime.now(timezone.utc),
    }

    token = jwt.encode(
        payload,
        platform_config.jwt_secret,
        algorithm=platform_config.jwt_algorithm,
    )
    return token


def decode_access_token(token: str) -> Optional[Dict[str, Any]]:
    """Decode and validate a signed JWT bearer token."""
    try:
        payload = jwt.decode(
            token,
            platform_config.jwt_secret,
            algorithms=[platform_config.jwt_algorithm],
        )
        return payload
    except jwt.PyJWTError as exc:
        log.debug("JWT decode error: %s", exc)
        return None
