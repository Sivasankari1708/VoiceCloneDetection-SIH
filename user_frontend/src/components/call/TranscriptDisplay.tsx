import { useEffect, useRef } from 'react';
import type { TranscriptSegment } from '../../types';

interface TranscriptDisplayProps {
  segments: TranscriptSegment[];
  maxHeight?: string;
  className?: string;
}

export default function TranscriptDisplay({ segments, maxHeight = '200px', className = '' }: TranscriptDisplayProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const prevLengthRef = useRef(0);

  // Auto-scroll on new segments
  useEffect(() => {
    if (segments.length > prevLengthRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
      prevLengthRef.current = segments.length;
    }
  }, [segments.length]);

  if (segments.length === 0) {
    return (
      <div className={`flex items-center justify-center text-slate-400 text-sm italic ${className}`} style={{ minHeight: '60px' }}>
        Listening for conversation…
      </div>
    );
  }

  return (
    <div
      className={`overflow-y-auto space-y-3 scrollbar-thin pr-1 ${className}`}
      style={{ maxHeight }}
      role="log"
      aria-live="polite"
      aria-label="Live conversation transcript"
    >
      {segments.map((seg) => (
        <div
          key={seg.id}
          className={`animate-fade-in-up ${seg.speaker === 'caller' ? '' : 'flex justify-end'}`}
        >
          <div className={`max-w-[85%] ${seg.speaker === 'caller' ? '' : 'text-right'}`}>
            <span className={`text-xs font-medium block mb-0.5 ${seg.speaker === 'caller' ? 'text-slate-500' : 'text-blue-500'}`}>
              {seg.speaker === 'caller' ? 'Caller' : 'You'}
            </span>
            <div className={`text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 inline-block
              ${seg.isPartial ? 'opacity-60 italic' : ''}`}>
              &ldquo;{seg.text}&rdquo;
            </div>
          </div>
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
