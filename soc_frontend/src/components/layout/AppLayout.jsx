// src/components/layout/AppLayout.jsx
import React, { useState, useEffect } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { PrivacyBanner } from '../common/PrivacyBanner';
import { AlertModal } from '../alerts/AlertModal';
import { useIncidents } from '../../hooks/useIncidents';

export function AppLayout() {
  const [isAlertModalOpen, setIsAlertModalOpen] = useState(false);
  const { incidents, acknowledge, escalate } = useIncidents();
  const navigate = useNavigate();

  // Auth guard — redirect to login if no token present
  useEffect(() => {
    const token = sessionStorage.getItem('voiceshield_auth_token');
    if (!token) {
      navigate('/', { replace: true });
    }
  }, [navigate]);

  // Don't render protected content if unauthenticated
  const token = sessionStorage.getItem('voiceshield_auth_token');
  if (!token) return null;

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-soc-bg text-soc-text font-sans">
      {/* Fixed Left Navigation */}
      <Sidebar />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Header */}
        <TopBar onOpenAlertModal={() => setIsAlertModalOpen(true)} />

        {/* Persistent Zero-Audio Compliance Banner */}
        <div className="px-6 pt-3 pb-1 shrink-0 bg-soc-bg">
          <PrivacyBanner />
        </div>

        {/* Scrollable Page Body */}
        <main className="flex-1 overflow-y-auto px-6 py-4">
          <div className="max-w-[1720px] mx-auto">
            <Outlet />
          </div>
        </main>
      </div>

      {/* Global Alerts Modal */}
      <AlertModal
        isOpen={isAlertModalOpen}
        onClose={() => setIsAlertModalOpen(false)}
        incidents={incidents}
        onAcknowledge={acknowledge}
        onEscalate={escalate}
      />
    </div>
  );
}
