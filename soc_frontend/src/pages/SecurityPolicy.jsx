// src/pages/SecurityPolicy.jsx
import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { Card } from '../components/common/Card';
import { Button } from '../components/common/Button';
import { Shield, Save, AlertCircle, CheckCircle2, Loader2, Lock, Bell, Zap, Info } from 'lucide-react';

function Toggle({ checked, onChange, label, description }) {
  return (
    <div className="flex items-start justify-between gap-4 py-3.5 border-b border-slate-100 last:border-0">
      <div className="flex-1">
        <div className="text-xs font-semibold text-slate-800">{label}</div>
        {description && <p className="text-2xs text-slate-500 mt-0.5">{description}</p>}
      </div>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus:outline-none ${
          checked ? 'bg-blue-600' : 'bg-slate-300'
        }`}
      >
        <span
          className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-xs transition-transform ${
            checked ? 'translate-x-4' : 'translate-x-1'
          }`}
        />
      </button>
    </div>
  );
}

function Slider({ label, description, value, min, max, step = 1, onChange }) {
  return (
    <div className="space-y-1.5 py-3.5 border-b border-slate-100 last:border-0">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-800">{label}</span>
        <span className="text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200/60">{value}</span>
      </div>
      {description && <p className="text-2xs text-slate-500">{description}</p>}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        className="w-full h-1.5 bg-slate-200 rounded-full appearance-none cursor-pointer accent-blue-600"
      />
      <div className="flex justify-between text-2xs text-slate-400 font-medium">
        <span>{min}</span><span>{max}</span>
      </div>
    </div>
  );
}

export function SecurityPolicy() {
  const [policy, setPolicy] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState(null);

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
      setFeedback({ type: 'success', msg: 'Security policy updated and synchronized successfully.' });
    } catch (e) {
      setFeedback({ type: 'error', msg: e.message || 'Failed to save policy.' });
    } finally { setSaving(false); }
  };

  if (loading) return (
    <div className="p-16 text-center text-xs font-sans text-slate-500">
      Loading organization security policy...
    </div>
  );

  return (
    <form onSubmit={handleSave} className="space-y-6 font-sans">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200/90">
        <div>
          <h2 className="text-base font-semibold tracking-tight text-slate-900 flex items-center gap-2">
            <Shield className="w-5 h-5 text-blue-600" />
            <span>Organization Security Policy Configuration</span>
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Configure risk thresholds, automated employee intervention actions, and executive protection parameters
          </p>
        </div>
        <Button variant="primary" size="sm" type="submit" icon={saving ? Loader2 : Save} disabled={saving}>
          {saving ? 'Saving...' : 'Save Policy'}
        </Button>
      </div>

      {/* Feedback */}
      {feedback && (
        <div className={`p-3.5 border rounded-xl text-xs flex items-center gap-2.5 shadow-xs ${
          feedback.type === 'success'
            ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
            : 'bg-red-50 border-red-200 text-red-800'
        }`}>
          {feedback.type === 'success'
            ? <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            : <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />}
          <span className="font-medium">{feedback.msg}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Risk Score Thresholds */}
        <Card title={<span className="flex items-center gap-2"><Zap className="w-4 h-4 text-amber-600" /> Threat Score Thresholds</span>}>
          <div className="space-y-0">
            <Slider
              label="Elevated Risk Threshold"
              description="Calls with threat score ≥ this value trigger HIGH alert advisory on employee console"
              value={policy?.risk_score_high_threshold ?? 65}
              min={30} max={90} step={5}
              onChange={v => update('risk_score_high_threshold', v)}
            />
            <Slider
              label="Critical Risk Threshold"
              description="Calls with threat score ≥ this value trigger CRITICAL incident creation and urgent triage"
              value={policy?.risk_score_critical_threshold ?? 85}
              min={60} max={100} step={5}
              onChange={v => update('risk_score_critical_threshold', v)}
            />
          </div>
          <div className="mt-4 p-3 bg-slate-50 border border-slate-200/80 rounded-xl text-xs text-slate-600 space-y-1.5">
            <div className="font-semibold text-slate-900 mb-1">Active Baseline Thresholds</div>
            <div className="flex justify-between">
              <span>Elevated Advisory Threshold</span>
              <span className="text-amber-700 font-bold">{policy?.risk_score_high_threshold ?? 65}</span>
            </div>
            <div className="flex justify-between">
              <span>Critical Incident Escalation Threshold</span>
              <span className="text-red-700 font-bold">{policy?.risk_score_critical_threshold ?? 85}</span>
            </div>
          </div>
        </Card>

        {/* Automated Response */}
        <Card title={<span className="flex items-center gap-2"><Bell className="w-4 h-4 text-blue-600" /> Automated Response Rules</span>}>
          <div>
            <Toggle
              checked={policy?.auto_warn_user_on_high ?? true}
              onChange={v => update('auto_warn_user_on_high', v)}
              label="Auto-Warn Employee on High Threat"
              description="Display immediate security guidance and verification instructions on employee console"
            />
            <Toggle
              checked={policy?.auto_alert_org_on_high ?? true}
              onChange={v => update('auto_alert_org_on_high', v)}
              label="Auto-Alert SOC on High Risk"
              description="Broadcast high-priority notification to active security operation consoles"
            />
            <Toggle
              checked={policy?.auto_block_on_critical_clone ?? false}
              onChange={v => update('auto_block_on_critical_clone', v)}
              label="Autonomous Call Termination"
              description="Initiate automated call severance when confirmed synthetic voice is impersonating an executive"
            />
          </div>
        </Card>

        {/* VIP Protection */}
        <Card title={<span className="flex items-center gap-2"><Lock className="w-4 h-4 text-emerald-600" /> Executive & Sensitive Pretext Rules</span>}>
          <div>
            <Toggle
              checked={policy?.enforce_protected_vip_rules ?? true}
              onChange={v => update('enforce_protected_vip_rules', v)}
              label="Enforce Protected Executive Verification"
              description="Require strict multi-factor biometric match whenever a caller claims executive identity"
            />
            <Toggle
              checked={policy?.sensitive_intent_escalation ?? true}
              onChange={v => update('sensitive_intent_escalation', v)}
              label="Auto-Escalate on Financial Pretext"
              description="Instantly route calls involving wire transfers, credentials, or urgent gift cards to critical queue"
            />
          </div>
        </Card>

        {/* Metadata */}
        <Card title="Policy Metadata & Governance">
          <div className="space-y-3 text-xs">
            <div className="flex justify-between text-slate-500">
              <span>Organization ID</span>
              <span className="text-slate-800 font-medium">{policy?.org_id || 'ORG-ENTERPRISE-GLOBAL'}</span>
            </div>
            <div className="flex justify-between text-slate-500">
              <span>Last Synchronized</span>
              <span className="text-slate-800 font-medium">{policy?.updated_at ? new Date(policy.updated_at).toLocaleString() : 'Active'}</span>
            </div>
            <div className="flex justify-between text-slate-500">
              <span>Policy Specification</span>
              <span className="text-slate-800 font-medium">Enterprise SOC Defense Spec 2.4</span>
            </div>
          </div>
          <div className="mt-4 p-3 bg-blue-50/60 border border-blue-200/70 rounded-xl text-xs text-blue-900 flex items-start gap-2">
            <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
            <span>Policy changes require administrative authorization and apply globally in real time to all active and incoming calls.</span>
          </div>
        </Card>
      </div>
    </form>
  );
}
