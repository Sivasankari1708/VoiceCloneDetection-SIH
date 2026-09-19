// src/pages/ProtectedIdentities.jsx
import React, { useState, useEffect, useRef } from 'react';
import { api } from '../services/api';
import { Card } from '../components/common/Card';
import { Button } from '../components/common/Button';
import {
  ShieldCheck, Search, Plus, Trash2, Mic, X, Upload,
  CheckCircle2, AlertCircle, Loader2, UserPlus
} from 'lucide-react';

// ─── Enroll Voice Modal ────────────────────────────────────────────────────────
function EnrollVoiceModal({ identity, onClose, onDone }) {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const inputRef = useRef();

  const handleFiles = (picked) => {
    const allowed = Array.from(picked).filter(f =>
      ['audio/wav', 'audio/x-wav', 'audio/mpeg', 'audio/flac', 'audio/ogg', 'audio/webm'].includes(f.type) ||
      f.name.match(/\.(wav|mp3|flac|ogg|webm)$/i)
    );
    setFiles(prev => [...prev, ...allowed].slice(0, 6));
    setError('');
  };

  const readAsBase64 = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const handleEnroll = async () => {
    if (files.length < 3) {
      setError('Please add at least 3 audio samples.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const base64Samples = await Promise.all(files.map(readAsBase64));
      const res = await api.enrollVoiceSamples(identity.id, base64Samples);
      setResult(res);

      if (res.success) {
        onDone();
      }
    } catch (e) {
      setError(e.message || 'Enrollment failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
      <div className="bg-white border border-slate-200 rounded-2xl shadow-xl w-full max-w-lg font-sans text-slate-800">
        <div className="flex items-center justify-between p-5 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <Mic className="w-4 h-4 text-blue-600" />
            <span className="text-sm font-bold text-slate-900">Enroll Biometric Voice Profile</span>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 cursor-pointer p-1 rounded-lg">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="text-xs text-slate-600">
            Enrolling reference voice profile for <strong className="text-slate-900">{identity.name}</strong>. Upload
            3–6 clean reference audio samples (WAV/MP3/FLAC, ≥ 5 seconds each).
          </div>

          {/* Drop zone */}
          <div
            className="border-2 border-dashed border-slate-300 rounded-xl p-6 text-center cursor-pointer hover:border-blue-500 hover:bg-slate-50/50 transition-colors"
            onClick={() => inputRef.current?.click()}
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); handleFiles(e.dataTransfer.files); }}
          >
            <Upload className="w-8 h-8 text-slate-400 mx-auto mb-2" />
            <p className="text-xs text-slate-600">Drag & drop audio files or <span className="text-blue-600 font-medium">browse local files</span></p>
            <p className="text-2xs text-slate-400 mt-1">WAV · MP3 · FLAC · OGG · WebM (max 6 files)</p>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept=".wav,.mp3,.flac,.ogg,.webm,audio/*"
              className="hidden"
              onChange={e => handleFiles(e.target.files)}
            />
          </div>

          {/* File list */}
          {files.length > 0 && (
            <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
              {files.map((f, i) => (
                <div key={i} className="flex items-center justify-between text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                  <span className="text-slate-800 truncate font-medium">{f.name}</span>
                  <div className="flex items-center gap-2 shrink-0 ml-2">
                    <span className="text-slate-500 text-2xs">{(f.size / 1024).toFixed(0)} KB</span>
                    <button onClick={() => setFiles(prev => prev.filter((_, j) => j !== i))} className="text-slate-400 hover:text-red-600 cursor-pointer">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {error && <p className="text-xs text-red-700 flex items-center gap-1.5"><AlertCircle className="w-3.5 h-3.5" />{error}</p>}

          {result && result.success && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-900 flex items-center gap-2 font-medium">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
              Enrollment successful. {result.accepted_samples} sample(s) accepted.
            </div>
          )}

          {result && !result.success && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-800">
              <div className="flex items-center gap-2 font-semibold text-red-900">
                <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
                Enrollment rejected
              </div>

              {result.rejection_reasons?.map((reason, i) => (
                <div key={i} className="mt-1">
                  • {reason}
                </div>
              ))}

              <div className="mt-2 text-2xs text-slate-600">
                Accepted: {result.accepted_samples} | Rejected: {result.rejected_samples}
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 p-5 border-t border-slate-200">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button
            variant="primary" size="sm"
            onClick={handleEnroll}
            disabled={loading || result?.success}
            icon={loading ? Loader2 : Mic}
          >
            {loading
              ? 'Enrolling...'
              : result?.success
                ? 'Enrolled ✓'
                : `Enroll ${files.length ? `(${files.length} files)` : ''}`}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Add Identity Modal ────────────────────────────────────────────────────────
function AddIdentityModal({ onClose, onCreated }) {
  const [form, setForm] = useState({
    full_name: '', title: '', department: 'Executive',
    email: '', phone: '', risk_priority: 'CRITICAL'
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const update = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.full_name.trim()) { setError('Full name is required.'); return; }
    setLoading(true); setError('');
    try {
      const created = await api.createProtectedIdentity(form);
      onCreated(created);
      onClose();
    } catch (e) {
      setError(e.message || 'Failed to create identity.');
    } finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
      <div className="bg-white border border-slate-200 rounded-2xl shadow-xl w-full max-w-md font-sans text-slate-800">
        <div className="flex items-center justify-between p-5 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <UserPlus className="w-4 h-4 text-blue-600" />
            <span className="text-sm font-bold text-slate-900">Enroll New Protected Executive</span>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 cursor-pointer p-1 rounded-lg">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-3.5">
          {[
            { label: 'Full Name *', key: 'full_name', placeholder: 'e.g. David Vance' },
            { label: 'Title / Role', key: 'title', placeholder: 'e.g. Chief Financial Officer' },
            { label: 'Email', key: 'email', placeholder: 'david.vance@company.com', type: 'email' },
            { label: 'Phone', key: 'phone', placeholder: '+1-555-0100' },
          ].map(({ label, key, placeholder, type = 'text' }) => (
            <div key={key}>
              <label className="block text-2xs text-slate-500 uppercase mb-1 font-semibold">{label}</label>
              <input
                type={type}
                placeholder={placeholder}
                value={form[key]}
                onChange={e => update(key, e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:border-blue-600 transition"
              />
            </div>
          ))}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-2xs text-slate-500 uppercase mb-1 font-semibold">Department</label>
              <select value={form.department} onChange={e => update('department', e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-700 focus:outline-none focus:bg-white focus:border-blue-600 transition">
                {['Executive', 'Finance', 'Engineering', 'Legal', 'HR', 'IT Operations', 'Operations'].map(d =>
                  <option key={d}>{d}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-2xs text-slate-500 uppercase mb-1 font-semibold">Risk Priority</label>
              <select value={form.risk_priority} onChange={e => update('risk_priority', e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-700 focus:outline-none focus:bg-white focus:border-blue-600 transition">
                {['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map(r => <option key={r}>{r}</option>)}
              </select>
            </div>
          </div>

          {error && <p className="text-xs text-red-700 flex items-center gap-1.5"><AlertCircle className="w-3.5 h-3.5" />{error}</p>}

          <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-200">
            <Button variant="outline" size="sm" onClick={onClose} type="button">Cancel</Button>
            <Button variant="primary" size="sm" type="submit" disabled={loading} icon={loading ? Loader2 : UserPlus}>
              {loading ? 'Creating...' : 'Create Identity'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export function ProtectedIdentities() {
  const [identities, setIdentities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('ALL');
  const [showAddModal, setShowAddModal] = useState(false);
  const [enrollTarget, setEnrollTarget] = useState(null);  // identity for voice enrollment
  const [deletingId, setDeletingId] = useState(null);
  const [feedback, setFeedback] = useState('');

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const data = await api.getProtectedIdentities();
      setIdentities(data);
    } finally {
      setLoading(false);
    }
  }

  const showFeedback = (msg) => {
    setFeedback(msg);
    setTimeout(() => setFeedback(''), 4000);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Permanently remove this protected identity and its biometric profile?')) return;
    setDeletingId(id);
    try {
      await api.deleteProtectedIdentity(id);
      setIdentities(prev => prev.filter(i => i.id !== id));
      showFeedback('Identity removed from protection vault.');
    } catch (e) {
      alert(e.message || 'Delete failed.');
    } finally {
      setDeletingId(null);
    }
  };

  const filtered = identities.filter((item) => {
    const matchesSearch =
      (item.name?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
      (item.position?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
      (item.department?.toLowerCase() || '').includes(searchTerm.toLowerCase());
    const matchesDept = departmentFilter === 'ALL' || item.department === departmentFilter;
    return matchesSearch && matchesDept;
  });

  return (
    <div className="space-y-4 font-sans text-slate-800">

      {/* Feedback toast */}
      {feedback && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs rounded-xl flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-600" />{feedback}</div>
          <button onClick={() => setFeedback('')} className="text-emerald-700 hover:text-emerald-900 cursor-pointer font-bold">✕</button>
        </div>
      )}

      {/* Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200/80">
        <div>
          <h2 className="text-base font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-blue-600" />
            <span>Protected Executive Identities & Enrolled Voiceprints</span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Biometric voice reference profiles used for real-time verification and executive impersonation defense
          </p>
        </div>
        <Button variant="secondary" size="sm" icon={Plus} onClick={() => setShowAddModal(true)}>
          Enroll New Identity
        </Button>
      </div>

      {/* Filter */}
      <div className="p-3.5 bg-white border border-slate-200/90 rounded-2xl shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 flex-1 min-w-[260px]">
          <div className="relative flex-1 max-w-sm">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search executive name, title, department..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300/90 rounded-xl px-3 py-2 pl-9 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:border-blue-600 transition"
            />
          </div>
          <select
            value={departmentFilter}
            onChange={(e) => setDepartmentFilter(e.target.value)}
            className="bg-slate-50 border border-slate-300/90 rounded-xl px-3 py-2 text-xs text-slate-700 focus:outline-none focus:bg-white focus:border-blue-600 transition"
          >
            <option value="ALL">All Departments</option>
            {['Finance', 'Executive', 'Engineering', 'Legal', 'HR', 'IT Operations'].map(d =>
              <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
        <span className="text-xs text-slate-500 font-medium">{filtered.length} Protected Profiles Configured</span>
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200/90 rounded-2xl shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/75 text-2xs uppercase tracking-wider text-slate-500 font-semibold">
                <th className="py-3 px-4">Identity Name</th>
                <th className="py-3 px-4">Position / Title</th>
                <th className="py-3 px-4">Department</th>
                <th className="py-3 px-4">Protection Status</th>
                <th className="py-3 px-4">Voice Profile</th>
                <th className="py-3 px-4">Samples</th>
                <th className="py-3 px-4">Enrollment Date</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && (
                <tr><td colSpan={8} className="py-8 text-center text-slate-500 text-xs">Loading protected identities...</td></tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={8} className="py-8 text-center text-slate-500 text-xs">No protected identities found.</td></tr>
              )}
              {filtered.map((item) => (
                <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="py-3.5 px-4">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center font-bold text-blue-700 text-xs">
                        {item.avatarInitials}
                      </div>
                      <div>
                        <div className="font-semibold text-slate-900">{item.name}</div>
                        <div className="text-2xs text-slate-500">{item.id?.slice(0, 12)} • {item.riskTier}</div>
                      </div>
                    </div>
                  </td>
                  <td className="py-3.5 px-4 font-medium text-slate-800">{item.position}</td>
                  <td className="py-3.5 px-4 text-slate-600">{item.department}</td>
                  <td className="py-3.5 px-4">
                    <span className="px-2.5 py-0.5 rounded-md text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200 uppercase">
                      {item.protectionStatus}
                    </span>
                  </td>
                  <td className="py-3.5 px-4">
                    <span className={`px-2.5 py-0.5 rounded-md text-xs font-semibold uppercase ${
                      item.speakerProfileStatus === 'ENROLLED'
                        ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                        : 'bg-amber-50 text-amber-800 border border-amber-200'
                    }`}>
                      {item.speakerProfileStatus}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-slate-700">{item.samplesCount} samples</td>
                  <td className="py-3.5 px-4 text-xs text-slate-500">{item.enrollmentDate}</td>
                  <td className="py-3.5 px-4">
                    <div className="flex items-center justify-end gap-1.5">
                      {/* Voice Enroll */}
                      <button
                        onClick={() => setEnrollTarget(item)}
                        title="Enroll voice samples"
                        className="p-1.5 rounded-lg text-blue-600 hover:bg-blue-50 transition-colors cursor-pointer"
                      >
                        <Mic className="w-4 h-4" />
                      </button>
                      {/* Delete */}
                      <button
                        onClick={() => handleDelete(item.id)}
                        disabled={deletingId === item.id}
                        title="Remove identity"
                        className="p-1.5 rounded-lg text-slate-400 hover:text-red-700 hover:bg-red-50 transition-colors disabled:opacity-40 cursor-pointer"
                      >
                        {deletingId === item.id
                          ? <Loader2 className="w-4 h-4 animate-spin" />
                          : <Trash2 className="w-4 h-4" />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modals */}
      {showAddModal && (
        <AddIdentityModal
          onClose={() => setShowAddModal(false)}
          onCreated={(created) => {
            setIdentities(prev => [created, ...prev]);
            showFeedback(`${created.name} added to protected identity vault.`);
          }}
        />
      )}

      {enrollTarget && (
        <EnrollVoiceModal
          identity={enrollTarget}
          onClose={() => setEnrollTarget(null)}
          onDone={() => {
            showFeedback(`Voice biometric profile enrolled for ${enrollTarget.name}.`);
            setEnrollTarget(null);
            load();  // refresh to show updated samplesCount
          }}
        />
      )}
    </div>
  );
}

