// src/components/incidents/ConversationIntelligenceCard.jsx
import React from 'react';
import { Card } from '../common/Card';
import { MessageSquareCode, AlertTriangle, ShieldCheck, Lock } from 'lucide-react';

export function ConversationIntelligenceCard({ intelligence }) {
  if (!intelligence) return null;

  return (
    <Card title="Conversational Security Intelligence">
      <div className="font-mono text-xs space-y-4">
        {/* Intent & Confidence */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 bg-slate-900/60 border border-slate-800 rounded">
          <div>
            <span className="text-2xs text-slate-500 uppercase tracking-wider block font-semibold">
              Detected High-Risk Intent
            </span>
            <div className="text-sm font-bold text-red-300 mt-0.5">
              {intelligence.detectedIntent || 'UNKNOWN'}
            </div>
          </div>
          <div className="text-right">
            <span className="text-2xs text-slate-500 uppercase tracking-wider block">
              Confidence Score
            </span>
            <span className="text-sm font-bold text-slate-200">
              {Math.round((intelligence.intentConfidence || 0) * 100)}%
            </span>
          </div>
        </div>

        {/* Suspicious Intent Indicators */}
        <div>
          <span className="text-2xs text-slate-400 uppercase tracking-wider block font-semibold mb-2">
            Social Engineering & Coercion Markers Flagged
          </span>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {intelligence.suspiciousIndicators?.map((item, idx) => (
              <div 
                key={idx} 
                className="flex items-center gap-2 p-2 rounded bg-slate-950/60 border border-slate-800 text-slate-300 text-2xs"
              >
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span className="truncate">{item}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Restricted Evidence Notice */}
        <div className="p-3 bg-slate-900/40 border border-dashed border-slate-800 rounded text-center">
          <div className="flex items-center justify-center gap-2 text-slate-400 font-semibold text-2xs uppercase tracking-wider mb-1">
            <Lock className="w-3.5 h-3.5 text-slate-500" />
            <span>Voice Data Compliance Guard</span>
          </div>
          <p className="text-2xs text-slate-500">
            {intelligence.transcriptNotice || 'Restricted investigation evidence — not connected'}
          </p>
          <p className="text-[10px] text-slate-600 mt-1">
            Audio playback and raw transcripts are strictly prohibited in enterprise SOC tier to maintain corporate communication confidentiality.
          </p>
        </div>
      </div>
    </Card>
  );
}
