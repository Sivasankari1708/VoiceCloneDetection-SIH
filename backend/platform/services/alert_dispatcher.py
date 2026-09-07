"""
backend/platform/services/alert_dispatcher.py
=============================================
Real-time WebSocket connection manager and multi-tenant alert pub/sub hub.

Guarantees:
  1. Strict Organization Isolation:
     Organization A never receives alerts or incidents belonging to Organization B.
  2. Session Isolation:
     Real-time chunk telemetry and user warnings are delivered strictly to the matching session_id.
"""

from __future__ import annotations

import asyncio
import json
from typing import Any, Dict, Set

from fastapi import WebSocket
from backend.utils.logger import get_logger

log = get_logger(__name__)


class AlertDispatcher:
    """Manages active WebSockets for call streams and organization SOC consoles."""

    _instance: Optional["AlertDispatcher"] = None

    def __init__(self) -> None:
        # session_id -> Set of WebSockets (user/client call stream)
        self._call_sockets: Dict[str, Set[WebSocket]] = {}
        # org_id -> Set of WebSockets (organization security operator dashboards)
        self._org_sockets: Dict[str, Set[WebSocket]] = {}
        # user_id -> Set of WebSockets (user-scoped notification feed)
        self._user_sockets: Dict[str, Set[WebSocket]] = {}
        self._lock = asyncio.Lock()

    @classmethod
    def get_instance(cls) -> "AlertDispatcher":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    # ── Call Stream Connections (Per-Session) ───────────────────────────

    async def register_call_socket(self, session_id: str, websocket: WebSocket) -> None:
        """Register a user client WebSocket for an active call stream."""
        async with self._lock:
            if session_id not in self._call_sockets:
                self._call_sockets[session_id] = set()
            self._call_sockets[session_id].add(websocket)
            log.info("[AlertDispatcher] Registered call WebSocket for session '%s'. Total: %d", session_id, len(self._call_sockets[session_id]))

    async def unregister_call_socket(self, session_id: str, websocket: WebSocket) -> None:
        """Unregister a call stream WebSocket."""
        async with self._lock:
            if session_id in self._call_sockets:
                self._call_sockets[session_id].discard(websocket)
                if not self._call_sockets[session_id]:
                    del self._call_sockets[session_id]
            log.info("[AlertDispatcher] Unregistered call WebSocket for session '%s'.", session_id)

    async def send_to_call(self, session_id: str, message: Dict[str, Any]) -> None:
        """Send a message (e.g. RISK_UPDATE or USER_SECURITY_ALERT) to an active call session."""
        sockets = set()
        async with self._lock:
            if session_id in self._call_sockets:
                sockets = set(self._call_sockets[session_id])

        if not sockets:
            return

        payload = json.dumps(message)
        dead = set()
        for ws in sockets:
            try:
                await ws.send_text(payload)
            except Exception as exc:
                log.debug("[AlertDispatcher] Failed sending to call socket %s: %s", session_id, exc)
                dead.add(ws)

        if dead:
            async with self._lock:
                if session_id in self._call_sockets:
                    self._call_sockets[session_id].difference_update(dead)

    # ── Organization Alert Feed Connections (Per-Organization) ──────────

    async def register_org_socket(self, org_id: str, websocket: WebSocket) -> None:
        """Register a security operator dashboard WebSocket for an organization."""
        async with self._lock:
            if org_id not in self._org_sockets:
                self._org_sockets[org_id] = set()
            self._org_sockets[org_id].add(websocket)
            log.info("[AlertDispatcher] Registered SOC WebSocket for org '%s'. Total: %d", org_id, len(self._org_sockets[org_id]))

    async def unregister_org_socket(self, org_id: str, websocket: WebSocket) -> None:
        """Unregister an organization SOC dashboard WebSocket."""
        async with self._lock:
            if org_id in self._org_sockets:
                self._org_sockets[org_id].discard(websocket)
                if not self._org_sockets[org_id]:
                    del self._org_sockets[org_id]
            log.info("[AlertDispatcher] Unregistered SOC WebSocket for org '%s'.", org_id)

    async def send_to_org(self, org_id: str, message: Dict[str, Any]) -> None:
        """
        Broadcast high-priority security alert or incident update to all connected
        operators belonging to the specific organization.
        """
        sockets = set()
        async with self._lock:
            if org_id in self._org_sockets:
                sockets = set(self._org_sockets[org_id])

        if not sockets:
            log.debug("[AlertDispatcher] No active SOC operators connected for org '%s'.", org_id)
            return

        payload = json.dumps(message)
        dead = set()
        for ws in sockets:
            try:
                await ws.send_text(payload)
            except Exception as exc:
                log.debug("[AlertDispatcher] Failed sending to org socket %s: %s", org_id, exc)
                dead.add(ws)

        if dead:
            async with self._lock:
                if org_id in self._org_sockets:
                    self._org_sockets[org_id].difference_update(dead)

    # ── User Notification Feed Connections (Per-User) ──────────────────

    async def register_user_socket(self, user_id: str, websocket: WebSocket) -> None:
        """Register a user client WebSocket for personal notifications (incoming calls)."""
        async with self._lock:
            if user_id not in self._user_sockets:
                self._user_sockets[user_id] = set()
            self._user_sockets[user_id].add(websocket)
            log.info("[AlertDispatcher] Registered user WebSocket for user '%s'. Total: %d", user_id, len(self._user_sockets[user_id]))

    async def unregister_user_socket(self, user_id: str, websocket: WebSocket) -> None:
        """Unregister a user notification WebSocket."""
        async with self._lock:
            if user_id in self._user_sockets:
                self._user_sockets[user_id].discard(websocket)
                if not self._user_sockets[user_id]:
                    del self._user_sockets[user_id]
            log.info("[AlertDispatcher] Unregistered user WebSocket for user '%s'.", user_id)

    async def send_to_user(self, user_id: str, message: Dict[str, Any]) -> None:
        """
        Send a real-time event (e.g. INCOMING_CALL or CALL_ENDED) strictly to the specified user.
        """
        sockets = set()
        async with self._lock:
            if user_id in self._user_sockets:
                sockets = set(self._user_sockets[user_id])

        if not sockets:
            log.debug("[AlertDispatcher] No active user client connected for user '%s'.", user_id)
            return

        payload = json.dumps(message)
        dead = set()
        for ws in sockets:
            try:
                await ws.send_text(payload)
            except Exception as exc:
                log.debug("[AlertDispatcher] Failed sending to user socket %s: %s", user_id, exc)
                dead.add(ws)

        if dead:
            async with self._lock:
                if user_id in self._user_sockets:
                    self._user_sockets[user_id].difference_update(dead)
