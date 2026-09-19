import { useState, useEffect, useRef, type ReactNode } from 'react';
import { Radio, Send } from 'lucide-react';
import type { DemoTranscriptItem } from '../../context/DemoScenarioContext';
import type { TranscriptSegment } from '../../types';
import { SENSITIVE_KEYWORDS_REGEX } from '../../utils/sensitiveDataDetector';

interface TranscriptDisplayProps {
  items?: DemoTranscriptItem[];
  segments?: TranscriptSegment[];
  interimTranscript?: { speaker: 'caller' | 'employee'; text: string } | null;
  maxHeight?: string;
  isListening?: boolean;
  perspective?: 'employee' | 'caller';
  onSendMessage?: (text: string) => void;
  inputPlaceholder?: string;
  title?: string;
}

// Subtle keyword highlight logic for sensitive & urgent cues
function highlightSensitiveWords(text: string): ReactNode {
  const parts = text.split(SENSITIVE_KEYWORDS_REGEX);

  return parts.map((part, i) => {
    const lower = part.toLowerCase();
    if (
      lower === 'otp' ||
      lower.includes('password') ||
      lower.includes('pin') ||
      lower.includes('code') ||
      lower === 'cvv' ||
      lower === 'cvv2' ||
      lower === 'aadhaar' ||
      lower.includes('pan') ||
      lower === 'blocked' ||
      lower === 'suspended'
    ) {
      return (
        <span key={i} className="font-bold px-1 py-0.5 rounded bg-red-100 text-red-900 border border-red-200">
          {part}
        </span>
      );
    }
    if (
      lower === 'urgent' ||
      lower === 'immediately' ||
      lower.includes('transfer') ||
      lower === 'quick' ||
      lower === 'emergency'
    ) {
      return (
        <span key={i} className="font-semibold px-1 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-200">
          {part}
        </span>
      );
    }
    return part;
  });
}

