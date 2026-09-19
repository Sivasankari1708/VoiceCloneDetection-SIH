// src/pages/Events.jsx
import React, { useState } from 'react';
import { useEvents } from '../hooks/useEvents';
import { StatusIndicator } from '../components/common/StatusIndicator';
import { SeverityTag } from '../components/common/SeverityTag';
import { Button } from '../components/common/Button';
import { Radio, Search, Filter, Trash2, ArrowRight, ShieldAlert, CheckCircle, Activity, Lock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export function Events() {
  const { events, connectionStatus, lastUpdate, clearEvents } = useEvents();
  const [searchTerm, setSearchTerm] = useState('');
  const [severityFilter, setSeverityFilter] = useState('ALL');
  const [isPaused, setIsPaused] = useState(false);
  const navigate = useNavigate();

  const filteredEvents = events.filter((evt) => {
    const matchesSearch = 
      evt.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      evt.target.toLowerCase().includes(searchTerm.toLowerCase()) ||
      evt.claimedIdentity.toLowerCase().includes(searchTerm.toLowerCase()) ||
      evt.channel?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesSeverity = severityFilter === 'ALL' || evt.severity === severityFilter;
    return matchesSearch && matchesSeverity;
  });

  return (
    <div className="space-y-5 font-sans text-slate-800">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-slate-200/80">
        <div>
          <div className="flex items-center gap-2">
            <Radio className="w-4 h-4 text-blue-600" />
            <h2 className="text-base font-bold text-slate-900 tracking-tight">
              Live Security Telemetry Feed
            </h2>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Zero-Audio Telemetry Ingress — continuous biometric authenticity verification and fraud prevention stream
          </p>
        </div>

        {/* Live Status Indicators */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2.5 px-3 py-1.5 bg-white border border-slate-200/90 rounded-xl text-xs shadow-xs">
            <StatusIndicator status={connectionStatus} />
            <span className="text-slate-300">|</span>
            <span className="text-xs text-slate-500 font-medium">
              {isPaused ? 'Paused' : 'Active stream'}
            </span>
          </div>

          <Button
            variant={isPaused ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => setIsPaused(!isPaused)}
          >
            {isPaused ? 'Resume Stream' : 'Pause Stream'}
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={clearEvents}
            icon={Trash2}
            title="Clear current buffer"
          >
            Clear
          </Button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex items-center justify-between gap-3 p-3.5 bg-white border border-slate-200/90 rounded-2xl shadow-xs">
        <div className="flex items-center gap-3 flex-1">
          <div className="relative flex-1 max-w-md">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Filter live event stream by keyword..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300/90 rounded-xl px-3 py-2 pl-9 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:border-blue-600 transition"
            />
          </div>

          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
            className="bg-slate-50 border border-slate-300/90 rounded-xl px-3 py-2 text-xs text-slate-700 focus:outline-none focus:bg-white focus:border-blue-600 transition"
          >
            <option value="ALL">All Threat Severities</option>
            <option value="CRITICAL">Critical Interventions</option>
            <option value="HIGH">High Risk Pretexts</option>
            <option value="MEDIUM">Anomalous Calls</option>
            <option value="LOW">Verified Safe</option>
          </select>
        </div>

        <span className="text-xs text-slate-500 font-medium">
          Buffering latest {filteredEvents.length} events
        </span>
      </div>

      {/* Live Stream List */}
      <div className="space-y-3">
        {filteredEvents.length === 0 ? (
          <div className="p-12 text-center text-xs text-slate-500 bg-white border border-slate-200 rounded-2xl shadow-xs">
            No live events match your filter query.
          </div>
        ) : (
          filteredEvents.map((evt) => {
            const isCritical = evt.severity === 'CRITICAL';
            const isHigh = evt.severity === 'HIGH';

            return (
              <div
                key={evt.id}
                className={`p-4 rounded-2xl border transition-all shadow-xs ${
                  isCritical
                    ? 'bg-red-50/70 border-red-200'
                    : isHigh
                    ? 'bg-amber-50/50 border-amber-200'
                    : 'bg-white border-slate-200/90 hover:border-slate-300'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <SeverityTag severity={evt.severity} size="xs" />
                    <span className="text-xs font-bold text-slate-900">{evt.id}</span>
                    <span className="text-xs text-slate-500">• {evt.timestamp}</span>
                    <span className="text-xs px-2 py-0.5 rounded-md bg-slate-100 text-slate-600">
                      Channel: {evt.channel}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    {evt.incidentId && (
                      <span className="text-2xs px-2.5 py-0.5 rounded-md bg-red-100 text-red-800 border border-red-200 font-semibold">
                        Escalated to CIRT
                      </span>
                    )}
                  </div>
                </div>

                <div className="mt-2 text-xs font-semibold text-slate-900">
                  {evt.title}
                </div>

                <div className="mt-2.5 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs bg-slate-50/80 p-3 rounded-xl border border-slate-200/80 text-slate-700">
                  <div>
                    <span className="text-slate-500 text-2xs block uppercase font-medium">Target Employee:</span>
                    <span className="text-slate-900 font-medium">{evt.target}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 text-2xs block uppercase font-medium">Claimed Identity:</span>
                    <span className={evt.speakerStatus === 'IDENTITY MISMATCH' ? 'text-red-700 font-semibold' : 'text-slate-900 font-medium'}>
                      {evt.claimedIdentity}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 text-2xs block uppercase font-medium">Authenticity Status:</span>
                    <span className={evt.speakerStatus === 'IDENTITY MISMATCH' ? 'text-red-700 font-semibold' : 'text-emerald-700 font-semibold'}>
                      {evt.speakerStatus === 'IDENTITY MISMATCH' ? 'Identity Spoof Detected' : 'Voice Pattern Verified'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 text-2xs block uppercase font-medium">Defense Response:</span>
                    <span className="text-slate-800 font-medium">
                      {isCritical ? 'Autonomous Intercept & Hold' : 'Ingress Security Monitored'}
                    </span>
                  </div>
                </div>

                {evt.incidentId && (
                  <div className="mt-3 flex justify-end">
                    <Button
                      size="xs"
                      variant="danger"
                      onClick={() => navigate(`/investigations/${evt.incidentId}`)}
                      icon={ArrowRight}
                    >
                      Open Associated Incident ({evt.incidentId})
                    </Button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

