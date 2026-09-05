// src/App.jsx
import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';

import { AppLayout } from './components/layout/AppLayout';

import Login from './pages/Login';
import { Overview } from './pages/Overview';
import { Events } from './pages/Events';
import { Incidents } from './pages/Incidents';
import { Investigation } from './pages/Investigation';
import { Analytics } from './pages/Analytics';
import { ProtectedIdentities } from './pages/ProtectedIdentities';
import { AuditLogs } from './pages/AuditLogs';
import { SystemHealth } from './pages/SystemHealth';
import { Reports } from './pages/Reports';
import { SecurityPolicy } from './pages/SecurityPolicy';
import { AnalyzeAudio } from './pages/AnalyzeAudio';

export default function App() {
  return (
    <Routes>

      {/* Root = Login / Register */}
      <Route path="/" element={<Login />} />

      {/* SOC Dashboard */}
      <Route element={<AppLayout />}>

        <Route path="/overview" element={<Overview />} />

        <Route path="/events" element={<Events />} />

        <Route path="/incidents" element={<Incidents />} />

        <Route
          path="/investigations"
          element={<Navigate to="/incidents" replace />}
        />

        <Route
          path="/investigations/:id"
          element={<Investigation />}
        />

        <Route path="/analytics" element={<Analytics />} />

        <Route
          path="/protected-identities"
          element={<ProtectedIdentities />}
        />

        <Route path="/audit-logs" element={<AuditLogs />} />

        <Route path="/system-health" element={<SystemHealth />} />

        <Route path="/reports" element={<Reports />} />

        <Route path="/security-policy" element={<SecurityPolicy />} />

        <Route path="/analyze-audio" element={<AnalyzeAudio />} />

        {/* Unknown routes */}
        <Route
          path="*"
          element={<Navigate to="/" replace />}
        />

      </Route>

    </Routes>
  );
}