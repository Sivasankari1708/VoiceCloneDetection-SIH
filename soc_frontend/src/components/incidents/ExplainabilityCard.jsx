// src/components/incidents/ExplainabilityCard.jsx
import React from 'react';
import { Card } from '../common/Card';
import { CheckCircle2, ShieldAlert } from 'lucide-react';

export function ExplainabilityCard({ explainability }) {
  if (!explainability || explainability.length === 0) return null;

  return (
    <Card title="WHY THIS INCIDENT WAS CREATED">
      <div className="space-y-2.5 font-mono text-xs">
        <p className="text-2xs text-slate-400 mb-2">
          Automated multi-factor threat correlation generated this incident based on the following verified risk indicators:
        </p>

        <div className="space-y-2">
          {explainability.map((reason, idx) => (
            <div 
              key={idx}
              className="flex items-start gap-2.5 p-2 rounded bg-slate-900/50 border border-slate-800/80 text-slate-200"
            >
              <CheckCircle2 className="w-4 h-4 text-soc-accent shrink-0 mt-0.5" />
              <span className="leading-snug">{reason}</span>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}
