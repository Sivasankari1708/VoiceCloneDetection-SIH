// src/pages/AuditLogs.jsx
import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { Card } from '../components/common/Card';
import { FileClock, Search, Shield, Lock, Download } from 'lucide-react';
import { Button } from '../components/common/Button';

export function AuditLogs() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [actionFilter, setActionFilter] = useState('ALL');

  useEffect(() => {
    async function load() {
      const data = await api.getAuditLogs();
      setLogs(data);
      setLoading(false);
    }
    load();
  }, []);

  const filteredLogs = logs.filter((log) => {
    const matchesSearch =
      (log.actor?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
      (log.incidentId?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
      (log.action?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
      (log.newState?.toLowerCase() || '').includes(searchTerm.toLowerCase());

    const matchesAction = actionFilter === 'ALL' || log.action === actionFilter;
    return matchesSearch && matchesAction;
  });

  const exportCsv = () => {
    const headers = ['Timestamp', 'Actor', 'Role', 'Action', 'Incident ID', 'Previous State', 'New State'];
    const rows = filteredLogs.map(l => [
      `"${l.timestamp}"`,
      `"${l.actor}"`,
      `"${l.role}"`,
      `"${l.action}"`,
      `"${l.incidentId || ''}"`,
      `"${l.prevState || ''}"`,
      `"${l.newState || ''}"`
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `soc_audit_log_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-4 font-sans text-slate-800">
      {/* Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200/80">
        <div>
          <h2 className="text-base font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <FileClock className="w-4 h-4 text-blue-600" />
            <span>SOC Governance & Action Audit Trail</span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Read-only cryptographic log of all analyst interventions, state transitions, CIRT escalations, and verdicts
          </p>
        </div>

        <Button variant="outline" size="sm" onClick={exportCsv} icon={Download}>
          Export CSV Audit
        </Button>
      </div>

      {/* Filter Row */}
      <div className="p-3.5 bg-white border border-slate-200/90 rounded-2xl shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 flex-1 min-w-[280px]">
          <div className="relative flex-1 max-w-sm">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by actor, incident, state..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300/90 rounded-xl px-3 py-2 pl-9 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:border-blue-600 transition"
            />
          </div>

          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="bg-slate-50 border border-slate-300/90 rounded-xl px-3 py-2 text-xs text-slate-700 focus:outline-none focus:bg-white focus:border-blue-600 transition"
          >
            <option value="ALL">All Actions</option>
            <option value="CREATE_INCIDENT">CREATE_INCIDENT</option>
            <option value="ASSIGN_ANALYST">ASSIGN_ANALYST</option>
            <option value="ACKNOWLEDGE_INCIDENT">ACKNOWLEDGE_INCIDENT</option>
            <option value="RESOLVE_INCIDENT">RESOLVE_INCIDENT</option>
            <option value="ESCALATE_TO_CIRT">ESCALATE_TO_CIRT</option>
          </select>
        </div>

        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Lock className="w-3.5 h-3.5 text-slate-400" />
          <span>Read-Only Compliance Guard Active</span>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200/90 rounded-2xl shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/75 text-2xs uppercase tracking-wider text-slate-500 font-semibold">
                <th className="py-3 px-4">Timestamp (UTC)</th>
                <th className="py-3 px-4">Actor</th>
                <th className="py-3 px-4">Role</th>
                <th className="py-3 px-4">Action Executed</th>
                <th className="py-3 px-4">Target Incident</th>
                <th className="py-3 px-4">Previous State</th>
                <th className="py-3 px-4">New Transition State</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredLogs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="py-3.5 px-4 text-xs text-slate-500 whitespace-nowrap">
                    {log.timestamp}
                  </td>

                  <td className="py-3.5 px-4 font-semibold text-slate-900">
                    {log.actor}
                  </td>

                  <td className="py-3.5 px-4 text-slate-500 text-xs">
                    {log.role}
                  </td>

                  <td className="py-3.5 px-4 font-semibold text-blue-600">
                    {log.action}
                  </td>

                  <td className="py-3.5 px-4 text-slate-700 font-medium">
                    {log.incidentId || '—'}
                  </td>

                  <td className="py-3.5 px-4 text-slate-500 text-xs">
                    {log.prevState || '—'}
                  </td>

                  <td className="py-3.5 px-4 font-semibold text-slate-900">
                    {log.newState}
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

