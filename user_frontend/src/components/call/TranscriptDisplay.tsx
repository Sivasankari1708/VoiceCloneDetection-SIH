import React, { useEffect, useRef } from 'react';
import type { TranscriptSegment } from '../../types';

interface TranscriptDisplayProps {
  segments: TranscriptSegment[];
  maxHeight?: string;
  className?: string;
  perspective?: 'employee' | 'caller';
}

const TranscriptSegmentRow = React.memo(
  ({ seg, perspective = 'employee' }: { seg: TranscriptSegment; perspective?: 'employee' | 'caller' }) => {
    const isMe = perspective === 'employee' ? seg.speaker === 'employee' : seg.speaker === 'caller';
    const label = isMe ? 'You' : seg.speaker === 'caller' ? 'Inbound Caller' : 'Target Employee';
    return (
      <div className={`transition-opacity duration-200 ${isMe ? 'flex justify-end' : ''}`}>
        <div className={`max-w-[85%] ${isMe ? 'text-right' : ''}`}>
          <span className={`text-xs font-medium block mb-0.5 ${isMe ? 'text-blue-400 font-semibold' : 'text-slate-400'}`}>
            {label}
          </span>
          <div
            className={`text-sm rounded-lg px-3 py-2 inline-block shadow-xs leading-relaxed ${
              isMe
                ? 'bg-blue-600 text-white border border-blue-500'
                : 'bg-slate-800 text-slate-100 border border-slate-700'
            } ${seg.isPartial ? 'opacity-70 italic' : ''}`}
          >
            {seg.text}
          </div>
        </div>
      </div>
    );
  }
);

TranscriptSegmentRow.displayName = 'TranscriptSegmentRow';

export default function TranscriptDisplay({
  segments,
  maxHeight = '240px',
  className = '',
  perspective = 'employee',
}: TranscriptDisplayProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);
  const prevCountRef = useRef(0);

  const handleScroll = () => {
    const container = containerRef.current;
    if (!container) return;
    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    isNearBottomRef.current = distanceFromBottom < 50;
  };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    if (segments.length > prevCountRef.current && isNearBottomRef.current) {
      container.scrollTo({
        top: container.scrollHeight,
        behavior: 'smooth',
      });
    }
    prevCountRef.current = segments.length;
  }, [segments]);

  if (segments.length === 0) {
    return (
      <div
        className={`flex flex-col items-center justify-center text-slate-400 text-xs py-6 space-y-1.5 ${className}`}
        style={{ minHeight: '90px' }}
      >
        <div className="flex items-center gap-2 text-slate-400">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
          <span className="font-semibold text-slate-300">Google Speech Recognition Ready</span>
        </div>
        <span className="italic text-slate-500 text-center">Listening to live audio... Speak into microphone to generate transcript.</span>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className={`overflow-y-auto space-y-3 scrollbar-thin pr-1 ${className}`}
      style={{ maxHeight }}
      role="log"
      aria-live="polite"
      aria-label="Live conversation transcript"
    >
      {segments.map((seg) => (
        <TranscriptSegmentRow key={seg.id} seg={seg} perspective={perspective} />
      ))}
    </div>
  );
}
