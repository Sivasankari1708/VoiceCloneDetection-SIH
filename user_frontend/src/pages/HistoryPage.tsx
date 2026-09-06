import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { useCallHistory } from '../context/AppContext';
import { MOCK_CALL_HISTORY } from '../mock-data';
import SeverityBadge from '../components/severity/SeverityBadge';
import Card from '../components/ui/Card';
import type { CallHistoryItem, SeverityLevel } from '../types';
import { formatCallDuration } from '../utils/dataMapper';
import { fetchCallHistory } from '../services/calls/callHistoryService';

type FilterLevel = 'ALL' | SeverityLevel;
const FILTERS: FilterLevel[] = ['ALL', 'SAFE', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];


function formatDate(date: Date): string {
  const now = new Date();
  const diffH = (now.getTime() - date.getTime()) / 3600000;
  const time = date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  if (diffH < 24) return `Today, ${time}`;
  if (diffH < 48) return `Yesterday, ${time}`;
  return date.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }) + `, ${time}`;
}

function getInitials(name: string) {
  return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
}

function CallItem({ call, onClick }: { call: CallHistoryItem; onClick: () => void }) {
  return (
    <Card hoverable padding="sm" onClick={onClick}>
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-slate-700 text-white text-sm font-semibold flex items-center justify-center flex-shrink-0">
          {getInitials(call.caller.name)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="font-medium text-slate-900 text-sm">{call.caller.name}</span>
            <span className="text-slate-400 text-xs hidden sm:inline">· {call.caller.claimedRole}</span>
          </div>
          <div className="text-xs text-slate-400 mt-0.5">{formatDate(call.startTime)} · {formatCallDuration(call.duration)}</div>
        </div>
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-xs font-bold text-slate-700">{call.finalScore}/100</span>
            <SeverityBadge level={call.finalSeverity} size="sm" />
          </div>
          <span className="text-xs text-slate-400 max-w-32 truncate text-right">{call.finalAction}</span>
        </div>
        <ChevronRight size={16} className="text-slate-300 flex-shrink-0" />
      </div>
    </Card>
  );
}

export default function HistoryPage() {
  const navigate = useNavigate();
  const { callHistory } = useCallHistory();
  const [filter, setFilter] = useState<FilterLevel>('ALL');
  const [backendCalls, setBackendCalls] = useState<CallHistoryItem[]>([]);

  // Fetch real call history from backend on mount
  useEffect(() => {
    fetchCallHistory().then(calls => setBackendCalls(calls)).catch(() => {});
  }, []);

  const allCalls: CallHistoryItem[] = [
    ...callHistory,
    ...backendCalls.filter(bc => !callHistory.find(c => c.id === bc.id)),
    ...MOCK_CALL_HISTORY.filter(mc => !callHistory.find(c => c.id === mc.id) && !backendCalls.find(bc => bc.id === mc.id)),
  ].sort((a, b) => b.startTime.getTime() - a.startTime.getTime());


  const filtered = filter === 'ALL' ? allCalls : allCalls.filter(c => c.finalSeverity === filter);

  return (
    <div className="max-w-2xl mx-auto p-4 md:p-6 space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Call History</h1>
        <p className="text-slate-500 text-sm mt-1">{allCalls.length} calls analyzed</p>
      </div>

      {/* Filters */}
      <div className="flex gap-1.5 flex-wrap">
        {FILTERS.map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all
              ${filter === f
                ? 'bg-blue-600 text-white'
                : 'bg-white border border-slate-200 text-slate-600 hover:border-slate-300'}`}
          >
            {f === 'ALL' ? 'All' : f.charAt(0) + f.slice(1).toLowerCase()}
            <span className="ml-1.5 opacity-60">
              {f === 'ALL' ? allCalls.length : allCalls.filter(c => c.finalSeverity === f).length}
            </span>
          </button>
        ))}
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="text-center py-12 text-slate-400">
          <div className="text-4xl mb-3">📞</div>
          <div className="font-medium">No {filter === 'ALL' ? '' : filter.toLowerCase() + ' '}calls found</div>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(call => (
            <CallItem key={call.id} call={call} onClick={() => navigate(`/history/${call.id}`)} />
          ))}
        </div>
      )}
    </div>
  );
}
