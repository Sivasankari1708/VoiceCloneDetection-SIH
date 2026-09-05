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
    <div className="space-y-5 font-mono">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-soc-border">
        <div>
          <div className="flex items-center gap-2">
            <Radio className="w-4 h-4 text-red-500 animate-pulse" />
            <h2 className="text-sm font-bold tracking-widest text-slate-100 uppercase">
              NEAR-REAL-TIME SECURITY MONITORING
            </h2>
          </div>
          <p className="text-2xs text-slate-500 mt-0.5">
            Zero-Audio Telemetry Ingress — continuous classification from PBX trunks, SIP lines, and WebRTC gateways
          </p>
        </div>

        {/* Live Status Indicators */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-900 border border-slate-800 rounded text-xs">
            <StatusIndicator status={connectionStatus} />
            <span className="text-slate-600">|</span>
            <span className="text-2xs text-slate-400">
              Last update: {isPaused ? 'PAUSED' : '2 sec ago'}
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
      <div className="flex items-center justify-between gap-3 p-3 bg-soc-card border border-soc-border rounded-md">
        <div className="flex items-center gap-3 flex-1">
          <div className="relative flex-1 max-w-md">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Filter live event stream by keyword..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 pl-8 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-soc-accent"
            />
          </div>

          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
            className="bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-soc-accent"
          >
            <option value="ALL">All Severities</option>
            <option value="CRITICAL">Critical Only</option>
            <option value="HIGH">High Risk</option>
            <option value="MEDIUM">Medium Anomaly</option>
            <option value="LOW">Low / Cleared</option>
          </select>
        </div>

        <span className="text-2xs text-slate-500">
          Buffering latest {filteredEvents.length} events
        </span>
      </div>

      {/* Live Stream List */}
      <div className="space-y-2.5">
        {filteredEvents.length === 0 ? (
          <div className="p-12 text-center text-xs text-slate-500 bg-soc-card border border-soc-border rounded-md">
            No live events match your filter query.
          </div>
        ) : (
          filteredEvents.map((evt) => {
            const isCritical = evt.severity === 'CRITICAL';
            const isHigh = evt.severity === 'HIGH';

            return (
              <div
                key={evt.id}
                className={`p-3.5 rounded-md border transition-all ${
                  isCritical
                    ? 'bg-red-950/25 border-red-900/60 hover:bg-red-950/40'
                    : isHigh
                    ? 'bg-orange-950/20 border-orange-900/50 hover:bg-orange-950/30'
                    : 'bg-soc-card border-soc-border hover:border-slate-700'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <SeverityTag severity={evt.severity} size="xs" />
                    <span className="text-xs font-bold text-slate-200">{evt.id}</span>
                    <span className="text-2xs text-slate-500">• {evt.timestamp}</span>
                    <span className="text-2xs px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-400">
                      Channel: {evt.channel}
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="text-2xs text-slate-400 font-semibold">
                      Risk Score: <strong className={evt.riskScore >= 70 ? 'text-red-400' : 'text-slate-200'}>{evt.riskScore}</strong> / 100
                    </span>
                    {evt.incidentId && (
                      <span className="text-[10px] px-2 py-0.5 rounded bg-red-900/80 text-red-200 border border-red-700 font-bold uppercase">
                        Incident Created
                      </span>
                    )}
                  </div>
                </div>

                <div className="mt-2 text-xs font-medium text-slate-200">
                  {evt.title}
                </div>

                <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-2 text-2xs bg-slate-950/50 p-2 rounded border border-slate-800/80 text-slate-400">
                  <div>
                    <span className="text-slate-500">Target: </span>
                    <span className="text-slate-200 font-medium">{evt.target}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">Claimed Identity: </span>
                    <span className={evt.speakerStatus === 'IDENTITY MISMATCH' ? 'text-red-300 font-semibold' : 'text-slate-200'}>
                      {evt.claimedIdentity}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500">Synthetic Prob: </span>
                    <span className={evt.syntheticProbability >= 0.6 ? 'text-red-400 font-bold' : 'text-slate-300'}>
                      {Math.round(evt.syntheticProbability * 100)}%
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500">Biometric Status: </span>
                    <span className={evt.speakerStatus === 'IDENTITY MISMATCH' ? 'text-red-400 font-semibold' : 'text-emerald-400'}>
                      {evt.speakerStatus}
                    </span>
                  </div>
                </div>

                {evt.incidentId && (
                  <div className="mt-2.5 flex justify-end">
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
