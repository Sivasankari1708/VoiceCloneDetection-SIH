// src/components/incidents/DetectionEvidenceCard.jsx
import React from 'react';
import { Card } from '../common/Card';
import { Activity, AlertTriangle, CheckCircle2, ShieldAlert } from 'lucide-react';
import { formatIdentityVerification } from '../../utils/formatters';

export function DetectionEvidenceCard({ evidence }) {
  if (!evidence) return null;

  const synthPercent = Math.round(evidence.syntheticProbability * 100);
  const speakerSim = evidence.speakerSimilarity !== null ? `${Math.round(evidence.speakerSimilarity * 100)}% (${evidence.speakerSimilarity})` : 'N/A';
  const identityStatus = formatIdentityVerification(evidence.identityVerification);

  return (
    <Card title="Detection Evidence & Acoustic Analysis">
      <div className="space-y-4 font-mono text-xs">
        {/* Core Metric Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3 rounded bg-slate-900/60 border border-slate-800">
            <span className="text-2xs text-slate-400 block uppercase">Synthetic Voice Probability</span>
            <div className="mt-1 flex items-baseline gap-2">
              <span className={`text-xl font-bold ${synthPercent >= 70 ? 'text-red-400' : synthPercent >= 40 ? 'text-amber-400' : 'text-emerald-400'}`}>
                {synthPercent}%
              </span>
              <span className="text-2xs text-slate-500">
                {synthPercent >= 60 ? 'CRITICAL' : 'NORMAL'}
              </span>
            </div>
            <div className="w-full bg-slate-800 h-1 rounded mt-2 overflow-hidden">
              <div 
                className={`h-full ${synthPercent >= 70 ? 'bg-red-500' : synthPercent >= 40 ? 'bg-amber-500' : 'bg-emerald-500'}`} 
                style={{ width: `${synthPercent}%` }} 
              />
            </div>
          </div>

          <div className="p-3 rounded bg-slate-900/60 border border-slate-800">
            <span className="text-2xs text-slate-400 block uppercase">Speaker Similarity</span>
            <div className="mt-1 flex items-baseline gap-2">
              <span className={`text-xl font-bold ${evidence.speakerSimilarity !== null && evidence.speakerSimilarity < 0.70 ? 'text-red-400' : 'text-emerald-400'}`}>
                {speakerSim}
              </span>
            </div>
            <span className="text-2xs text-slate-500 block mt-2">
              {evidence.speakerSimilarity !== null ? 'Cosine Distance Threshold: 0.70' : 'No enrolled profile'}
            </span>
          </div>

          <div className="p-3 rounded bg-slate-900/60 border border-slate-800">
            <span className="text-2xs text-slate-400 block uppercase">Identity Verification</span>
            <div className="mt-1">
              <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold ${identityStatus.badge}`}>
                {identityStatus.label}
              </span>
            </div>
            <span className="text-2xs text-slate-500 block mt-2">
              Biometric conflict
            </span>
          </div>

          <div className="p-3 rounded bg-slate-900/60 border border-slate-800">
            <span className="text-2xs text-slate-400 block uppercase">Voice Authenticity</span>
            <div className="mt-1">
              <span className={`text-sm font-bold uppercase ${evidence.voiceAuthenticity === 'SUSPICIOUS' ? 'text-red-400' : 'text-slate-200'}`}>
                {evidence.voiceAuthenticity}
              </span>
            </div>
            <span className="text-2xs text-slate-500 block mt-2">
              Acoustic classification
            </span>
          </div>
        </div>

        {/* Human-Readable Observed Indicators */}
        <div className="p-3 bg-slate-950/60 border border-slate-800 rounded">
          <div className="text-2xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
            Identified Acoustic & Synthesis Indicators
          </div>
          <div className="space-y-1.5">
            {evidence.indicators?.map((indicator, idx) => (
              <div key={idx} className="flex items-start gap-2 text-slate-300">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                <span>{indicator}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}
