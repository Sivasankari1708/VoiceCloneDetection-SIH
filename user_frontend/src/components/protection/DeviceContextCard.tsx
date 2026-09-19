import { Smartphone, Wifi, Activity, MapPin, Info } from 'lucide-react';
import type { DeviceNetworkContext } from '../../types/protection';

interface DeviceContextCardProps {
  context: DeviceNetworkContext;
}

export default function DeviceContextCard({ context }: DeviceContextCardProps) {
  return (
    <div className="card-enterprise p-4 border border-slate-200/80 bg-white/90 text-xs">
      <div className="flex items-center justify-between pb-2.5 border-b border-slate-200/60 mb-3">
        <span className="font-bold text-slate-800 uppercase tracking-wider text-[11px]">
          Call Context (Supporting Telemetry)
        </span>
        <span className="text-[10px] text-slate-400 font-medium flex items-center gap-1">
          <Info size={11} /> Context Only
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <div className="p-2 bg-slate-50 rounded-lg border border-slate-200/60 flex items-center gap-2">
          <Smartphone size={15} className="text-slate-500 flex-shrink-0" />
          <div className="min-w-0">
            <div className="text-[10px] text-slate-400">Device</div>
            <div className="text-slate-800 font-semibold truncate">{context.device}</div>
          </div>
        </div>

        <div className="p-2 bg-slate-50 rounded-lg border border-slate-200/60 flex items-center gap-2">
          <Wifi size={15} className="text-slate-500 flex-shrink-0" />
          <div className="min-w-0">
            <div className="text-[10px] text-slate-400">Network</div>
            <div className="text-slate-800 font-semibold truncate">{context.network}</div>
          </div>
        </div>

        <div className="p-2 bg-slate-50 rounded-lg border border-slate-200/60 flex items-center gap-2">
          <Activity size={15} className="text-slate-500 flex-shrink-0" />
          <div className="min-w-0">
            <div className="text-[10px] text-slate-400">Call Quality</div>
            <div className="text-slate-800 font-semibold truncate">{context.callQuality}</div>
          </div>
        </div>

        <div className="p-2 bg-slate-50 rounded-lg border border-slate-200/60 flex items-center gap-2">
          <MapPin size={15} className="text-slate-500 flex-shrink-0" />
          <div className="min-w-0">
            <div className="text-[10px] text-slate-400">Location Context</div>
            <div className="text-slate-800 font-semibold truncate">{context.locationContext}</div>
          </div>
        </div>
      </div>

      <div className="mt-2.5 text-[10px] text-slate-400 leading-snug">
        Device and network context are supporting telemetry only and do not determine caller identity, authenticity, or native language.
      </div>
    </div>
  );
}
