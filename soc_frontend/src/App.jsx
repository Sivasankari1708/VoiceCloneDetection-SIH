// src/App.jsx
import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AppLayout } from './components/layout/AppLayout';
import { Overview } from './pages/Overview';
import { Events } from './pages/Events';
import { Incidents } from './pages/Incidents';
import { Investigation } from './pages/Investigation';
import { Analytics } from './pages/Analytics';
import { ProtectedIdentities } from './pages/ProtectedIdentities';
import { AuditLogs } from './pages/AuditLogs';
import { SystemHealth } from './pages/SystemHealth';
import { Reports } from './pages/Reports';

export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<Navigate to="/overview" replace />} />
        <Route path="/overview" element={<Overview />} />
        <Route path="/events" element={<Events />} />
        <Route path="/incidents" element={<Incidents />} />
        <Route path="/investigations" element={<Navigate to="/incidents" replace />} />
        <Route path="/investigations/:id" element={<Investigation />} />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="/protected-identities" element={<ProtectedIdentities />} />
        <Route path="/audit-logs" element={<AuditLogs />} />
        <Route path="/system-health" element={<SystemHealth />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="*" element={<Navigate to="/overview" replace />} />
      </Route>
    </Routes>
  );
}
