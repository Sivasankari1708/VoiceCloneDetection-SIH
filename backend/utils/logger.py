"""
utils/logger.py
----------------
Responsibility: Provide a single, consistently configured logger for the
                entire backend. All modules import `get_logger` from here.

Usage:
    from backend.utils.logger import get_logger
    log = get_logger(__name__)
    log.info("Stage complete")
"""

from __future__ import annotations

import logging
import sys


_LOG_FORMAT = "%(asctime)s | %(levelname)-8s | %(name)s | %(message)s"
_DATE_FORMAT = "%Y-%m-%dT%H:%M:%S"


def get_logger(name: str, level: int = logging.DEBUG) -> logging.Logger:
    """
    Return a named logger configured with a StreamHandler to stdout.

    Calling this multiple times with the same `name` returns the same logger
    (standard Python behaviour), so it is safe to call at module level.

    Args:
        name:  Typically `__name__` of the calling module.
        level: Log level (default: DEBUG during development).

    Returns:
        Configured logging.Logger instance.
    """
    logger = logging.getLogger(name)

    if not logger.handlers:
        handler = logging.StreamHandler(sys.stdout)
        handler.setFormatter(logging.Formatter(_LOG_FORMAT, datefmt=_DATE_FORMAT))
        logger.addHandler(handler)
        logger.setLevel(level)
        logger.propagate = False

    return logger
