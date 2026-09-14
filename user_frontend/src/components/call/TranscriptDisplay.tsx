import React, { useEffect, useRef } from 'react';
import type { TranscriptSegment } from '../../types';

interface TranscriptDisplayProps {
  segments: TranscriptSegment[];
  maxHeight?: string;
  className?: string;
}

const TranscriptSegmentRow = React.memo(({ seg }: { seg: TranscriptSegment }) => {
  const isCaller = seg.speaker === 'caller';
  return (
    <div className={`transition-opacity duration-200 ${isCaller ? '' : 'flex justify-end'}`}>
      <div className={`max-w-[85%] ${isCaller ? '' : 'text-right'}`}>
        <span className={`text-xs font-medium block mb-0.5 ${isCaller ? 'text-slate-500' : 'text-blue-500'}`}>
          {isCaller ? 'Caller' : 'You'}
        </span>
        <div
          className={`text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 inline-block shadow-xs leading-relaxed ${
            seg.isPartial ? 'opacity-60 italic' : ''
          }`}
        >
          &ldquo;{seg.text}&rdquo;
        </div>
      </div>
    </div>
  );
});

TranscriptSegmentRow.displayName = 'TranscriptSegmentRow';

export default function TranscriptDisplay({
  segments,
  maxHeight = '240px',
  className = '',
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
        className={`flex items-center justify-center text-slate-400 text-sm italic py-6 ${className}`}
        style={{ minHeight: '80px' }}
      >
        Waiting for speech in call…
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
        <TranscriptSegmentRow key={seg.id} seg={seg} />
      ))}
    </div>
  );
}
