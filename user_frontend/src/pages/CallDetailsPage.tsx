import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Clock, Phone, AlertCircle, CheckCircle, Info, ChevronDown, ChevronUp } from 'lucide-react';
import { useCallHistory } from '../context/AppContext';
import { MOCK_CALL_HISTORY } from '../mock-data';
import SeverityBadge from '../components/severity/SeverityBadge';
import ConversationSignalTag from '../components/call/ConversationSignalTag';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import type { CallTimelineEvent } from '../types';
import { formatCallDuration } from '../utils/dataMapper';

const TIMELINE_ICON = {
  info: <Info size={13} className="text-blue-500" />,
  warning: <AlertCircle size={13} className="text-amber-500" />,
  critical: <AlertCircle size={13} className="text-red-500" />,
  success: <CheckCircle size={13} className="text-green-500" />,
};

const TIMELINE_DOT: Record<string, string> = {
  info: 'bg-blue-400',
  warning: 'bg-amber-400',
  critical: 'bg-red-500',
  success: 'bg-green-500',
};

function TimelineItem({ event, isLast }: { event: CallTimelineEvent; isLast: boolean }) {
  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center">
        <div className={`w-3 h-3 rounded-full flex-shrink-0 mt-0.5 ${TIMELINE_DOT[event.type]}`} />
        {!isLast && <div className="w-px flex-1 bg-slate-200 my-1" />}
      </div>
      <div className={`pb-4 ${isLast ? '' : ''}`}>
        <span className="text-xs text-slate-400 font-mono">{event.time}</span>
        <div className="text-sm text-slate-700 mt-0.5 flex items-start gap-1.5">
          {TIMELINE_ICON[event.type]}
          {event.description}
        </div>
      </div>
    </div>
  );
}

export default function CallDetailsPage() {
  const { callId } = useParams<{ callId: string }>();
  const navigate = useNavigate();
  const { callHistory } = useCallHistory();
  const [transcriptOpen, setTranscriptOpen] = useState(false);

  const allCalls = [
    ...callHistory,
    ...MOCK_CALL_HISTORY.filter(mc => !callHistory.find(c => c.id === mc.id)),
  ];
  const call = allCalls.find(c => c.id === callId);

  if (!call) {
    return (
      <div className="max-w-2xl mx-auto p-6 text-center">
        <div className="text-4xl mb-4">🔍</div>
        <h2 className="text-lg font-semibold text-slate-900">Call not found</h2>
        <p className="text-slate-500 text-sm mt-1">This call record doesn't exist.</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate('/history')}>
          Back to History
        </Button>
      </div>
    );
  }

  const formatDate = (d: Date) => d.toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) +
    ' · ' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="max-w-2xl mx-auto p-4 md:p-6 space-y-5">
      <button onClick={() => navigate('/history')} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700">
        <ArrowLeft size={15} /> Call History
      </button>

      {/* Header */}
      <Card>
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-full bg-slate-700 text-white text-xl font-semibold flex items-center justify-center flex-shrink-0">
            {call.caller.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
          </div>
          <div className="flex-1">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h1 className="text-lg font-bold text-slate-900">{call.caller.name}</h1>
                <div className="text-slate-500 text-sm">{call.caller.claimedRole}</div>
              </div>
              <SeverityBadge level={call.finalSeverity} size="md" />
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-3 text-xs text-slate-500">
              <div className="flex items-center gap-1"><Clock size={11} /> {formatDate(call.startTime)}</div>
              <div className="flex items-center gap-1"><Phone size={11} /> {formatCallDuration(call.duration)}</div>
              <div className="col-span-2 mt-1 font-medium text-slate-600">{call.finalAction}</div>
            </div>
          </div>
        </div>
      </Card>

      {/* Signals */}
      {call.signals.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Detected in this call</div>
          <div className="flex flex-wrap gap-2">
            {call.signals.map(s => <ConversationSignalTag key={s.type} signal={s} />)}
          </div>
        </div>
      )}

      {/* Timeline */}
      <Card header={<span className="text-sm font-semibold text-slate-700">What happened</span>}>
        <div className="pt-2">
          {call.timeline.map((evt, i) => (
            <TimelineItem key={i} event={evt} isLast={i === call.timeline.length - 1} />
          ))}
        </div>
      </Card>

      {/* Summary */}
      <Card header={<span className="text-sm font-semibold text-slate-700">Summary</span>}>
        <p className="text-sm text-slate-600">{call.summary}</p>
      </Card>

      {/* Recommendation */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <div className="text-sm font-semibold text-blue-900 mb-1">Recommended action</div>
        <p className="text-sm text-blue-800">{call.recommendation}</p>
      </div>

      {/* Transcript (collapsible) */}
      {call.transcript.length > 0 && (
        <Card>
          <button
            onClick={() => setTranscriptOpen(o => !o)}
            className="flex items-center justify-between w-full text-sm font-semibold text-slate-700"
          >
            <span>Transcript ({call.transcript.length} segments)</span>
            {transcriptOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </button>
          {transcriptOpen && (
            <div className="mt-3 space-y-2">
              {call.transcript.map(seg => (
                <div key={seg.id} className="text-sm text-slate-600 bg-slate-50 rounded-lg p-2">
                  <span className="text-xs font-medium text-slate-400 mr-2">{seg.speaker === 'caller' ? 'Caller' : 'You'}</span>
                  &ldquo;{seg.text}&rdquo;
                </div>
              ))}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
