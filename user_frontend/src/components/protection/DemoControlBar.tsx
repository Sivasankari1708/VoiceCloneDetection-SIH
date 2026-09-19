import { useState, useEffect } from 'react';
import { RotateCcw, ChevronRight, Globe, Sparkles, PhoneCall, Bot, Volume2 } from 'lucide-react';
import { useDemoScenario, MULTILINGUAL_PRESETS } from '../../context/DemoScenarioContext';
import { warningAudioService } from '../../services/warningAudioService';

export default function DemoControlBar() {
  const {
    callMode,
    setCallMode,
    sihStep,
    runFullSihScenario,
    runNextSihStep,
    resetSihScenario,
    isAutoAdvancing,
    selectedLanguage,
    setSelectedLanguage,
    hasActiveCall,
    transcript,
  } = useDemoScenario();

  const [audioState, setAudioState] = useState(() => warningAudioService.getState());

  useEffect(() => {
    return warningAudioService.subscribe((s) => setAudioState(s));
  }, []);

  return (
    <div className="bg-slate-900 text-white border-b border-slate-800 px-4 py-2.5 shadow-md">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-3">
        {/* Left: Mode Segregation Switcher */}
        <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-start">
          <div className="inline-flex rounded-lg p-0.5 bg-slate-800 border border-slate-700/80">
            <button
              onClick={() => {
                setCallMode('live');
              }}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-bold transition cursor-pointer ${
                callMode === 'live'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <PhoneCall size={13} />
              <span>Live Call Mode</span>
              {callMode === 'live' && hasActiveCall && (
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse ml-0.5" />
              )}
            </button>

            <button
              onClick={() => {
                setCallMode('simulation');
                if (transcript.length === 0 || sihStep === 1) {
                  resetSihScenario();
                }
              }}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-bold transition cursor-pointer ${
                callMode === 'simulation'
                  ? 'bg-amber-400 text-slate-950 shadow-xs'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Bot size={13} />
              <span>Attack Simulation</span>
              <span className="px-1 py-0.2 rounded text-[9px] bg-slate-950 text-amber-300 font-bold">
                SIH
              </span>
            </button>
          </div>

          {callMode === 'simulation' ? (
            <div className="flex items-center gap-1.5 text-xs text-slate-300">
              <span className="text-slate-400">Step:</span>
              <span className="font-bold text-amber-300">
                {sihStep === 1 && '1. Initial Call (Safe)'}
                {sihStep === 2 && '2. Suspicious Urgency (Caution)'}
                {sihStep === 3 && '3. Sensitive OTP Request (Critical)'}
                {sihStep >= 4 && '4. Autonomous Intervention (Active)'}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-xs text-slate-300">
              <span className={`w-2 h-2 rounded-full ${hasActiveCall ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
              <span className="text-slate-300 font-medium">
                {hasActiveCall ? 'Live Call Stream Active' : 'Standby (Waiting for Inbound Call)'}
              </span>
            </div>
          )}
        </div>

        {/* Right side: Language Selector + Simulation Actions */}
        <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-end flex-wrap">
          {/* Multilingual Announcement Selector (Always Visible in Live & Simulation modes) */}
          <div className="flex items-center gap-1.5 text-xs bg-slate-800/90 px-2 py-1 rounded-lg border border-slate-700">
            <Globe size={13} className="text-blue-400 flex-shrink-0" />
            <span className="text-[11px] text-slate-400 font-medium hidden sm:inline">Warning Language:</span>
            <select
              value={selectedLanguage.language}
              onChange={(e) => {
                const found = MULTILINGUAL_PRESETS.find((p) => p.language === e.target.value);
                if (found) setSelectedLanguage(found);
              }}
              className="bg-transparent text-slate-200 text-xs font-bold focus:outline-none focus:text-white cursor-pointer"
              title="Configure target user's preferred spoken warning language (Google Cloud TTS)"
            >
              {MULTILINGUAL_PRESETS.map((p) => (
                <option key={p.language} value={p.language} className="bg-slate-900 text-white">
                  {p.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => {
                warningAudioService.initAudioPlayback();
                warningAudioService.playSecurityWarning(
                  'CRITICAL',
                  selectedLanguage.code || selectedLanguage.language,
                  true
                );
              }}
              className="ml-1 p-1 rounded hover:bg-slate-700 text-slate-300 hover:text-white transition cursor-pointer flex items-center gap-1 text-[11px]"
              title={`Test / Play warning audio in ${selectedLanguage.language}`}
            >
              <Volume2 size={13} className={audioState.isSpeaking ? 'text-emerald-400 animate-pulse' : 'text-blue-400'} />
              <span className="text-[10px] hidden md:inline">{audioState.isSpeaking ? 'Playing...' : 'Test Audio'}</span>
            </button>
          </div>

          {callMode === 'simulation' && (
            <>
              {/* Run Full SIH Demo */}
              <button
                onClick={runFullSihScenario}
                disabled={isAutoAdvancing}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white transition disabled:opacity-50 cursor-pointer shadow-xs"
                title="Runs complete continuous SIH demonstration from start to finish"
              >
                <Sparkles size={13} className={isAutoAdvancing ? 'animate-spin' : ''} />
                <span>{isAutoAdvancing ? 'Running...' : 'Run Full SIH Demo'}</span>
              </button>

              {/* Step-by-Step Advance */}
              <button
                onClick={runNextSihStep}
                disabled={isAutoAdvancing || sihStep >= 4}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition disabled:opacity-40 cursor-pointer"
                title="Advance to next step in SIH scenario"
              >
                <span>Next Step</span>
                <ChevronRight size={14} />
              </button>

              {/* Reset */}
              <button
                onClick={resetSihScenario}
                disabled={isAutoAdvancing}
                className="inline-flex items-center gap-1 p-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white border border-slate-700 transition cursor-pointer"
                title="Reset simulation to initial state"
              >
                <RotateCcw size={14} />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

