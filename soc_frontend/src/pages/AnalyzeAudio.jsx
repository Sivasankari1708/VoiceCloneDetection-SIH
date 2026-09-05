// src/pages/AnalyzeAudio.jsx
import React, { useState, useRef } from 'react';
import { api } from '../services/api';
import { Card } from '../components/common/Card';
import { Button } from '../components/common/Button';
import {
  Upload, Mic, Loader2, AlertCircle, CheckCircle2,
  ShieldAlert, ShieldCheck, X, Activity, BarChart3
} from 'lucide-react';

function RiskBadge({ score }) {
  if (score >= 85) return <span className="px-2.5 py-1 rounded text-xs font-bold bg-red-950/80 text-red-300 border border-red-700">CRITICAL — {score}</span>;
  if (score >= 65) return <span className="px-2.5 py-1 rounded text-xs font-bold bg-orange-950/80 text-orange-300 border border-orange-700">HIGH — {score}</span>;
  if (score >= 35) return <span className="px-2.5 py-1 rounded text-xs font-bold bg-amber-950/80 text-amber-300 border border-amber-700">MEDIUM — {score}</span>;
  return <span className="px-2.5 py-1 rounded text-xs font-bold bg-emerald-950/80 text-emerald-300 border border-emerald-700">LOW — {score}</span>;
}

