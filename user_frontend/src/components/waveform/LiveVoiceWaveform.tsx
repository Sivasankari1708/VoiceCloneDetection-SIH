import { useEffect, useRef, useState } from 'react';
import type { SeverityLevel } from '../../types';

type WaveformState = 'speaking' | 'silence' | 'paused' | 'ended';

interface LiveVoiceWaveformProps {
  activityLevel: number; // 0–1 from real microphone AnalyserNode
  state?: WaveformState;
  className?: string;
  barCount?: number;
  severity?: SeverityLevel;
  height?: number;
}

const SEVERITY_COLORS: Record<SeverityLevel, string> = {
  SAFE: '#16a34a',
  LOW: '#2563eb',
  MEDIUM: '#d97706',
  HIGH: '#ea580c',
  CRITICAL: '#dc2626',
};

export default function LiveVoiceWaveform({
  activityLevel,
  state = 'speaking',
  className = '',
  barCount = 44,
  severity = 'SAFE',
  height = 80,
}: LiveVoiceWaveformProps) {
  const [bars, setBars] = useState<number[]>(() => Array(barCount).fill(0.06));
  const animRef = useRef<number>(0);
  const activityRef = useRef(activityLevel);
  const stateRef = useRef(state);

  // Keep refs updated
  useEffect(() => {
    activityRef.current = activityLevel;
  }, [activityLevel]);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    let targetBars = Array(barCount).fill(0.06);

    const animate = () => {
      const currentState = stateRef.current;
      const activity = Math.min(1.0, Math.max(0.02, activityRef.current));

      if (currentState === 'ended') {
        setBars(prev => prev.map(b => Math.max(0.03, b * 0.85)));
        animRef.current = requestAnimationFrame(animate);
        return;
      }

      if (currentState === 'paused') {
        animRef.current = requestAnimationFrame(animate);
        return;
      }

      // Calculate organic bar heights directly driven by microphone activityLevel
      targetBars = targetBars.map((_, i) => {
        // Parabolic center weighting (middle bars are naturally taller)
        const centerRatio = Math.sin((i / (barCount - 1)) * Math.PI);
        const wave = Math.sin(Date.now() * 0.007 + i * 0.45) * 0.12 * activity;
        const jitter = (Math.random() - 0.5) * 0.08 * activity;

        // Base idle height is ~0.05; when activity rises, height expands dynamically up to 1.0
        const calculatedHeight = 0.04 + (activity * 0.90 * centerRatio) + wave + jitter;
        return Math.min(1.0, Math.max(0.04, calculatedHeight));
      });

      setBars(prev =>
        prev.map((current, i) => {
          const target = targetBars[i] ?? 0.06;
          // Smooth interpolation for fluid motion
          return current + (target - current) * 0.35;
        })
      );

      animRef.current = requestAnimationFrame(animate);
    };

    animRef.current = requestAnimationFrame(animate);
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [barCount]);

  const color = SEVERITY_COLORS[severity] || '#16a34a';

  return (
    <div
      className={`flex items-end justify-center gap-[3px] ${className}`}
      style={{ height }}
      role="img"
      aria-label="Real-time voice waveform"
    >
      {bars.map((h, i) => (
        <div
          key={i}
          style={{
            height: `${Math.round(h * 100)}%`,
            backgroundColor: color,
            opacity: state === 'ended' ? 0.3 : Math.min(1, 0.65 + activityLevel * 0.35),
            width: '4px',
            borderRadius: '3px 3px 0 0',
            transition: 'background-color 0.3s ease',
          }}
        />
      ))}
    </div>
  );
}