// src/pages/SecurityPolicy.jsx
import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { Card } from '../components/common/Card';
import { Button } from '../components/common/Button';
import { Shield, Save, AlertCircle, CheckCircle2, Loader2, Lock, Bell, Zap } from 'lucide-react';

function Toggle({ checked, onChange, label, description }) {
  return (
    <div className="flex items-start justify-between gap-4 py-3 border-b border-soc-border/60 last:border-0">
      <div className="flex-1">
        <div className="text-xs font-semibold text-slate-200">{label}</div>
        {description && <p className="text-2xs text-slate-500 mt-0.5">{description}</p>}
      </div>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus:outline-none ${
          checked ? 'bg-soc-accent' : 'bg-slate-700'
        }`}
      >
        <span
          className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
            checked ? 'translate-x-4' : 'translate-x-1'
          }`}
        />
      </button>
    </div>
  );
}

function Slider({ label, description, value, min, max, step = 1, onChange }) {
  return (
    <div className="space-y-1.5 py-3 border-b border-soc-border/60 last:border-0">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-200">{label}</span>
        <span className="text-xs font-bold text-soc-accent">{value}</span>
      </div>
      {description && <p className="text-2xs text-slate-500">{description}</p>}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        className="w-full h-1.5 bg-slate-700 rounded-full appearance-none cursor-pointer accent-soc-accent"
      />
      <div className="flex justify-between text-[10px] text-slate-600">
        <span>{min}</span><span>{max}</span>
      </div>
    </div>
  );
}