function Meter({ label, value, max = 1, color = 'red' }) {
  const pct = Math.round((value / max) * 100);
  const colorMap = { red: 'bg-red-500', amber: 'bg-amber-400', sky: 'bg-sky-400', emerald: 'bg-emerald-400' };
  return (
    <div>
      <div className="flex justify-between text-2xs mb-1">
        <span className="text-slate-400">{label}</span>
        <strong className="text-slate-200">{(value * 100).toFixed(1)}%</strong>
      </div>
      <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
        <div className={`h-full ${colorMap[color]}`} style={{ width: `${pct}%` }} />
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
      setError(e.message || 'Analysis failed. Ensure the backend is running and the AI pipeline is loaded.');
    } finally { setLoading(false); }
  };

  const inf = result?.inference || {};
  const risk = result?.risk_decision || {};
  const riskScore = Math.round(risk.risk_score || 0);

  return (
    <div className="space-y-6 font-mono">
      {/* Header */}
      <div className="pb-2 border-b border-soc-border">
        <h2 className="text-sm font-bold tracking-wider text-slate-100 uppercase flex items-center gap-2">
          <Mic className="w-4 h-4 text-soc-accent" />
          <span>Batch Audio Analysis — AI Deepfake Detection</span>
        </h2>
        <p className="text-2xs text-slate-500 mt-0.5">
          Upload any audio file for full acoustic deepfake detection, biometric speaker verification, and intent analysis using the VoiceCloneDetection AI pipeline.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Upload Panel */}
        <div className="lg:col-span-2 space-y-4">
          <Card title="Upload Audio File">
            <div className="space-y-4">
              {/* Drop zone */}
              <div
                className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                  file ? 'border-soc-accent bg-soc-accent/5' : 'border-slate-700 hover:border-soc-accent'
                }`}
                onClick={() => inputRef.current?.click()}
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); handleFile(e.dataTransfer.files[0]); }}
              >
                {file ? (
                  <div className="space-y-2">
                    <CheckCircle2 className="w-8 h-8 text-soc-accent mx-auto" />
                    <p className="text-xs text-slate-200 font-semibold">{file.name}</p>
                    <p className="text-2xs text-slate-500">{(file.size / 1024).toFixed(1)} KB</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Upload className="w-8 h-8 text-slate-500 mx-auto" />
                    <p className="text-xs text-slate-400">Drag & drop audio or <span className="text-soc-accent">browse</span></p>
                    <p className="text-2xs text-slate-600">WAV · MP3 · FLAC · OGG · WebM</p>
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
                  onClick={() => { setFile(null); setResult(null); }}
                  className="text-2xs text-slate-500 hover:text-red-400 flex items-center gap-1"
                >
                  <X className="w-3 h-3" /> Remove file
                </button>
              )}

              {/* Optional speaker ID */}
              <div>
                <label className="block text-2xs text-slate-400 uppercase mb-1 font-semibold">
                  Claimed Speaker ID (optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. spk_exec_00001"
                  value={speakerId}
                  onChange={e => setSpeakerId(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-soc-accent"
                />
                <p className="text-[10px] text-slate-600 mt-1">Provide a protected identity speaker ID to run biometric similarity comparison.</p>
              </div>

              {error && (
                <div className="p-3 bg-red-950/50 border border-red-700 rounded text-xs text-red-300 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  {error}
                </div>
              )}

              <Button
                variant="primary" size="sm"
                className="w-full"
                onClick={handleAnalyze}
                disabled={loading || !file}
                icon={loading ? Loader2 : Activity}
              >
                {loading ? 'Running AI Pipeline...' : 'Run Full Analysis'}
              </Button>
            </div>
          </Card>

          {/* How it works */}
          <Card title="AI Pipeline">
            <div className="space-y-2.5 text-2xs text-slate-400">
              {[
                ['SileroVAD', 'Voice activity detection & segmentation'],
                ['DeepfakeCNN v2', 'Acoustic spectral deepfake classification'],
                ['ECAPA-TDNN', '192-D speaker embedding & biometric comparison'],
                ['Faster-Whisper', 'Speech-to-text transcription (int8 CPU)'],
                ['IntentDetector', 'Social engineering & fraud intent scoring'],
                ['RiskEngine', 'Multi-factor risk synthesis & decision'],
              ].map(([name, desc]) => (
                <div key={name} className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-soc-accent mt-1.5 shrink-0" />
                  <div><span className="text-slate-300 font-semibold">{name}</span> — {desc}</div>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* Results Panel */}
        <div className="lg:col-span-3 space-y-4">
          {!result && !loading && (
            <div className="h-64 flex items-center justify-center border border-dashed border-slate-800 rounded-lg text-slate-600 text-xs">
              Upload an audio file and run analysis to see results
            </div>
          )}
          {loading && (
            <div className="h-64 flex flex-col items-center justify-center gap-3 border border-soc-border rounded-lg bg-soc-card">
              <Loader2 className="w-8 h-8 text-soc-accent animate-spin" />
              <p className="text-xs text-slate-400">Running full AI inference pipeline...</p>
              <p className="text-2xs text-slate-600">VAD → Deepfake detection → Speaker verification → Intent analysis</p>
            </div>
          )}

          {result && (
            <>
              {/* Overall verdict */}
              <Card title="Overall Risk Assessment">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <div className="text-2xs text-slate-500 uppercase tracking-widest">Synthesized Risk Score</div>
                    <RiskBadge score={riskScore} />
                    <div className="text-2xs text-slate-400 mt-1">
                      Scenario: <span className="text-slate-200">{risk.scenario || 'Voice Analysis'}</span>
                    </div>
                    <div className="text-2xs text-slate-400">
                      Recommended: <span className="text-amber-300 font-semibold">{risk.recommended_action || 'REVIEW'}</span>
                    </div>
                  </div>
                  <div className="text-5xl font-black text-right">
                    <span className={riskScore >= 85 ? 'text-red-400' : riskScore >= 65 ? 'text-orange-400' : 'text-emerald-400'}>
                      {riskScore}
                    </span>
                    <span className="text-sm font-bold text-slate-600">/100</span>
                  </div>
                </div>

                {/* Reasons */}
                {Array.isArray(risk.reasons) && risk.reasons.length > 0 && (
                  <div className="mt-4 space-y-1.5">
                    <div className="text-2xs uppercase tracking-wider text-slate-500 font-semibold">Detection Reasons</div>
                    {risk.reasons.map((r, i) => (
                      <div key={i} className="flex items-start gap-2 text-2xs text-slate-300 bg-slate-900/50 border border-slate-800 rounded p-2">
                        <ShieldAlert className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                        {r}
                      </div>
                    ))}
                  </div>
                )}
              </Card>

              {/* Inference metrics */}
              <Card title={<span className="flex items-center gap-2"><BarChart3 className="w-3.5 h-3.5 text-soc-accent" /> Acoustic & Biometric Metrics</span>}>
                <div className="space-y-3">
                  {inf.synthetic_probability !== undefined && (
                    <Meter
                      label="Synthetic Voice Probability (Deepfake)"
                      value={inf.synthetic_probability}
                      color="red"
                    />
                  )}
                  {inf.speaker_similarity !== undefined && (
                    <Meter
                      label="Speaker Biometric Similarity"
                      value={inf.speaker_similarity}
                      color="sky"
                    />
                  )}
                  {inf.voice_activity_ratio !== undefined && (
                    <Meter
                      label="Voice Activity Ratio"
                      value={inf.voice_activity_ratio}
                      color="emerald"
                    />
                  )}
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3">
                  {[
                    { label: 'Identity Status', value: inf.identity_status || '—' },
                    { label: 'Voice Label', value: inf.label || '—' },
                    { label: 'Intent Detected', value: inf.intent || '—' },
                    { label: 'Filename', value: result.filename || file?.name || '—' },
                  ].map(({ label, value }) => (
                    <div key={label} className="bg-slate-900/60 border border-slate-800 rounded p-2.5">
                      <div className="text-2xs text-slate-500 uppercase font-semibold">{label}</div>
                      <div className="text-xs text-slate-200 font-bold mt-0.5 truncate">{value}</div>
                    </div>
                  ))}
                </div>
              </Card>

              {/* Transcript */}
              {inf.transcript && (
                <Card title="Speech Transcript (Whisper ASR)">
                  <p className="text-xs text-slate-300 bg-slate-900/60 border border-slate-800 rounded p-3 leading-relaxed italic">
                    "{inf.transcript}"
                  </p>
                </Card>
              )}

              {/* Context signals */}
              {Array.isArray(inf.context_signals) && inf.context_signals.length > 0 && (
                <Card title="Detected Sensitive Keywords & Intent Signals">
                  <div className="flex flex-wrap gap-2">
                    {inf.context_signals.map((s, i) => (
                      <span key={i} className="px-2.5 py-1 text-2xs rounded bg-amber-950/50 border border-amber-800/50 text-amber-300">
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
