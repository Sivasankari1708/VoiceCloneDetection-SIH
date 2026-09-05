// src/pages/ProtectedIdentities.jsx
import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { Card } from '../components/common/Card';
import { Button } from '../components/common/Button';
import { ShieldCheck, UserCheck, Search, Shield, AlertCircle, Plus } from 'lucide-react';

export function ProtectedIdentities() {
  const [identities, setIdentities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('ALL');

  useEffect(() => {
    async function load() {
      const data = await api.getProtectedIdentities();
      setIdentities(data);
      setLoading(false);
    }
    load();
  }, []);

  const filtered = identities.filter((item) => {
    const matchesSearch =
      item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.position.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.department.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesDept = departmentFilter === 'ALL' || item.department === departmentFilter;
    return matchesSearch && matchesDept;
  });

  return (
    <div className="space-y-4 font-mono">
      {/* Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-soc-border">
        <div>
          <h2 className="text-sm font-bold tracking-wider text-slate-100 uppercase flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Protected Executive Identities & Enrolled Voiceprints</span>
          </h2>
          <p className="text-2xs text-slate-500 mt-0.5">
            Biometric reference embeddings used for real-time ECAPA-TDNN speaker verification and imposter rejection
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" icon={Plus}>
            Enroll New Identity
          </Button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="p-3 bg-soc-card border border-soc-border rounded-md flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 flex-1 min-w-[260px]">
          <div className="relative flex-1 max-w-sm">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search executive name, title, department..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700/80 rounded px-2.5 py-1.5 pl-8 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-soc-accent"
            />
          </div>

          <select
            value={departmentFilter}
            onChange={(e) => setDepartmentFilter(e.target.value)}
            className="bg-slate-900 border border-slate-700/80 rounded px-2.5 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-soc-accent"
          >
            <option value="ALL">All Departments</option>
            <option value="Finance">Finance</option>
            <option value="Executive">Executive</option>
            <option value="Engineering">Engineering</option>
            <option value="Legal">Legal</option>
            <option value="HR">HR</option>
            <option value="IT Operations">IT Operations</option>
          </select>
        </div>

        <span className="text-2xs text-slate-500">
          {filtered.length} Protected Profiles Configured
        </span>
      </div>

      {/* Table */}
      <div className="bg-soc-card border border-soc-border rounded-md overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs font-mono">
            <thead>
              <tr className="border-b border-soc-border bg-slate-950/70 text-2xs uppercase tracking-wider text-slate-400 font-semibold">
                <th className="py-2.5 px-3">Identity Name</th>
                <th className="py-2.5 px-3">Position / Title</th>
                <th className="py-2.5 px-3">Department</th>
                <th className="py-2.5 px-3">Protection Status</th>
                <th className="py-2.5 px-3">Speaker Profile Status</th>
                <th className="py-2.5 px-3">Samples Enrolled</th>
                <th className="py-2.5 px-3">Enrollment Date</th>
                <th className="py-2.5 px-3">Last Biometric Verification</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-soc-border/60">
              {filtered.map((item) => (
                <tr key={item.id} className="hover:bg-slate-800/40 transition-colors">
                  <td className="py-3 px-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-soc-accent">
                        {item.avatarInitials}
                      </div>
                      <div>
                        <div className="font-semibold text-slate-100">{item.name}</div>
                        <div className="text-[10px] text-slate-500">{item.id} • {item.riskTier}</div>
                      </div>
                    </div>
                  </td>

                  <td className="py-3 px-3 font-medium text-slate-300">
                    {item.position}
                  </td>

                  <td className="py-3 px-3 text-slate-300">
                    {item.department}
                  </td>

                  <td className="py-3 px-3">
                    <span className="px-2 py-0.5 rounded text-2xs font-semibold bg-emerald-950/60 text-emerald-300 border border-emerald-800/60 uppercase">
                      {item.protectionStatus}
                    </span>
                  </td>

                  <td className="py-3 px-3">
                    <span className={`px-2 py-0.5 rounded text-2xs font-semibold uppercase ${
                      item.speakerProfileStatus === 'ENROLLED'
                        ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-800/60'
                        : 'bg-amber-950/60 text-amber-300 border border-amber-800/60'
                    }`}>
                      {item.speakerProfileStatus}
                    </span>
                  </td>

                  <td className="py-3 px-3 text-slate-300">
                    {item.samplesCount} audio samples
                  </td>

                  <td className="py-3 px-3 text-2xs text-slate-400">
                    {item.enrollmentDate}
                  </td>

                  <td className="py-3 px-3 text-2xs text-slate-300">
                    {item.lastVerification}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