export function SecurityPolicy() {
  const [policy, setPolicy] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState(null); // { type: 'success'|'error', msg }

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const data = await api.request('/api/policies');
      setPolicy(data);
    } catch (e) {
      setFeedback({ type: 'error', msg: e.message || 'Failed to load policy.' });
    } finally { setLoading(false); }
  }

  const update = (key, value) => setPolicy(prev => ({ ...prev, [key]: value }));

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true); setFeedback(null);
    try {
      const saved = await api.request('/api/policies', {
        method: 'PUT',
        body: JSON.stringify({
          risk_score_high_threshold: policy.risk_score_high_threshold,
          risk_score_critical_threshold: policy.risk_score_critical_threshold,
          auto_warn_user_on_high: policy.auto_warn_user_on_high,
          auto_alert_org_on_high: policy.auto_alert_org_on_high,
          auto_block_on_critical_clone: policy.auto_block_on_critical_clone,
          enforce_protected_vip_rules: policy.enforce_protected_vip_rules,
          sensitive_intent_escalation: policy.sensitive_intent_escalation,
        })
      });
      setPolicy(saved);
      setFeedback({ type: 'success', msg: 'Security policy updated and saved.' });
    } catch (e) {
      setFeedback({ type: 'error', msg: e.message || 'Failed to save policy.' });
    } finally { setSaving(false); }
  };

  if (loading) return (
    <div className="p-12 text-center text-xs font-mono text-slate-500">
      Loading organization security policy...
    </div>
  );

  return (
    <form onSubmit={handleSave} className="space-y-6 font-mono">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-soc-border">
        <div>
          <h2 className="text-sm font-bold tracking-wider text-slate-100 uppercase flex items-center gap-2">
            <Shield className="w-4 h-4 text-soc-accent" />
            <span>Organization Security Policy Configuration</span>
          </h2>
          <p className="text-2xs text-slate-500 mt-0.5">
            Configure risk thresholds, automated response actions, and VIP protection rules
          </p>
        </div>
        <Button variant="primary" size="sm" type="submit" icon={saving ? Loader2 : Save} disabled={saving}>
          {saving ? 'Saving...' : 'Save Policy'}
        </Button>
      </div>

      {/* Feedback */}
      {feedback && (
        <div className={`p-3 border rounded-md text-xs flex items-center gap-2 ${
          feedback.type === 'success'
            ? 'bg-emerald-950/60 border-emerald-700 text-emerald-300'
            : 'bg-red-950/60 border-red-700 text-red-300'
        }`}>
          {feedback.type === 'success'
            ? <CheckCircle2 className="w-4 h-4 shrink-0" />
            : <AlertCircle className="w-4 h-4 shrink-0" />}
          {feedback.msg}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Risk Score Thresholds */}
        <Card title={<span className="flex items-center gap-2"><Zap className="w-3.5 h-3.5 text-amber-400" /> Risk Score Thresholds</span>}>
          <div className="space-y-0">
            <Slider
              label="High Risk Threshold"
              description="Calls with risk score ≥ this value trigger HIGH alert workflow"
              value={policy?.risk_score_high_threshold ?? 65}
              min={30} max={90} step={5}
              onChange={v => update('risk_score_high_threshold', v)}
            />
            <Slider
              label="Critical Risk Threshold"
              description="Calls with risk score ≥ this value trigger CRITICAL incident creation"
              value={policy?.risk_score_critical_threshold ?? 85}
              min={60} max={100} step={5}
              onChange={v => update('risk_score_critical_threshold', v)}
            />
          </div>
          <div className="mt-4 p-3 bg-slate-900/60 border border-slate-800 rounded text-2xs text-slate-400 space-y-1">
            <div className="font-semibold text-slate-300 mb-1.5">Current Configuration</div>
            <div className="flex justify-between">
              <span>HIGH threshold</span>
              <span className="text-amber-400 font-bold">{policy?.risk_score_high_threshold ?? 65}</span>
            </div>
            <div className="flex justify-between">
              <span>CRITICAL threshold</span>
              <span className="text-red-400 font-bold">{policy?.risk_score_critical_threshold ?? 85}</span>
            </div>
          </div>
        </Card>

        {/* Automated Response */}
        <Card title={<span className="flex items-center gap-2"><Bell className="w-3.5 h-3.5 text-sky-400" /> Automated Response Rules</span>}>
          <div>
            <Toggle
              checked={policy?.auto_warn_user_on_high ?? true}
              onChange={v => update('auto_warn_user_on_high', v)}
              label="Auto-Warn User on High Risk"
              description="Send in-call warning alert to call receiver when risk score exceeds HIGH threshold"
            />
            <Toggle
              checked={policy?.auto_alert_org_on_high ?? true}
              onChange={v => update('auto_alert_org_on_high', v)}
              label="Auto-Alert SOC on High Risk"
              description="Broadcast security alert to all active SOC analyst consoles"
            />
            <Toggle
              checked={policy?.auto_block_on_critical_clone ?? false}
              onChange={v => update('auto_block_on_critical_clone', v)}
              label="Auto-Block on Critical Clone Detection"
              description="Automatically terminate call session when synthetic voice probability exceeds critical threshold"
            />
          </div>
        </Card>

        {/* VIP Protection */}
        <Card title={<span className="flex items-center gap-2"><Lock className="w-3.5 h-3.5 text-emerald-400" /> VIP & Sensitive Intent Rules</span>}>
          <div>
            <Toggle
              checked={policy?.enforce_protected_vip_rules ?? true}
              onChange={v => update('enforce_protected_vip_rules', v)}
              label="Enforce Protected Identity Rules"
              description="Apply enhanced verification requirements when caller claims to be a VIP executive"
            />
            <Toggle
              checked={policy?.sensitive_intent_escalation ?? true}
              onChange={v => update('sensitive_intent_escalation', v)}
              label="Auto-Escalate on Sensitive Intent"
              description="Automatically escalate incidents when call intent involves wire transfers, credentials, or urgent financial actions"
            />
          </div>
        </Card>

        {/* Metadata */}
        <Card title="Policy Metadata">
          <div className="space-y-2.5 text-xs">
            <div className="flex justify-between text-slate-400">
              <span>Organization ID</span>
              <span className="text-slate-300 font-mono">{policy?.org_id || '—'}</span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>Last Updated</span>
              <span className="text-slate-300">{policy?.updated_at ? new Date(policy.updated_at).toLocaleString() : 'Never'}</span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>Policy Version</span>
              <span className="text-slate-300">v1.0 (SOC Platform)</span>
            </div>
          </div>
          <div className="mt-4 p-3 bg-amber-950/30 border border-amber-800/40 rounded text-2xs text-amber-300">
            <span className="font-semibold">Admin only:</span> Policy changes require ADMIN role. Changes take effect immediately for all active calls.
          </div>
        </Card>
      </div>
    </form>
  );
}
