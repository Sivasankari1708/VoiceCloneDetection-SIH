// src/components/incidents/ExplainabilityCard.jsx
import React from 'react';
import { Card } from '../common/Card';
import { CheckCircle2 } from 'lucide-react';

export function ExplainabilityCard({ explainability }) {
  // Handle both shapes:
  //   - Array of strings (legacy / simple)
  //   - Object { factors: [{name, weight, description},...], recommendation: '...' }
  let factors = [];
  let recommendation = null;

  if (!explainability) return null;

  if (Array.isArray(explainability)) {
    // Array of plain strings
    factors = explainability.map((item, idx) =>
      typeof item === 'string'
        ? { name: item, weight: null, description: null }
        : item
    );
  } else if (typeof explainability === 'object') {
    factors = Array.isArray(explainability.factors) ? explainability.factors : [];
    recommendation = explainability.recommendation || null;
  }

  if (factors.length === 0) return null;

  return (
    <Card title="WHY THIS INCIDENT WAS CREATED">
      <div className="space-y-2.5 font-mono text-xs">
        <p className="text-2xs text-slate-400 mb-2">
          Automated multi-factor threat correlation generated this incident based on the following verified risk indicators:
        </p>

        <div className="space-y-2">
          {factors.map((factor, idx) => (
            <div
              key={idx}
              className="flex items-start gap-2.5 p-2 rounded bg-slate-900/50 border border-slate-800/80 text-slate-200"
            >
              <CheckCircle2 className="w-4 h-4 text-soc-accent shrink-0 mt-0.5" />
              <div className="leading-snug">
                {factor.name && (
                  <span className="font-semibold text-slate-100">{factor.name}</span>
                )}
                {factor.weight && (
                  <span className="ml-1 text-soc-accent">({factor.weight})</span>
                )}
                {factor.description && (
                  <span className="block text-slate-400 mt-0.5">{factor.description}</span>
                )}
                {/* If it was a plain string stored in name with no description */}
                {!factor.description && !factor.weight && typeof factor.name === 'string' && (
                  <span>{factor.name}</span>
                )}
              </div>
            </div>
          ))}
        </div>

        {recommendation && (
          <div className="mt-3 pt-3 border-t border-soc-border text-2xs text-slate-400">
            <span className="font-semibold text-slate-300">Recommended Action: </span>
            {recommendation}
          </div>
        )}
      </div>
    </Card>
  );
}
