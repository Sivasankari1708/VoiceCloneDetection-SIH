import { Mic, CheckCircle2, AlertCircle, RefreshCw, Radio, Sparkles } from 'lucide-react';
import type { ActiveLivenessState, LivenessOutcome } from '../../types/protection';

interface ActiveLivenessFlowProps {
  liveness: ActiveLivenessState;
  onStartChallenge: () => void;
  onReset: () => void;
  onSimulateOutcome?: (outcome: LivenessOutcome) => void;
}

export default function ActiveLivenessFlow({
  liveness,
  onStartChallenge,
  onReset,
  onSimulateOutcome,
}: ActiveLivenessFlowProps) {
  const isIdle = liveness.step === 'idle';
  const isChallenge = liveness.step === 'challenge';
  const isListening = liveness.step === 'listening';
  const isAnalysing = liveness.step === 'analysing';
  const isResult = liveness.step === 'result';

  return (
    <div className="card-enterprise p-5 border border-slate-200/80 bg-white/90">
      <div className="flex items-center justify-between pb-3 border-b border-slate-200/70">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
            <Radio size={16} />
          </div>
          <div>
            <div className="text-[10px] uppercase font-bold tracking-wider text-slate-400">
              Active Liveness Verification
            </div>
            <div className="text-sm font-bold text-slate-900">
              Interactive Speech Challenge
            </div>
          </div>
        </div>

        {isResult && (
          <span
            className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
              liveness.outcome === 'Liveness Passed'
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : liveness.outcome === 'Liveness Failed'
                ? 'bg-red-50 text-red-700 border-red-200'
                : 'bg-amber-50 text-amber-700 border-amber-200'
            }`}
          >
            {liveness.outcome}
          </span>
        )}
      </div>

      {/* Body state progression */}
      <div className="mt-4">
        {isIdle && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <p className="text-slate-600">
              Prompt the caller with a randomized challenge phrase to verify live, interactive vocal articulation.
            </p>
            <button
              onClick={onStartChallenge}
              className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-indigo-600 text-white hover:bg-indigo-700 transition-colors shadow-2xs whitespace-nowrap inline-flex items-center gap-1.5"
            >
              <Sparkles size={13} />
              <span>Initiate Liveness Challenge</span>
            </button>
          </div>
        )}

        {(isChallenge || isListening || isAnalysing) && (
          <div className="space-y-3">
            {/* Step Indicators */}
            <div className="grid grid-cols-3 gap-2 text-center text-xs font-medium">
              <div
                className={`py-1.5 px-2 rounded-lg border ${
                  isChallenge
                    ? 'bg-indigo-50 border-indigo-300 text-indigo-700 font-bold'
                    : 'bg-slate-50 border-slate-200 text-slate-400'
                }`}
              >
                1. Challenge
              </div>
              <div
                className={`py-1.5 px-2 rounded-lg border ${
                  isListening
                    ? 'bg-blue-50 border-blue-300 text-blue-700 font-bold animate-pulse'
                    : 'bg-slate-50 border-slate-200 text-slate-400'
                }`}
              >
                2. Listening...
              </div>
              <div
                className={`py-1.5 px-2 rounded-lg border ${
                  isAnalysing
                    ? 'bg-amber-50 border-amber-300 text-amber-700 font-bold animate-pulse'
                    : 'bg-slate-50 border-slate-200 text-slate-400'
                }`}
              >
                3. Analysing...
              </div>
            </div>

            {/* Instruction Card */}
            <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 text-center">
              <div className="text-[11px] text-slate-500 mb-1">Instruct the caller:</div>
              <div className="text-base font-bold text-slate-900 tracking-wide">
                “Please repeat: <span className="text-indigo-600 underline decoration-indigo-300">{liveness.challengePhrase}</span>”
              </div>

              <div className="mt-3 flex items-center justify-center gap-2 text-xs text-slate-600">
                <Mic size={14} className={isListening ? 'text-blue-600 animate-pulse' : 'text-slate-400'} />
                <span>
                  {isChallenge && 'Waiting for employee to speak phrase...'}
                  {isListening && 'Capturing caller vocal response...'}
                  {isAnalysing && 'Analyzing articulation dynamics & latency...'}
                </span>
              </div>
            </div>
          </div>
        )}

        {isResult && (
          <div className="space-y-3">
            <div
              className={`p-4 rounded-xl border text-xs ${
                liveness.outcome === 'Liveness Passed'
                  ? 'bg-emerald-50/70 border-emerald-200 text-emerald-950'
                  : liveness.outcome === 'Liveness Failed'
                  ? 'bg-red-50/70 border-red-200 text-red-950'
                  : 'bg-amber-50/70 border-amber-200 text-amber-950'
              }`}
            >
              <div className="flex items-start gap-2.5">
                {liveness.outcome === 'Liveness Passed' ? (
                  <CheckCircle2 size={18} className="text-emerald-600 flex-shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle size={18} className="text-amber-600 flex-shrink-0 mt-0.5" />
                )}
                <div>
                  <div className="font-bold text-sm">{liveness.outcome}</div>
                  <div className="mt-0.5 text-slate-700 leading-relaxed">
                    {liveness.outcome === 'Liveness Passed' &&
                      'Caller responded with expected phonetic phrase within authentic interactive latency.'}
                    {liveness.outcome === 'Liveness Inconclusive' &&
                      'Acoustic response was incomplete or masked by environmental audio. Re-challenge recommended.'}
                    {liveness.outcome === 'Liveness Failed' &&
                      'Caller response failed challenge phrase or exhibited synthetic pre-recorded latency signatures.'}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between text-xs pt-1">
              <span className="text-slate-400 italic">
                * Note: Active liveness proves live presence, not speaker identity.
              </span>
              <button
                onClick={onReset}
                className="text-indigo-600 hover:text-indigo-800 font-medium inline-flex items-center gap-1"
              >
                <RefreshCw size={12} />
                <span>Reset Challenge</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Manual outcome switcher for testing */}
      {onSimulateOutcome && (
        <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
          <span>Demo outcome:</span>
          <div className="flex gap-1">
            <button
              onClick={() => onSimulateOutcome('Liveness Passed')}
              className="px-1.5 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700"
            >
              Pass
            </button>
            <button
              onClick={() => onSimulateOutcome('Liveness Inconclusive')}
              className="px-1.5 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700"
            >
              Inconclusive
            </button>
            <button
              onClick={() => onSimulateOutcome('Liveness Failed')}
              className="px-1.5 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700"
            >
              Fail
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
