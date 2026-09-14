import { useEffect, useRef, useState } from 'react';
import type { SeverityLevel } from '../../types';
import SeverityBadge from './SeverityBadge';

interface SecurityScoreDisplayProps {
  score: number;
  severity: SeverityLevel;
  large?: boolean;
  className?: string;
}

export default function SecurityScoreDisplay({ score, severity, large = false, className = '' }: SecurityScoreDisplayProps) {
  const [displayed, setDisplayed] = useState(score);
  const prevRef = useRef(score);
  const rafRef = useRef<number>(0);

  // Animate score counter
  useEffect(() => {
    const from = prevRef.current;
    const to = score;
    if (from === to) return;

    const duration = 600;
    const start = performance.now();

    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayed(Math.round(from + (to - from) * eased));
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        prevRef.current = to;
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [score]);

  return (
    <div className={`flex flex-col items-center gap-2 ${className}`}>
      <div className={`font-bold tabular-nums ${large ? 'text-5xl' : 'text-3xl'} text-slate-800`}>
        <span>{displayed}</span>
        <span className="text-slate-400 font-normal">/</span>
        <span className="text-slate-400 font-normal text-2xl">100</span>
      </div>
      <SeverityBadge level={severity} size={large ? 'lg' : 'md'} pulse={severity === 'CRITICAL'} />
    </div>
  );
}
