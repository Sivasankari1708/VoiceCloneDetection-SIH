import { useState } from 'react';
import { FlaskConical, ChevronUp, ChevronDown, Copy, CheckCircle } from 'lucide-react';
import type { ScenarioId } from '../../types';
import { DEMO_SCENARIOS } from '../../mock-data/scenarios';

interface DemoControllerProps {
  currentOtp?: string | null;
  onScenarioSelect?: (id: ScenarioId) => void;
  currentScenario?: ScenarioId | null;
  isCallActive?: boolean;
}

const SCENARIO_ORDER: ScenarioId[] = [
  'ai_cloned_cfo',
  'genuine_executive',
  'human_impersonator',
  'fake_government_official',
  'normal_conversation',
];

export default function DemoController({ currentOtp, onScenarioSelect, currentScenario, isCallActive }: DemoControllerProps) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (currentOtp) {
      navigator.clipboard.writeText(currentOtp).catch(() => {});
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-2" aria-label="Demo controller panel">
      {open && (
        <div className="w-64 bg-slate-900 text-white rounded-xl shadow-2xl border border-slate-700 overflow-hidden">
          {/* Header */}
          <div className="bg-amber-500 px-3 py-2 flex items-center gap-2">
            <FlaskConical size={14} />
            <span className="text-xs font-bold tracking-wide">DEMO MODE</span>
            <span className="text-xs opacity-75 ml-auto">Not for production</span>
          </div>

          <div className="p-3 space-y-3">
            {/* OTP */}
            {currentOtp && (
              <div>
                <div className="text-xs text-slate-400 mb-1 font-medium">Current OTP</div>
                <div className="flex items-center gap-2 bg-slate-800 rounded-lg px-3 py-2">
                  <span className="font-mono text-lg font-bold text-amber-400 tracking-widest flex-1">{currentOtp}</span>
                  <button
                    onClick={handleCopy}
                    className="text-slate-400 hover:text-white transition-colors"
                    aria-label="Copy OTP"
                  >
                    {copied ? <CheckCircle size={14} className="text-green-400" /> : <Copy size={14} />}
                  </button>
                </div>
              </div>
            )}

            {/* Scenarios */}
            <div>
              <div className="text-xs text-slate-400 mb-2 font-medium">Demo Scenarios</div>
              <div className="space-y-1">
                {SCENARIO_ORDER.map(id => {
                  const scenario = DEMO_SCENARIOS[id];
                  const isActive = currentScenario === id;
                  return (
                    <button
                      key={id}
                      onClick={() => onScenarioSelect?.(id)}
                      disabled={isCallActive}
                      className={`w-full text-left px-2.5 py-2 rounded-lg text-xs transition-all
                        ${isActive ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800'}
                        ${isCallActive ? 'opacity-40 cursor-not-allowed' : ''}
                      `}
                    >
                      <div className="font-medium">{scenario.name}</div>
                      <div className="opacity-60 text-xs mt-0.5">{scenario.description}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            {isCallActive && (
              <div className="text-xs text-amber-400 bg-amber-900/30 px-2 py-1.5 rounded">
                End the current call to switch scenarios
              </div>
            )}
          </div>
        </div>
      )}

      {/* Toggle button */}
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 bg-slate-900 text-white px-3 py-2 rounded-xl shadow-lg border border-slate-700 hover:bg-slate-800 transition-colors text-xs font-bold"
        aria-expanded={open}
        aria-label="Toggle demo controller"
      >
        <FlaskConical size={14} className="text-amber-400" />
        DEMO
        {open ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
      </button>
    </div>
  );
}
