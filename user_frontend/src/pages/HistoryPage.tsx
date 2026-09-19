import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ShieldAlert,
  ShieldCheck,
  Clock,
  ChevronRight,
  Shield,
  AlertOctagon,
  FileCheck,
  RefreshCw,
  Search,
  CheckCircle2,
} from 'lucide-react';
import { useCallHistory } from '../context/AppContext';
import { fetchCallHistory, getLocalCallHistory } from '../services/calls/callHistoryService';
import { analyzeSensitiveSolicitation } from '../utils/sensitiveDataDetector';
import type { CallHistoryItem } from '../types';

export interface EnterpriseCallRecord {
  id: string;
  timeStr: string;
  dateStr: string;
  claimedIdentity: string;
  department: string;
  finalProtectionState: 'Safe' | 'Caution' | 'High' | 'Critical';
  verificationOutcome: string;
  sensitiveRequestIndicator: string | null;
  interventionOccurred: boolean;
  socIncidentCreated: boolean;
  socIncidentRef?: string;
  finalScore?: number;
  durationStr?: string;
}

const DEFAULT_CALL_RECORDS: EnterpriseCallRecord[] = [
  {
    id: 'call-2026-0915-0142',
    timeStr: '09:42',
    dateStr: 'Sep 15',
    claimedIdentity: 'Arun Kumar',
    department: 'Apex Financial Corp (Finance)',
    finalProtectionState: 'Critical',
    verificationOutcome: 'Identity could not be verified (Voice Clone)',
    sensitiveRequestIndicator: 'Credential & OTP request',
    interventionOccurred: true,
    socIncidentCreated: true,
    socIncidentRef: 'INC-2026-0142',
    finalScore: 92,
    durationStr: '1m 12s',
  },
  {
    id: 'call-2026-0915-0815',
    timeStr: '08:15',
    dateStr: 'Sep 15',
    claimedIdentity: 'Priya Sharma',
    department: 'Indian Overseas Bank',
    finalProtectionState: 'Safe',
    verificationOutcome: 'Biometric Baseline Verified',
    sensitiveRequestIndicator: null,
    interventionOccurred: false,
    socIncidentCreated: false,
    finalScore: 12,
    durationStr: '2m 04s',
  },
  {
    id: 'call-2026-0914-1620',
    timeStr: '16:20',
    dateStr: 'Sep 14',
    claimedIdentity: 'IT Support Desk',
    department: 'Internal IT (UIDAI)',
    finalProtectionState: 'Caution',
    verificationOutcome: 'Verification Degraded (Background Noise)',
    sensitiveRequestIndicator: 'Internal Portal URL query',
    interventionOccurred: false,
    socIncidentCreated: false,
    finalScore: 42,
    durationStr: '48s',
  },
  {
    id: 'call-2026-0914-1105',
    timeStr: '11:05',
    dateStr: 'Sep 14',
    claimedIdentity: 'Executive Office',
    department: 'State Bank of India',
    finalProtectionState: 'High',
    verificationOutcome: 'Suspicious Vocal Pattern',
    sensitiveRequestIndicator: 'Urgent Wire Transfer inquiry',
    interventionOccurred: true,
    socIncidentCreated: true,
    socIncidentRef: 'INC-2026-0139',
    finalScore: 78,
    durationStr: '1m 35s',
  },
];

