@echo off
cd /d "%~dp0"
echo Starting VoiceShield backend on http://localhost:8002 ...
python -m uvicorn backend.platform.server.app:app --host 0.0.0.0 --port 8002 --ws websockets
