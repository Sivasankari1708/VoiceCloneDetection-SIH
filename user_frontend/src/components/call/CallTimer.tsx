import { useState, useEffect, useRef } from 'react';
import { formatDuration } from '../../utils/dataMapper';

interface CallTimerProps {
  startTime: Date;
  active: boolean;
  className?: string;
}

export default function CallTimer({ startTime, active, className = '' }: CallTimerProps) {
  const [elapsed, setElapsed] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  useEffect(() => {
    if (active) {
      intervalRef.current = setInterval(() => {
        setElapsed(Math.floor((Date.now() - startTime.getTime()) / 1000));
      }, 1000);
    } else {
      clearInterval(intervalRef.current);
    }
    return () => clearInterval(intervalRef.current);
  }, [active, startTime]);

  return (
    <span className={`font-mono text-slate-600 tabular-nums ${className}`} aria-live="polite" aria-label={`Call duration: ${formatDuration(elapsed)}`}>
      {formatDuration(elapsed)}
    </span>
  );
}
