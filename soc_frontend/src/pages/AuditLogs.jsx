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
      log.actor.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.incidentId?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.action.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.newState.toLowerCase().includes(searchTerm.toLowerCase());

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
    <div className="space-y-4 font-mono">
      {/* Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-soc-border">
        <div>
          <h2 className="text-sm font-bold tracking-wider text-slate-100 uppercase flex items-center gap-2">
            <FileClock className="w-4 h-4 text-soc-accent" />
            <span>Immutable SOC Governance & Action Audit Trail</span>
          </h2>
          <p className="text-2xs text-slate-500 mt-0.5">
            Read-only cryptographic log of all analyst interventions, state transitions, CIRT escalations, and verdicts
          </p>
        </div>

        <Button variant="outline" size="sm" onClick={exportCsv} icon={Download}>
          Export CSV Audit
        </Button>
      </div>

      {/* Filter Row */}
      <div className="p-3 bg-soc-card border border-soc-border rounded-md flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 flex-1 min-w-[280px]">
          <div className="relative flex-1 max-w-sm">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by actor, incident, state..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700/80 rounded px-2.5 py-1.5 pl-8 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-soc-accent"
            />
          </div>

          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="bg-slate-900 border border-slate-700/80 rounded px-2.5 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-soc-accent"
          >
            <option value="ALL">All Actions</option>
            <option value="CREATE_INCIDENT">CREATE_INCIDENT</option>
            <option value="ASSIGN_ANALYST">ASSIGN_ANALYST</option>
            <option value="ACKNOWLEDGE_INCIDENT">ACKNOWLEDGE_INCIDENT</option>
            <option value="RESOLVE_INCIDENT">RESOLVE_INCIDENT</option>
            <option value="ESCALATE_TO_CIRT">ESCALATE_TO_CIRT</option>
          </select>
        </div>

        <div className="flex items-center gap-2 text-2xs text-slate-500">
          <Lock className="w-3 h-3 text-slate-400" />
          <span>Read-Only Compliance Guard Active</span>
        </div>
      </div>

      {/* Table */}
      <div className="bg-soc-card border border-soc-border rounded-md overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs font-mono">
            <thead>
              <tr className="border-b border-soc-border bg-slate-950/70 text-2xs uppercase tracking-wider text-slate-400 font-semibold">
                <th className="py-2.5 px-3">Timestamp (UTC)</th>
                <th className="py-2.5 px-3">Actor</th>
                <th className="py-2.5 px-3">Role</th>
                <th className="py-2.5 px-3">Action Executed</th>
                <th className="py-2.5 px-3">Target Incident</th>
                <th className="py-2.5 px-3">Previous State</th>
                <th className="py-2.5 px-3">New Transition State</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-soc-border/60">
              {filteredLogs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-800/40 transition-colors">
                  <td className="py-2.5 px-3 text-2xs text-slate-400 whitespace-nowrap">
                    {log.timestamp}
                  </td>

                  <td className="py-2.5 px-3 font-semibold text-slate-200">
                    {log.actor}
                  </td>

                  <td className="py-2.5 px-3 text-2xs text-slate-400">
                    {log.role}
                  </td>

                  <td className="py-2.5 px-3 font-semibold text-soc-accent">
                    {log.action}
                  </td>

                  <td className="py-2.5 px-3 font-mono text-slate-300">
                    {log.incidentId || '—'}
                  </td>

                  <td className="py-2.5 px-3 text-2xs text-slate-400">
                    {log.prevState || '—'}
                  </td>

                  <td className="py-2.5 px-3 text-2xs font-semibold text-slate-200">
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
