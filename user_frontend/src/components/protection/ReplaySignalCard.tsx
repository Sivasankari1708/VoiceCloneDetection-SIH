import { ShieldCheck, AlertOctagon, HelpCircle } from 'lucide-react';
import type { ReplayProtectionInfo } from '../../types/protection';

interface ReplaySignalCardProps {
  replay: ReplayProtectionInfo;
  onSetState?: (state: ReplayProtectionInfo['state']) => void;
  interactive?: boolean;
}

export default function ReplaySignalCard({ replay, onSetState, interactive = false }: ReplaySignalCardProps) {
  const isSuspected = replay.state === 'Replay suspected';
  const isInconclusive = replay.state === 'Analysis inconclusive';

  return (
    <div
      className={`card-enterprise p-4 transition-all text-xs ${
        isSuspected
          ? 'bg-amber-50/50 border-amber-200'
          : isInconclusive
          ? 'bg-slate-50 border-slate-200'
          : 'bg-white/90 border-slate-200/80'
      }`}
    >
      <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-200/60">
        <div className="flex items-center gap-2">
          {isSuspected ? (
            <AlertOctagon size={16} className="text-amber-600 flex-shrink-0" />
          ) : isInconclusive ? (
            <HelpCircle size={16} className="text-slate-500 flex-shrink-0" />
          ) : (
            <ShieldCheck size={16} className="text-emerald-600 flex-shrink-0" />
          )}
          <span className="font-bold text-slate-800">Replay Protection</span>
        </div>

        <span
          className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border ${
            isSuspected
              ? 'bg-amber-100 text-amber-900 border-amber-300'
              : isInconclusive
              ? 'bg-slate-200 text-slate-700 border-slate-300'
              : 'bg-emerald-100 text-emerald-800 border-emerald-300'
          }`}
        >
          {replay.state}
        </span>
      </div>

      <p className="mt-2.5 text-slate-600 leading-relaxed">
        {replay.description}
      </p>

      {interactive && onSetState && (
        <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400">
          <span>Demo state:</span>
          <div className="flex gap-1">
            <button
              onClick={() => onSetState('No replay indication')}
              className="px-1.5 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700"
            >
              Clear
            </button>
            <button
              onClick={() => onSetState('Replay suspected')}
              className="px-1.5 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700"
            >
              Suspected
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