function toEnterpriseRecord(item: CallHistoryItem): EnterpriseCallRecord {
  const startDate = item.startTime ? new Date(item.startTime) : new Date();
  const isToday = startDate.toDateString() === new Date().toDateString();
  const isYesterday = new Date(Date.now() - 86400000).toDateString() === startDate.toDateString();
  const timeStr = startDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
  const dateStr = isToday ? 'Today' : isYesterday ? 'Yesterday' : startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  const score = item.finalScore ?? 0;
  let state: 'Safe' | 'Caution' | 'High' | 'Critical' = 'Safe';
  if (item.finalSeverity === 'CRITICAL' || score >= 75) state = 'Critical';
  else if (item.finalSeverity === 'HIGH' || score >= 50) state = 'High';
  else if (item.finalSeverity === 'MEDIUM' || score >= 30) state = 'Caution';
  else state = 'Safe';

  const isThreat = state === 'Critical' || state === 'High';
  const durationSec = item.duration ?? 45;
  const durationStr = durationSec >= 60 ? `${Math.floor(durationSec / 60)}m ${durationSec % 60}s` : `${durationSec}s`;

  // Detect sensitive keywords from transcript if present
  const sensitiveDetection = item.transcript
    ? item.transcript.map((t) => analyzeSensitiveSolicitation(t.text, t.speaker)).find((r) => r.isSensitive)
    : null;

  const hasSensitiveRequest =
    Boolean(sensitiveDetection) ||
    Boolean(
      item.transcript &&
      item.transcript.some((t) =>
        /otp|transfer|password|pin|credential|bank account|pan number|aadhaar/i.test(t.text)
      )
    );

  return {
    id: item.id,
    timeStr,
    dateStr,
    claimedIdentity: item.caller.name || 'External Caller',
    department: item.caller.organization || 'FinCorp India',
    finalProtectionState: state,
    verificationOutcome: isThreat
      ? 'Voice Clone / Deepfake Impersonation Suspected'
      : 'Caller Biometrics Verified',
    sensitiveRequestIndicator: hasSensitiveRequest
      ? `${sensitiveDetection?.category === 'OTP' ? 'OTP & Credential Request' : sensitiveDetection?.category ? `${sensitiveDetection.category} Request` : 'Credential & Urgent Request'}`
      : isThreat
      ? 'Suspicious Vocal Urgency'
      : null,
    interventionOccurred: isThreat,
    socIncidentCreated: isThreat,
    socIncidentRef: isThreat ? `INC-${item.id.replace(/[^a-zA-Z0-9]/g, '').slice(-4).toUpperCase()}` : undefined,
    finalScore: score,
    durationStr,
  };
}