export default function TranscriptDisplay({
  items,
  segments,
  interimTranscript,
  maxHeight = '280px',
  isListening = true,
  perspective = 'employee',
  onSendMessage,
  inputPlaceholder,
  title = 'Live Conversation Transcript',
}: TranscriptDisplayProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [inputText, setInputText] = useState('');

  // Normalize items vs segments
  const normalizedItems: DemoTranscriptItem[] = items || (segments || []).map((s) => ({
    id: s.id,
    speaker: s.speaker,
    text: s.text,
    time: s.timestamp
      ? new Date(s.timestamp).toLocaleTimeString('en-GB', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })
      : '09:41:12',
  }));

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
  }, [normalizedItems.length, interimTranscript?.text]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    if (onSendMessage) {
      onSendMessage(inputText.trim());
      setInputText('');
    }
  };

  return (
    <div className="card-enterprise p-4 border border-blue-100 bg-gradient-to-b from-white/95 to-blue-50/20 flex flex-col justify-between">
      <div>
        {/* Top clean live audio indicator (Requirement #4) */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-200/60 mb-3">
          <div className="flex items-center gap-2">
            <Radio size={14} className="text-blue-600 animate-pulse" />
            <span className="text-xs font-bold text-slate-800 tracking-wide">{title}</span>
          </div>

          <div className="flex items-center gap-2 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200/80">
            <span className={`w-1.5 h-1.5 rounded-full ${isListening ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
            <span>{isListening ? 'Google STT Active ● Listening' : 'Audio stream paused'}</span>
          </div>
        </div>

        {/* Transcript bubbles */}
        <div
          ref={scrollRef}
          className="space-y-3 overflow-y-auto scrollbar-thin pr-1"
          style={{ maxHeight }}
          role="log"
          aria-live="polite"
          aria-label="Live call transcript"
        >
          {normalizedItems.length === 0 && (!interimTranscript || !interimTranscript.text) ? (
            <div className="py-8 text-center text-slate-400 text-xs italic">
              Waiting for audio transmission... Live conversation dialogue will appear here instantly.
            </div>
          ) : (
            <>
              {normalizedItems.map((item) => {
                const isCaller = item.speaker === 'caller';
                const isSelf = perspective === 'caller' ? isCaller : !isCaller;
                const speakerLabel = perspective === 'caller'
                  ? (isCaller ? 'You (Caller)' : 'Sreya (Citizen / Employee)')
                  : (isCaller ? 'Caller' : 'You (Employee)');

                return (
                  <div
                    key={item.id}
                    className={`flex flex-col ${isSelf ? 'items-end' : 'items-start'} transition-opacity`}
                  >
                    <div className="flex items-center gap-1.5 text-[10px] text-slate-400 mb-1 px-1">
                      <span className={`font-semibold ${isSelf ? 'text-blue-700' : 'text-slate-600'}`}>
                        {speakerLabel}
                      </span>
                      <span>•</span>
                      <span className="font-mono">{item.time}</span>
                    </div>

                    <div
                      className={`max-w-[88%] rounded-2xl px-4 py-2.5 text-xs leading-relaxed shadow-2xs ${
                        isSelf
                          ? 'bg-blue-600 text-white rounded-br-xs'
                          : 'bg-white text-slate-800 border border-slate-200/80 rounded-bl-xs'
                      }`}
                    >
                      {isSelf ? item.text : highlightSensitiveWords(item.text)}
                    </div>
                  </div>
                );
              })}

              {/* In-Progress Live Interim Bubble (Instant 0-Latency Display) */}
              {interimTranscript && interimTranscript.text && (
                (() => {
                  const isInterimCaller = interimTranscript.speaker === 'caller';
                  const isInterimSelf = perspective === 'caller' ? isInterimCaller : !isInterimCaller;
                  const interimLabel = perspective === 'caller'
                    ? (isInterimCaller ? 'You (Speaking...)' : 'Sreya (Speaking...)')
                    : (isInterimCaller ? 'Caller (Speaking...)' : 'You (Speaking...)');

                  return (
                    <div
                      className={`flex flex-col ${isInterimSelf ? 'items-end' : 'items-start'} transition-all animate-fade-in`}
                    >
                      <div className="flex items-center gap-1.5 text-[10px] text-slate-400 mb-1 px-1">
                        <span className="font-semibold text-blue-600">{interimLabel}</span>
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-ping" />
                      </div>

                      <div
                        className={`max-w-[88%] rounded-2xl px-4 py-2.5 text-xs leading-relaxed shadow-2xs border ${
                          isInterimSelf
                            ? 'bg-blue-500 text-white border-blue-400 rounded-br-xs'
                            : 'bg-blue-50/80 text-slate-800 border-blue-200 rounded-bl-xs'
                        }`}
                      >
                        <span>{interimTranscript.text}</span>
                        <span className="inline-block w-1.5 h-3 bg-current ml-1 animate-pulse align-middle" />
                      </div>
                    </div>
                  );
                })()
              )}
            </>
          )}
        </div>
      </div>

      {/* Interactive Speech & Message Input Bar */}
      <div>
        {onSendMessage && (
          <form onSubmit={handleSend} className="mt-3 pt-2.5 border-t border-slate-100 flex items-center gap-2">
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder={inputPlaceholder || "Speak into mic or type message & press Enter..."}
              className="flex-1 text-xs rounded-xl border border-slate-200 px-3.5 py-2 bg-slate-50 focus:bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
            />
            <button
              type="submit"
              disabled={!inputText.trim()}
              className="px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-xs font-semibold flex items-center gap-1.5 transition shadow-xs cursor-pointer"
            >
              <Send size={13} />
              <span>Send</span>
            </button>
          </form>
        )}

        <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400">
          <span>Google Cloud Speech Recognition (Web Speech API)</span>
          <span className="font-mono">{normalizedItems.length} speech segments</span>
        </div>
      </div>
    </div>
  );
}
