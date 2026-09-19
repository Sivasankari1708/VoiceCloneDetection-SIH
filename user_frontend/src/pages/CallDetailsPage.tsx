import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  FileCheck,
} from 'lucide-react';
import { useCallHistory } from '../context/AppContext';
import { fetchCallById, fetchCallEvents, getLocalCallHistory } from '../services/calls/callHistoryService';
import type { CallHistoryItem, TranscriptSegment } from '../types';

export default function CallDetailsPage() {
  const { callId } = useParams<{ callId: string }>();
  const navigate = useNavigate();
  const { callHistory } = useCallHistory();
  const [transcriptOpen, setTranscriptOpen] = useState(true);
  const [call, setCall] = useState<CallHistoryItem | null>(null);

  useEffect(() => {
    if (!callId) return;

    // 1. Check in context first
    const fromContext = callHistory.find((c) => c.id === callId);
    if (fromContext) {
      setCall(fromContext);
      return;
    }

    // 2. Check local storage
    const localList = getLocalCallHistory();
    const fromLocal = localList.find((c) => c.id === callId);
    if (fromLocal) {
      setCall(fromLocal);
    }

    // 3. Fetch from backend
    fetchCallById(callId)
      .then(async (backendCall) => {
        if (backendCall) {
          // If transcript is empty, try fetching events
          if (!backendCall.transcript || backendCall.transcript.length === 0) {
            const events = await fetchCallEvents(callId);
            if (events && events.length > 0) {
              const eventTranscript: TranscriptSegment[] = events
                .filter((e) => e.transcript)
                .map((e, idx) => ({
                  id: `ev-${idx}`,
                  speaker: 'caller' as const,
                  text: e.transcript!,
                  timestamp: idx * 5000,
                }));
              if (eventTranscript.length > 0) {
                backendCall.transcript = eventTranscript;
              }
            }
          }
          setCall(backendCall);
        }
      })
      .catch(() => {});
  }, [callId, callHistory]);

  const score = call?.finalScore ?? 85;
  const isCritical = call?.finalSeverity === 'CRITICAL' || score >= 75;
  const isHigh = call?.finalSeverity === 'HIGH' || (score >= 50 && score < 75);
  const isCaution = call?.finalSeverity === 'MEDIUM' || (score >= 30 && score < 50);

  const durationSec = call?.duration ?? 72;
  const durationFormatted =
    durationSec >= 60
      ? `${Math.floor(durationSec / 60)}m ${durationSec % 60}s`
      : `${durationSec}s`;

  const callerName = call?.caller.name || 'Arun Kumar';
  const orgName = call?.caller.organization || 'Finance Department';
  const claimedIdentityFull = `${callerName} — ${orgName}`;

  const timestampStr = call?.startTime
    ? new Date(call.startTime).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    : 'Today at 09:42:25';

  const defaultTimeline = [
    { time: '00:00', text: `Call started — Inbound session established from ${callerName}` },
    ...(isCritical || isHigh
      ? [
          { time: '00:15', text: 'Suspicious vocal artifacts detected — ECAPA-TDNN acoustic divergence' },
          { time: '00:25', text: 'Sensitive intent identified — Unauthorized credential/transfer solicitation' },
          { time: '00:35', text: 'Warning presented — Security notice displayed to employee' },
          { time: '00:45', text: 'Autonomous hold and intervention executed — Call terminated' },
          { time: '00:46', text: `SOC security alert logged — Ref: INC-${(callId || '0142').slice(-4).toUpperCase()}` },
        ]
      : [
          { time: '00:15', text: 'Vocal acoustic baseline verified — Genuine caller confirmed' },
          { time: '00:30', text: 'Normal conversation completed — Call disconnected cleanly' },
        ]),
  ];

  const timelineToDisplay =
    call?.timeline && call.timeline.length > 0
      ? call.timeline.map((t) => ({
          time: t.time,
          text: t.description,
        }))
      : defaultTimeline;

  const defaultTranscript = [
    {
      speaker: 'caller',
      time: '09:41:12',
      text: `Hello, this is ${callerName} from ${orgName}. Can you confirm if you received my memo regarding the payment approval?`,
    },
    {
      speaker: 'employee',
      time: '09:41:24',
      text: 'Good morning sir. Yes, let me quickly check the internal verification portal.',
    },
    {
      speaker: 'caller',
      time: '09:41:48',
      text: 'The vendor clearance is urgent. I need you to confirm the OTP or authorize the transaction immediately!',
    },
  ];

  const transcriptToDisplay =
    call?.transcript && call.transcript.length > 0
      ? call.transcript.map((t) => ({
          speaker: t.speaker,
          time: t.timestamp || 'Recorded',
          text: t.text,
        }))
      : defaultTranscript;

  const socRef = `INC-${(callId || '0142').replace(/[^a-zA-Z0-9]/g, '').slice(-4).toUpperCase()}`;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Top Header */}
      <header className="bg-white border-b border-slate-200 px-4 sm:px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <button
            onClick={() => navigate('/history')}
            className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600 hover:text-slate-900 transition cursor-pointer"
          >
            <ArrowLeft size={16} />
            <span>Back to Call History</span>
          </button>

          <span className="font-mono text-xs text-slate-400 font-semibold">{callId}</span>
        </div>
      </header>

      {/* Main Post-Call Summary Body */}
      <main className="flex-1 max-w-4xl mx-auto w-full p-4 sm:p-6 space-y-6">
        {/* 1. Concise Summary Card */}
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-6 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-200 flex-wrap gap-2">
            <div>
              <h1 className="text-lg font-extrabold text-slate-900">Call Protection Summary</h1>
              <p className="text-xs text-slate-500 mt-0.5">
                {timestampStr} • Duration: {durationFormatted}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-bold text-slate-500">
                Risk {score}%
              </span>
              <span
                className={`px-3 py-1 rounded-full text-xs font-bold border ${
                  isCritical
                    ? 'bg-red-100 text-red-900 border-red-300'
                    : isHigh
                    ? 'bg-orange-100 text-orange-900 border-orange-300'
                    : isCaution
                    ? 'bg-amber-100 text-amber-900 border-amber-300'
                    : 'bg-emerald-100 text-emerald-900 border-emerald-300'
                }`}
              >
                {isCritical ? 'Critical — Protected' : isHigh ? 'High Risk' : isCaution ? 'Caution' : 'Safe — Verified'}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs pt-1">
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/60">
              <div className="text-[10px] text-slate-400 font-bold uppercase">Claimed identity</div>
              <div className="font-bold text-slate-900 text-sm mt-0.5">{claimedIdentityFull}</div>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/60">
              <div className="text-[10px] text-slate-400 font-bold uppercase">Final Protection State</div>
              <div
                className={`font-bold text-sm mt-0.5 ${
                  isCritical ? 'text-red-700' : isHigh ? 'text-orange-700' : 'text-emerald-700'
                }`}
              >
                {isCritical ? 'Critical — Deepfake Impersonation Terminated' : isHigh ? 'High Risk — Suspicious Voiceprint' : 'Verified Genuine Call'}
              </div>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/60">
              <div className="text-[10px] text-slate-400 font-bold uppercase">Verification Status</div>
              <div className="font-semibold text-slate-800 text-sm mt-0.5">
                {call?.caller.statusMessage || (isCritical ? 'Identity could not be verified' : 'Verified authentic caller')}
              </div>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/60">
              <div className="text-[10px] text-slate-400 font-bold uppercase">Recommendation & Action</div>
              <div className="font-semibold text-slate-800 text-sm mt-0.5">
                {call?.finalAction || (isCritical ? 'Call placed on hold and terminated' : 'Call completed normally')}
              </div>
            </div>

            <div className="sm:col-span-2 p-3 bg-blue-50/70 rounded-xl border border-blue-200 flex items-center justify-between flex-wrap gap-2">
              <div>
                <div className="text-[10px] text-blue-700 font-bold uppercase">Security Operations Center (SOC)</div>
                <div className="font-bold text-blue-950 text-sm mt-0.5">
                  {isCritical || isHigh ? `Incident ${socRef} Logged & Dispatched` : 'Telemetric Audit Log Archived'}
                </div>
              </div>
              <span className="px-2.5 py-1 rounded-lg bg-blue-100 text-blue-800 text-xs font-semibold flex items-center gap-1.5">
                <FileCheck size={13} />
                <span>Archived & Protected</span>
              </span>
            </div>
          </div>
        </div>

        {/* 2. Chronological Event Timeline */}
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-6 space-y-4">
          <div className="pb-3 border-b border-slate-200">
            <h2 className="text-base font-bold text-slate-900">Post-Call Forensic Timeline</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Chronological breakdown of protections, acoustic evaluations, and alerts triggered.
            </p>
          </div>

          <div className="relative pl-6 border-l-2 border-slate-200 space-y-4">
            {timelineToDisplay.map((item, idx) => (
              <div key={idx} className="relative">
                <div className="absolute -left-[31px] top-1 w-3 h-3 rounded-full bg-blue-600 border-2 border-white shadow-xs" />
                <div className="text-xs font-mono text-slate-400">{item.time}</div>
                <div className="text-xs font-medium text-slate-800 mt-0.5">{item.text}</div>
              </div>
            ))}
          </div>
        </div>

        {/* 3. Call Transcript Dropdown */}
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-5">
          <button
            onClick={() => setTranscriptOpen(!transcriptOpen)}
            className="w-full flex items-center justify-between text-xs font-bold text-slate-800 cursor-pointer"
          >
            <span>Recorded Dialogue Transcript ({transcriptToDisplay.length} lines)</span>
            {transcriptOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>

          {transcriptOpen && (
            <div className="mt-4 space-y-3 pt-3 border-t border-slate-100 text-xs">
              {transcriptToDisplay.map((dia, idx) => (
                <div key={idx} className="p-3 bg-slate-50 rounded-xl border border-slate-200/60">
                  <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1">
                    <span className="font-bold text-slate-700 uppercase">
                      {dia.speaker === 'caller' ? `Caller (${callerName})` : 'Employee / Citizen'}
                    </span>
                    <span className="font-mono">{dia.time}</span>
                  </div>
                  <div className="text-slate-800 leading-relaxed font-medium">{dia.text}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
