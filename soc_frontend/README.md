# VoiceShield Enterprise SOC Frontend

Production-quality enterprise Security Operations Center (SOC) dashboard for real-time voice-impersonation, synthetic clone, and social engineering threat defense.

## Architectural Security Boundary

> **Compliance Principle:** Live audio is never streamed to or recorded in the SOC dashboard. The SOC operates exclusively on structured security telemetry (risk score, acoustic synthetic probability, ECAPA-TDNN speaker similarity, detected conversational intent, and contextual targeting indicators).

---

## Tech Stack

* **Core**: React 18 + Vite
* **Styling**: Tailwind CSS (Dark Enterprise Cybersecurity Palette)
* **Routing**: React Router v6
* **Icons**: Lucide React
* **Telemetry**: Native WebSocket client with auto-reconnect and seamless mock fallback

---

## Directory Structure

```text
soc_frontend/
├── src/
│   ├── components/
│   │   ├── layout/       # Sidebar, TopBar, AppLayout
│   │   ├── dashboard/    # KPICards, SecurityPosture, SystemStatus, ActiveThreatsTable
│   │   ├── incidents/    # DetectionEvidenceCard, IdentityVerificationCard, IncidentTimeline, etc.
│   │   ├── alerts/       # CriticalAlertBanner, AlertModal
│   │   └── common/       # SeverityTag, StatusIndicator, PrivacyBanner, Card, Button, Modal
│   ├── pages/
│   │   ├── Overview.jsx            # KPI cards, threat table, severity distribution, posture
│   │   ├── Events.jsx              # Near-real-time live telemetry stream
│   │   ├── Incidents.jsx           # Incident management triage center with tabs & filters
│   │   ├── Investigation.jsx       # Detailed forensic workspace for INC-2026-XXXXX
│   │   ├── Analytics.jsx           # Macro-telemetry, attack vectors, SLA performance
│   │   ├── ProtectedIdentities.jsx # Enrolled VIP executives & voiceprint status
│   │   ├── AuditLogs.jsx           # Read-only cryptographic log of analyst interventions
│   │   ├── SystemHealth.jsx        # Model microservice status and inference latency
│   │   └── Reports.jsx             # Compliance summaries and downloadable dossiers
│   ├── services/
│   │   ├── api.js                  # REST client with automatic fallback layer
│   │   └── websocket.js            # Telemetry WebSocket client with live simulation
│   ├── hooks/                      # useIncidents, useEvents, useSystemHealth
│   ├── utils/                      # mockData (with localStorage persistence), formatters
│   ├── App.jsx
│   ├── main.jsx
│   └── index.css
├── public/
├── package.json
├── vite.config.js
└── tailwind.config.js
```

---

## Running Locally

1. **Install dependencies**:
   ```bash
   cd soc_frontend
   npm install
   ```

2. **Start the development server**:
   ```bash
   npm run dev
   ```
   The SOC frontend will launch on `http://localhost:3000`.

3. **Production build**:
   ```bash
   npm run build
   ```
