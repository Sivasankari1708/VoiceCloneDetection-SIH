// src/pages/AnalyzeAudio.jsx
import React, { useState, useRef } from 'react';
import { api } from '../services/api';
import { Card } from '../components/common/Card';
import { Button } from '../components/common/Button';
import {
  Upload, Mic, Loader2, AlertCircle, CheckCircle2,
  ShieldAlert, ShieldCheck, X, Activity, BarChart3,
  FileAudio, Check
} from 'lucide-react';

function ThreatBadge({ score }) {
  if (score >= 85) return <span className="px-2.5 py-1 rounded-md text-xs font-semibold bg-red-50 text-red-700 border border-red-200 shadow-xs">CRITICAL THREAT — {score}</span>;
  if (score >= 65) return <span className="px-2.5 py-1 rounded-md text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200 shadow-xs">ELEVATED RISK — {score}</span>;
  if (score >= 35) return <span className="px-2.5 py-1 rounded-md text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200 shadow-xs">MODERATE — {score}</span>;
  return <span className="px-2.5 py-1 rounded-md text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200 shadow-xs">AUTHENTIC — {score}</span>;
}

function Meter({ label, value, max = 1, color = 'blue' }) {
  const pct = Math.round((value / max) * 100);
  const colorMap = { red: 'bg-red-500', amber: 'bg-amber-500', blue: 'bg-blue-600', emerald: 'bg-emerald-600' };
  return (
    <div>
      <div className="flex justify-between text-xs mb-1.5 font-medium">
        <span className="text-slate-600">{label}</span>
        <strong className="text-slate-900">{(value * 100).toFixed(1)}%</strong>
      </div>
      <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden border border-slate-200/60">
        <div className={`h-full rounded-full ${colorMap[color]}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function AnalyzeAudio() {
  const [file, setFile] = useState(null);
  const [speakerId, setSpeakerId] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const inputRef = useRef();

  const handleFile = (f) => {
    if (!f) return;
    setFile(f);
    setResult(null);
    setError('');
  };

  const handleAnalyze = async () => {
    if (!file) { setError('Please select an audio file to analyze.'); return; }
    setLoading(true); setError(''); setResult(null);
    try {
      const data = await api.analyzeAudioFile(file, speakerId.trim() || null);
      setResult(data);
    } catch (e) {
      setError(e.message || 'Analysis failed. Ensure the defense backend service is accessible.');
    } finally { setLoading(false); }
  };

  const inf = result?.inference || {};
  const risk = result?.risk_decision || {};
  const riskScore = Math.round(risk.risk_score || 0);

  return (
    <div className="space-y-6 font-sans">
      {/* Header */}
      <div className="pb-3 border-b border-slate-200/90">
        <h2 className="text-base font-semibold tracking-tight text-slate-900 flex items-center gap-2">
          <Mic className="w-5 h-5 text-blue-600" />
          <span>On-Demand Voice Threat Analysis</span>
        </h2>
        <p className="text-xs text-slate-500 mt-1">
          Upload forensic call recordings for voice authenticity verification, biometric speaker comparison, and social engineering risk scoring.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Upload Panel */}
        <div className="lg:col-span-2 space-y-4">
          <Card title="Upload Call Recording">
            <div className="space-y-4">
              {/* Drop zone */}
              <div
                className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
                  file ? 'border-blue-500 bg-blue-50/40' : 'border-slate-200 hover:border-blue-400 bg-slate-50/50'
                }`}
                onClick={() => inputRef.current?.click()}
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); handleFile(e.dataTransfer.files[0]); }}
              >
                {file ? (
                  <div className="space-y-2">
                    <FileAudio className="w-9 h-9 text-blue-600 mx-auto" />
                    <p className="text-xs text-slate-900 font-semibold truncate px-2">{file.name}</p>
                    <p className="text-2xs text-slate-500">{(file.size / 1024).toFixed(1)} KB</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Upload className="w-8 h-8 text-slate-400 mx-auto" />
                    <p className="text-xs text-slate-700 font-medium">Drag & drop audio or <span className="text-blue-600 underline">browse</span></p>
                    <p className="text-2xs text-slate-500">WAV · MP3 · FLAC · OGG · WebM</p>
                  </div>
                )}
                <input
                  ref={inputRef}
                  type="file"
                  accept=".wav,.mp3,.flac,.ogg,.webm,audio/*"
                  className="hidden"
                  onChange={e => handleFile(e.target.files[0])}
                />
              </div>

              {file && (
                <button
                  type="button"
                  onClick={() => { setFile(null); setResult(null); }}
                  className="text-xs text-slate-500 hover:text-red-600 flex items-center gap-1 font-medium"
                >
                  <X className="w-3.5 h-3.5" /> Remove file
                </button>
              )}

              {/* Optional speaker ID */}
              <div>
                <label className="block text-2xs text-slate-600 uppercase mb-1 font-semibold tracking-wider">
                  Claimed Executive Identity (optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. spk_exec_00001"
                  value={speakerId}
                  onChange={e => setSpeakerId(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 shadow-xs"
                />
                <p className="text-2xs text-slate-500 mt-1">Provide a reference profile ID to test biometric match against enrolled voice vectors.</p>
              </div>

              {error && (
                <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl text-xs text-red-800 flex items-start gap-2 shadow-xs">
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <Button
                variant="primary" size="sm"
                className="w-full justify-center"
                onClick={handleAnalyze}
                disabled={loading || !file}
                icon={loading ? Loader2 : Activity}
              >
                {loading ? 'Analyzing Voice Telemetry...' : 'Run Security Inspection'}
              </Button>
            </div>
          </Card>

          {/* Defense Capabilities Overview */}
          <Card title="Inspection Subsystems">
            <div className="space-y-3 text-xs text-slate-600">
              {[
                ['Voice Authenticity Verification', 'Detects neural vocoder artifacts and synthetic waveform cloning.'],
                ['Executive Reference Matching', 'Compares biometric features against protected executive voiceprints.'],
                ['Speech Transcript Extraction', 'Converts live utterance to text under zero-retention privacy.'],
                ['Fraud Intent Scoring', 'Flags urgency pretexts, wire instructions, and credential harvesting.'],
                ['Autonomous Defense Synthesis', 'Aggregates signals into enterprise incident severity verdict.'],
              ].map(([name, desc]) => (
                <div key={name} className="flex items-start gap-2.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-600 mt-1.5 shrink-0" />
                  <div>
                    <span className="text-slate-900 font-semibold">{name}</span>
                    <p className="text-2xs text-slate-500 mt-0.5">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* Results Panel */}
        <div className="lg:col-span-3 space-y-4">
          {!result && !loading && (
            <div className="h-80 flex flex-col items-center justify-center border-2 border-dashed border-slate-200 rounded-2xl text-slate-500 text-xs gap-2 bg-slate-50/50 p-6 text-center">
              <FileAudio className="w-10 h-10 text-slate-400" />
              <p className="font-medium text-slate-700">No Audio Analyzed Yet</p>
              <p className="text-2xs text-slate-500 max-w-sm">
                Upload a call recording on the left to inspect synthetic voice markers, speaker mismatch, and fraud indicators.
              </p>
            </div>
          )}

          {loading && (
            <div className="h-80 flex flex-col items-center justify-center gap-3 border border-slate-200 rounded-2xl bg-white shadow-xs p-6">
              <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
              <p className="text-xs font-semibold text-slate-800">Processing Audio Inspection...</p>
              <p className="text-2xs text-slate-500">Checking voice authenticity · Biometric comparison · Fraud pretext scan</p>
            </div>
          )}

          {result && (
            <>
              {/* Overall verdict */}
              <Card title="Incident Threat Assessment">
                <div className="flex items-center justify-between">
                  <div className="space-y-1.5">
                    <div className="text-2xs text-slate-500 uppercase tracking-wider font-semibold">Evaluated Threat Level</div>
                    <ThreatBadge score={riskScore} />
                    <div className="text-xs text-slate-600 mt-1">
                      Targeting Scenario: <span className="text-slate-900 font-semibold">{risk.scenario || 'Voice Security Evaluation'}</span>
                    </div>
                    <div className="text-xs text-slate-600">
                      Recommended Action: <span className="text-blue-700 font-semibold">{risk.recommended_action || 'VERIFY VIA OUT-OF-BAND CHANNEL'}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-4xl font-extrabold">
                      <span className={riskScore >= 85 ? 'text-red-600' : riskScore >= 65 ? 'text-amber-600' : 'text-emerald-700'}>
                        {riskScore}
                      </span>
                      <span className="text-sm font-semibold text-slate-400"> / 100</span>
                    </div>
                    <span className="text-2xs text-slate-500 uppercase font-semibold">Threat Score</span>
                  </div>
                </div>

                {/* Reasons */}
                {Array.isArray(risk.reasons) && risk.reasons.length > 0 && (
                  <div className="mt-5 pt-4 border-t border-slate-100 space-y-2">
                    <div className="text-2xs uppercase tracking-wider text-slate-500 font-semibold">Key Detection Indicators</div>
                    {risk.reasons.map((r, i) => (
                      <div key={i} className="flex items-start gap-2.5 text-xs text-slate-800 bg-slate-50 border border-slate-200/80 rounded-lg p-2.5">
                        <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                        <span>{r}</span>
                      </div>
                    ))}
                  </div>
                )}
              </Card>

              {/* Core Indicators */}
              <Card title={<span className="flex items-center gap-2"><BarChart3 className="w-4 h-4 text-blue-600" /> Voice Authenticity Indicators</span>}>
                <div className="space-y-3.5">
                  {inf.synthetic_probability !== undefined && (
                    <Meter
                      label="Synthetic Voice Probability"
                      value={inf.synthetic_probability}
                      color={inf.synthetic_probability >= 0.7 ? 'red' : inf.synthetic_probability >= 0.4 ? 'amber' : 'blue'}
                    />
                  )}
                  {inf.speaker_similarity !== undefined && (
                    <Meter
                      label="Biometric Speaker Match Score"
                      value={inf.speaker_similarity}
                      color={inf.speaker_similarity < 0.5 ? 'red' : 'emerald'}
                    />
                  )}
                </div>

                <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4 border-t border-slate-100">
                  {[
                    { label: 'Authenticity Status', value: inf.identity_status || '—' },
                    { label: 'Voice Classification', value: inf.label || '—' },
                    { label: 'Detected Pretext', value: inf.intent || '—' },
                    { label: 'Analyzed File', value: result.filename || file?.name || '—' },
                  ].map(({ label, value }) => (
                    <div key={label} className="bg-slate-50 border border-slate-200/70 rounded-lg p-2.5">
                      <div className="text-2xs text-slate-500 uppercase font-semibold">{label}</div>
                      <div className="text-xs text-slate-900 font-bold mt-0.5 truncate">{value}</div>
                    </div>
                  ))}
                </div>
              </Card>

              {/* Transcript */}
              {inf.transcript && (
                <Card title="Analyzed Call Speech Transcript">
                  <p className="text-xs text-slate-800 bg-slate-50 border border-slate-200/80 rounded-xl p-3.5 leading-relaxed italic">
                    "{inf.transcript}"
                  </p>
                </Card>
              )}

              {/* Context signals */}
              {Array.isArray(inf.context_signals) && inf.context_signals.length > 0 && (
                <Card title="Identified Urgent Pretext Keywords">
                  <div className="flex flex-wrap gap-2">
                    {inf.context_signals.map((s, i) => (
                      <span key={i} className="px-3 py-1 text-xs font-semibold rounded-md bg-amber-50 border border-amber-200 text-amber-800 shadow-xs">
                        {s}
                      </span>
                    ))}
                  </div>
                </Card>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
