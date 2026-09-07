import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, ShieldCheck, ShieldAlert, AlertTriangle, Phone, Clock, Bell, ChevronRight, PhoneCall } from 'lucide-react';
import { useCallHistory } from '../context/AppContext';
import SeverityBadge from '../components/severity/SeverityBadge';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import type { SeverityLevel, CallHistoryItem } from '../types';
import { formatCallDuration } from '../utils/dataMapper';
import { fetchCallHistory } from '../services/calls/callHistoryService';

function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const hours = diff / (1000 * 60 * 60);
  if (hours < 24) {
    return `Today, ${date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`;
  } else if (hours < 48) {
    return `Yesterday, ${date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`;
  }
  return (
    date.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }) +
    ', ' +
    date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
  );
}

function OverallStatusBanner({ highestSeverity }: { highestSeverity: SeverityLevel }) {
  const configs = {
    SAFE: {
      icon: ShieldCheck,
      bg: 'bg-green-50 border-green-200',
      text: 'text-green-800',
      title: "You're protected",
      sub: 'VoiceShield is actively monitoring your communications.',
    },
    LOW: {
      icon: Shield,
      bg: 'bg-blue-50 border-blue-200',
      text: 'text-blue-800',
      title: 'Attention recommended',
      sub: 'A minor concern was detected recently.',
    },
    MEDIUM: {
      icon: AlertTriangle,
      bg: 'bg-amber-50 border-amber-200',
      text: 'text-amber-800',
      title: 'Attention recommended',
      sub: 'Unusual activity detected. Stay alert.',
    },
    HIGH: {
      icon: AlertTriangle,
      bg: 'bg-orange-50 border-orange-200',
      text: 'text-orange-800',
      title: 'Suspicious communication detected',
      sub: 'A recent call requires your attention.',
    },
    CRITICAL: {
      icon: ShieldAlert,
      bg: 'bg-red-50 border-red-200',
      text: 'text-red-800',
      title: 'Immediate attention required',
      sub: 'A critical security alert requires action.',
    },
  };
  const config = configs[highestSeverity];
  const Icon = config.icon;

  return (
    <div className={`rounded-xl border p-4 flex items-center gap-3 ${config.bg}`}>
      <Icon size={24} className={config.text} />
      <div>
        <div className={`font-semibold ${config.text}`}>{config.title}</div>
        <div className={`text-sm opacity-80 ${config.text}`}>{config.sub}</div>
      </div>
    </div>
  );
}

export default function HomePage() {
  const navigate = useNavigate();
  const { callHistory } = useCallHistory();
  const [backendCalls, setBackendCalls] = useState<CallHistoryItem[]>([]);

  useEffect(() => {
    fetchCallHistory().then((calls) => setBackendCalls(calls)).catch(() => {});
  }, []);

  const allCalls: CallHistoryItem[] = [
    ...callHistory,
    ...backendCalls.filter((bc) => !callHistory.find((c) => c.id === bc.id)),
  ].sort((a, b) => b.startTime.getTime() - a.startTime.getTime());

  // Determine overall status
  const severityOrder: SeverityLevel[] = ['SAFE', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
  const highestSeverity: SeverityLevel = allCalls.slice(0, 3).reduce<SeverityLevel>((acc, call) => {
    return severityOrder.indexOf(call.finalSeverity) > severityOrder.indexOf(acc) ? call.finalSeverity : acc;
  }, 'SAFE');

  const hasActiveAlert = allCalls.some((c) => c.finalSeverity === 'CRITICAL' || c.finalSeverity === 'HIGH');

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Your Communication Security</h1>
        <p className="text-slate-500 text-sm mt-1">Real-time AI voice clone and social engineering defense.</p>
      </div>

      {/* Status */}
      <OverallStatusBanner highestSeverity={highestSeverity} />

      {/* Active Alert */}
      {hasActiveAlert && (
        <Card className="border-orange-200 bg-orange-50">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <ShieldAlert size={16} className="text-orange-600" />
                <span className="text-sm font-semibold text-orange-800">Potential impersonation attempt detected</span>
              </div>
              <p className="text-sm text-orange-700">1 or more communications require your attention.</p>
            </div>
            <Button variant="primary" size="sm" onClick={() => navigate('/history')}>
              View Calls
            </Button>
          </div>
        </Card>
      )}

      {/* Quick Actions */}
      <div>
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">Quick Actions</h2>
        <div className="grid grid-cols-3 gap-3">
          <button
            onClick={() => navigate('/sender')}
            className="flex flex-col items-center gap-2 p-4 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors shadow-sm cursor-pointer"
          >
            <PhoneCall size={22} />
            <span className="text-xs font-semibold text-center">Start Call</span>
          </button>
          <button
            onClick={() => navigate('/history')}
            className="flex flex-col items-center gap-2 p-4 bg-white border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-50 transition-colors cursor-pointer"
          >
            <Clock size={22} />
            <span className="text-xs font-semibold text-center">Call History</span>
          </button>
          <button
            onClick={() => navigate('/notifications')}
            className="flex flex-col items-center gap-2 p-4 bg-white border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-50 transition-colors relative cursor-pointer"
          >
            <Bell size={22} />
            <span className="text-xs font-semibold text-center">Notifications</span>
          </button>
        </div>
      </div>

      {/* Recent Calls */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">Recent Calls</h2>
          <button
            onClick={() => navigate('/history')}
            className="text-xs text-blue-600 hover:underline flex items-center gap-1 cursor-pointer"
          >
            View all <ChevronRight size={12} />
          </button>
        </div>

        {allCalls.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-xl p-6 text-center text-slate-400">
            <Phone size={32} className="mx-auto mb-2 opacity-40" />
            <p className="text-sm font-medium text-slate-600">No calls analyzed yet</p>
            <p className="text-xs text-slate-400 mt-1">Start a call from Call Sender or wait for an incoming call.</p>
            <Button variant="outline" size="sm" className="mt-4" onClick={() => navigate('/sender')}>
              Open Call Sender
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {allCalls.slice(0, 3).map((call) => (
              <Card key={call.id} hoverable padding="sm" onClick={() => navigate(`/history/${call.id}`)}>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-slate-700 text-white text-sm font-semibold flex items-center justify-center flex-shrink-0">
                    {call.caller.name
                      .split(' ')
                      .map((n) => n[0])
                      .join('')
                      .slice(0, 2)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-slate-900 text-sm truncate">{call.caller.name}</span>
                      <span className="text-slate-400 text-xs">·</span>
                      <span className="text-slate-500 text-xs truncate">{call.caller.claimedRole || 'Inbound Voice Call'}</span>
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">{formatRelativeTime(call.startTime)}</div>
                  </div>
                  <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                    <SeverityBadge level={call.finalSeverity} size="sm" />
                    <span className="text-xs text-slate-400">{formatCallDuration(call.duration)}</span>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}