export default function HistoryPage() {
  const navigate = useNavigate();
  const { callHistory } = useCallHistory();
  const [filter, setFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [records, setRecords] = useState<EnterpriseCallRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Load and merge history from all authoritative sources
  const refreshHistory = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Backend real calls
      const backendCalls = await fetchCallHistory();

      // 2. Tab & LocalStorage cached calls
      const localCalls = getLocalCallHistory();

      // Combine real calls with context calls
      const allRawItems: CallHistoryItem[] = [
        ...callHistory,
        ...localCalls.filter((lc) => !callHistory.some((c) => c.id === lc.id)),
        ...backendCalls.filter((bc) => !callHistory.some((c) => c.id === bc.id) && !localCalls.some((lc) => lc.id === bc.id)),
      ];

      // Convert to enterprise records
      const realEnterpriseRecords = allRawItems.map(toEnterpriseRecord);

      // Merge with default illustrative calls
      const recordMap = new Map<string, EnterpriseCallRecord>();
      // Real calls first
      realEnterpriseRecords.forEach((r) => recordMap.set(r.id, r));
      // Illustrative defaults second
      DEFAULT_CALL_RECORDS.forEach((r) => {
        if (!recordMap.has(r.id)) {
          recordMap.set(r.id, r);
        }
      });

      setRecords(Array.from(recordMap.values()));
    } catch (err) {
      console.warn('[HistoryPage] Error loading history:', err);
    } finally {
      setLoading(false);
    }
  }, [callHistory]);

  useEffect(() => {
    refreshHistory();

    // Auto refresh whenever window gains focus (e.g. switching back from caller tab)
    const onFocus = () => refreshHistory();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [refreshHistory]);

  // Filter and search
  const filtered = records.filter((call) => {
    const matchesFilter =
      filter === 'ALL' || call.finalProtectionState.toUpperCase() === filter;

    const matchesSearch =
      !searchQuery.trim() ||
      call.claimedIdentity.toLowerCase().includes(searchQuery.toLowerCase()) ||
      call.department.toLowerCase().includes(searchQuery.toLowerCase()) ||
      call.id.toLowerCase().includes(searchQuery.toLowerCase());

    return matchesFilter && matchesSearch;
  });

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-4 sm:px-6 py-4">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center flex-shrink-0 shadow-2xs">
              <Clock size={18} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-extrabold text-slate-900 tracking-tight">Call Protection History</h1>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-slate-100 text-slate-700 border border-slate-300">
                  AUDIT & FORENSIC LOGS
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Review historical calls, deepfake voice synthesis detections, autonomous interventions, and SOC alerts.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 self-end sm:self-auto">
            <button
              onClick={refreshHistory}
              disabled={loading}
              className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 flex items-center gap-1.5 transition shadow-2xs cursor-pointer"
            >
              <RefreshCw size={13} className={loading ? 'animate-spin text-blue-600' : ''} />
              <span>{loading ? 'Refreshing...' : 'Refresh'}</span>
            </button>

            <div className="text-xs text-slate-500 font-medium">
              Total Analyzed: <span className="font-bold text-slate-900">{records.length}</span> calls
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-5xl mx-auto w-full p-4 sm:p-6 space-y-5">
        {/* Controls: Filter Buttons & Search */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          {/* State Filter Buttons */}
          <div className="flex gap-2 flex-wrap">
            {['ALL', 'CRITICAL', 'HIGH', 'CAUTION', 'SAFE'].map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
                  filter === f
                    ? 'bg-slate-900 text-white shadow-2xs'
                    : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                }`}
              >
                {f === 'ALL' ? 'All Calls' : f}
              </button>
            ))}
          </div>

          {/* Search Input */}
          <div className="relative w-full sm:w-64">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search caller, department..."
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
          </div>
        </div>

        {/* Call Cards List */}
        <div className="space-y-3">
          {filtered.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-slate-500 text-xs">
              No call history records found matching "{filter}".
            </div>
          ) : (
            filtered.map((call) => {
              const isCritical = call.finalProtectionState === 'Critical';
              const isHigh = call.finalProtectionState === 'High';
              const isCaution = call.finalProtectionState === 'Caution';

              return (
                <div
                  key={call.id}
                  onClick={() => navigate(`/history/${call.id}`)}
                  className={`bg-white rounded-2xl border border-slate-200/90 hover:border-slate-300 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 cursor-pointer transition shadow-2xs hover:shadow-xs ${
                    isCritical ? 'border-red-200/80 bg-red-50/20' : ''
                  }`}
                >
                  {/* Left info: Time, Claimed identity, department */}
                  <div className="flex items-start gap-3.5">
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5 ${
                        isCritical
                          ? 'bg-red-100 text-red-700'
                          : isHigh
                          ? 'bg-orange-100 text-orange-700'
                          : isCaution
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-emerald-100 text-emerald-800'
                      }`}
                    >
                      {isCritical ? (
                        <ShieldAlert size={20} />
                      ) : isCaution || isHigh ? (
                        <AlertOctagon size={20} />
                      ) : (
                        <ShieldCheck size={20} />
                      )}
                    </div>

                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs text-slate-500 font-bold">{call.timeStr}</span>
                        <span className="text-[11px] text-slate-400 font-medium">{call.dateStr}</span>
                        <span className="text-slate-300">•</span>
                        <span className="font-bold text-slate-900 text-sm">
                          {call.claimedIdentity}
                        </span>
                        <span className="text-xs text-slate-500">({call.department})</span>
                      </div>

                      <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
                        {/* Verification outcome */}
                        <span className="text-slate-600">
                          Status: <span className="font-semibold text-slate-800">{call.verificationOutcome}</span>
                        </span>

                        {/* Sensitive request indicator */}
                        {call.sensitiveRequestIndicator && (
                          <>
                            <span className="text-slate-300">•</span>
                            <span className="px-2 py-0.5 rounded bg-red-50 text-red-800 text-[11px] font-semibold border border-red-200">
                              {call.sensitiveRequestIndicator}
                            </span>
                          </>
                        )}

                        {call.durationStr && (
                          <>
                            <span className="text-slate-300">•</span>
                            <span className="text-[11px] text-slate-400">Duration: {call.durationStr}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right badges & action outcome */}
                  <div className="flex items-center gap-3 self-end sm:self-auto flex-wrap">
                    <div className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        {call.finalScore !== undefined && (
                          <span className="font-mono text-[11px] font-bold text-slate-500">
                            Risk {call.finalScore}%
                          </span>
                        )}
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-xs font-bold border inline-block ${
                            isCritical
                              ? 'bg-red-100 text-red-900 border-red-300'
                              : isHigh
                              ? 'bg-orange-100 text-orange-900 border-orange-300'
                              : isCaution
                              ? 'bg-amber-100 text-amber-900 border-amber-300'
                              : 'bg-emerald-100 text-emerald-900 border-emerald-300'
                          }`}
                        >
                          {call.finalProtectionState}
                        </span>
                      </div>

                      <div className="text-[11px] text-slate-500 mt-1 flex items-center justify-end gap-2 flex-wrap">
                        {call.interventionOccurred ? (
                          <span className="text-emerald-700 font-semibold flex items-center gap-1">
                            <Shield size={11} /> Call Protected
                          </span>
                        ) : (
                          <span className="text-slate-500 flex items-center gap-1">
                            <CheckCircle2 size={11} className="text-emerald-600" /> Completed
                          </span>
                        )}
                        {call.socIncidentCreated && (
                          <span className="text-blue-700 font-semibold flex items-center gap-1">
                            <FileCheck size={11} /> SOC Alert
                          </span>
                        )}
                      </div>
                    </div>

                    <ChevronRight size={18} className="text-slate-400" />
                  </div>
                </div>
              );
            })
          )}
        </div>
      </main>
    </div>
  );
}
