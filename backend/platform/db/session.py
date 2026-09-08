"""
backend/platform/db/session.py
==============================
SQLAlchemy database engine, session factory, and lifecycle management.
Supports PostgreSQL as primary production DB with SQLite fallback.
"""

from __future__ import annotations

import logging
from typing import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker, Session

from backend.platform.config import platform_config

log = logging.getLogger(__name__)

Base = declarative_base()

def _create_engine():
    db_url = platform_config.database_url
    connect_args = {}
    if db_url.startswith("sqlite"):
        connect_args["check_same_thread"] = False

    try:
        eng = create_engine(
            db_url,
            connect_args=connect_args,
            echo=platform_config.db_echo,
            pool_pre_ping=True,
        )
        # Verify connection
        with eng.connect():
            pass
        return eng
    except Exception as exc:
        log.warning(
            "Primary database '%s' unavailable (%s); falling back to local SQLite.",
            db_url,
            exc,
        )
        fallback_url = "sqlite:///voice_clone_detection.db"
        return create_engine(
            fallback_url,
            connect_args={"check_same_thread": False},
            echo=platform_config.db_echo,
            pool_pre_ping=True,
        )

engine = _create_engine()
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def init_db() -> None:
    """Create all database tables defined in models."""
    log.info("Initializing database schema at %s...", platform_config.database_url)
    import backend.platform.db.models  # noqa: F401
    Base.metadata.create_all(bind=engine)
    log.info("Database schema initialized successfully.")


def get_db() -> Generator[Session, None, None]:
    """FastAPI dependency yielding a SQLAlchemy session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
