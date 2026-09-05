// src/components/incidents/RiskOverTimeChart.jsx
import React from 'react';

export function RiskOverTimeChart({ data }) {
  if (!data || data.length === 0) {
    return (
      <div className="h-44 flex items-center justify-center font-mono text-xs text-slate-500 bg-slate-950/40 rounded border border-slate-800">
        Telemetry stream too short for temporal curve
      </div>
    );
  }

  // SVG dimensions
  const width = 580;
  const height = 150;
  const padding = { top: 20, right: 30, bottom: 25, left: 35 };

  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  // Points for risk (0 - 100)
  const riskPoints = data.map((d, idx) => {
    const x = padding.left + (idx / (data.length - 1 || 1)) * chartWidth;
    const y = padding.top + chartHeight - (d.risk / 100) * chartHeight;
    return { x, y, val: d.risk, time: d.timestamp };
  });

  // Points for synthetic probability (0.0 - 1.0)
  const syntheticPoints = data.map((d, idx) => {
    const x = padding.left + (idx / (data.length - 1 || 1)) * chartWidth;
    const y = padding.top + chartHeight - (d.syntheticProb || 0) * chartHeight;
    return { x, y, val: Math.round((d.syntheticProb || 0) * 100), time: d.timestamp };
  });

  const riskPolyline = riskPoints.map(p => `${p.x},${p.y}`).join(' ');
  const synthPolyline = syntheticPoints.map(p => `${p.x},${p.y}`).join(' ');

  // Area under risk curve
  const areaPath = `
    M ${riskPoints[0].x},${padding.top + chartHeight}
    ${riskPoints.map(p => `L ${p.x},${p.y}`).join(' ')}
    L ${riskPoints[riskPoints.length - 1].x},${padding.top + chartHeight}
    Z
  `;

  return (
    <div className="bg-slate-950/60 border border-slate-800 rounded p-3 font-mono">
      <div className="flex items-center justify-between mb-2 text-2xs">
        <span className="text-slate-400 font-semibold uppercase tracking-wider">
          Temporal Risk Telemetry (Call Duration)
        </span>
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5 text-red-400">
            <span className="w-2.5 h-0.5 bg-red-500 inline-block" /> Overall Risk Score
          </span>
          <span className="flex items-center gap-1.5 text-soc-accent">
            <span className="w-2.5 h-0.5 bg-sky-400 inline-block border-t border-dashed" /> Synthetic Probability %
          </span>
        </div>
      </div>

      <div className="relative">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-40 overflow-visible">
          <defs>
            <linearGradient id="riskGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#EF4444" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#EF4444" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Grid lines */}
          {[0, 25, 50, 75, 100].map((level) => {
            const y = padding.top + chartHeight - (level / 100) * chartHeight;
            return (
              <g key={level}>
                <line
                  x1={padding.left}
                  y1={y}
                  x2={width - padding.right}
                  y2={y}
                  stroke="#1E293B"
                  strokeDasharray={level === 70 ? "3 3" : "none"}
                  strokeWidth={level === 70 ? "1.5" : "1"}
                />
                <text
                  x={padding.left - 6}
                  y={y + 3}
                  textAnchor="end"
                  className="text-[9px] fill-slate-500 font-mono"
                >
                  {level}
                </text>
              </g>
            );
          })}

          {/* Critical threshold indicator line at 70 */}
          <line
            x1={padding.left}
            y1={padding.top + chartHeight - (70 / 100) * chartHeight}
            x2={width - padding.right}
            y2={padding.top + chartHeight - (70 / 100) * chartHeight}
            stroke="#DC2626"
            strokeDasharray="4 4"
            strokeWidth="1"
            opacity="0.6"
          />

          {/* Area fill */}
          <path d={areaPath} fill="url(#riskGradient)" />

          {/* Synthetic probability line */}
          <polyline
            points={synthPolyline}
            fill="none"
            stroke="#38BDF8"
            strokeWidth="1.5"
            strokeDasharray="4 2"
            opacity="0.8"
          />

          {/* Risk score line */}
          <polyline
            points={riskPolyline}
            fill="none"
            stroke="#EF4444"
            strokeWidth="2.5"
          />

          {/* Data Points */}
          {riskPoints.map((p, idx) => (
            <circle
              key={idx}
              cx={p.x}
              cy={p.y}
              r="3.5"
              fill="#EF4444"
              stroke="#0B0F19"
              strokeWidth="1.5"
            />
          ))}

          {/* Time axis labels */}
          {riskPoints.map((p, idx) => (
            <text
              key={idx}
              x={p.x}
              y={height - 5}
              textAnchor="middle"
              className="text-[9px] fill-slate-500 font-mono"
            >
              {p.time}
            </text>
          ))}
        </svg>
      </div>
    </div>
  );
}
