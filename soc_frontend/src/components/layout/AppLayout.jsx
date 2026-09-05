// src/components/layout/AppLayout.jsx
import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { PrivacyBanner } from '../common/PrivacyBanner';
import { AlertModal } from '../alerts/AlertModal';
import { useIncidents } from '../../hooks/useIncidents';

export function AppLayout() {
  const [isAlertModalOpen, setIsAlertModalOpen] = useState(false);
  const { incidents, acknowledge, escalate } = useIncidents();

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
