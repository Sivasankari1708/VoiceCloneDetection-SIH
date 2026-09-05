// src/components/dashboard/ActiveThreatsTable.jsx
import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { SeverityTag } from '../common/SeverityTag';
import { formatStatus, getRiskColor, getRiskBarColor } from '../../utils/formatters';
import { Search, Filter, ArrowUpDown, ChevronRight, ShieldAlert, ArrowRight } from 'lucide-react';
import { Button } from '../common/Button';

export function ActiveThreatsTable({ incidents, title = "Active Security Threats", isFullPage = false }) {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [severityFilter, setSeverityFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [sortField, setSortField] = useState('riskScore');
  const [sortAsc, setSortAsc] = useState(false);

  const filteredIncidents = useMemo(() => {
    return incidents.filter((inc) => {
      // Search
      const matchesSearch = 
        inc.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        inc.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        inc.target?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        inc.claimedIdentity?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        inc.target?.department?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        inc.attackType?.toLowerCase().includes(searchTerm.toLowerCase());

      // Severity filter
      const matchesSeverity = severityFilter === 'ALL' || inc.severity === severityFilter;

      // Status filter
      const matchesStatus = statusFilter === 'ALL' || inc.status === statusFilter;

      return matchesSearch && matchesSeverity && matchesStatus;
    }).sort((a, b) => {
      let valA = a[sortField];
      let valB = b[sortField];

      if (sortField === 'createdAt') {
        valA = new Date(a.createdAt).getTime();
        valB = new Date(b.createdAt).getTime();
      }

      if (valA < valB) return sortAsc ? -1 : 1;
      if (valA > valB) return sortAsc ? 1 : -1;
      return 0;
    });
  }, [incidents, searchTerm, severityFilter, statusFilter, sortField, sortAsc]);

  const handleSort = (field) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  return (
    <div className="bg-soc-card border border-soc-border rounded-md overflow-hidden flex flex-col">
      {/* Header & Controls */}
      <div className="p-4 border-b border-soc-border flex flex-col md:flex-row md:items-center justify-between gap-3 bg-slate-900/30">
        <div>
          <h2 className="font-mono text-xs font-semibold uppercase tracking-wider text-soc-text flex items-center gap-2">
            <span>{title}</span>
            <span className="text-2xs font-normal text-slate-400">({filteredIncidents.length} Records)</span>
          </h2>
          <p className="text-2xs font-mono text-slate-500 mt-0.5">
            Real-time correlation of biometric mismatch, acoustic synthesis, and social engineering threat intent
          </p>
        </div>

        {/* Search and Filters */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search target, ID, identity..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="bg-slate-900 border border-slate-700/80 rounded px-2.5 py-1 pl-8 text-xs font-mono text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-soc-accent w-48 sm:w-60"
            />
          </div>

          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
            className="bg-slate-900 border border-slate-700/80 rounded px-2.5 py-1 text-xs font-mono text-slate-300 focus:outline-none focus:border-soc-accent"
          >
            <option value="ALL">Severity: All</option>
            <option value="CRITICAL">Critical</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-slate-900 border border-slate-700/80 rounded px-2.5 py-1 text-xs font-mono text-slate-300 focus:outline-none focus:border-soc-accent"
          >
            <option value="ALL">Status: All</option>
            <option value="OPEN">Open</option>
            <option value="UNDER_INVESTIGATION">Under Investigation</option>
            <option value="ESCALATED">Escalated</option>
            <option value="CONFIRMED_ATTACK">Confirmed Attack</option>
            <option value="FALSE_POSITIVE">False Positive</option>
            <option value="RESOLVED">Resolved</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs font-mono">
          <thead>
            <tr className="border-b border-soc-border bg-slate-950/60 text-2xs uppercase tracking-wider text-slate-400 font-semibold">
              <th className="py-2.5 px-3">
                <button onClick={() => handleSort('severity')} className="flex items-center gap-1 hover:text-slate-200">
                  Severity <ArrowUpDown className="w-2.5 h-2.5" />
                </button>
              </th>
              <th className="py-2.5 px-3">
                <button onClick={() => handleSort('id')} className="flex items-center gap-1 hover:text-slate-200">
                  Incident ID <ArrowUpDown className="w-2.5 h-2.5" />
                </button>
              </th>
              <th className="py-2.5 px-3">
                <button onClick={() => handleSort('createdAt')} className="flex items-center gap-1 hover:text-slate-200">
                  Time <ArrowUpDown className="w-2.5 h-2.5" />
                </button>
              </th>
              <th className="py-2.5 px-3">Target Employee</th>
              <th className="py-2.5 px-3">Department</th>
              <th className="py-2.5 px-3">Claimed Identity</th>
              <th className="py-2.5 px-3">
                <button onClick={() => handleSort('riskScore')} className="flex items-center gap-1 hover:text-slate-200">
                  Risk <ArrowUpDown className="w-2.5 h-2.5" />
                </button>
              </th>
              <th className="py-2.5 px-3">Threat Type</th>
              <th className="py-2.5 px-3">Status</th>
              <th className="py-2.5 px-3">Assigned Analyst</th>
              <th className="py-2.5 px-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-soc-border/60">
            {filteredIncidents.length === 0 ? (
              <tr>
                <td colSpan={11} className="py-12 text-center text-slate-500 font-mono">
                  No security incidents match the selected filter criteria.
                </td>
              </tr>
            ) : (
              filteredIncidents.map((incident) => {
                const statusMeta = formatStatus(incident.status);
                const riskColor = getRiskColor(incident.riskScore);
                const riskBar = getRiskBarColor(incident.riskScore);

                return (
                  <tr
                    key={incident.id}
                    onClick={() => navigate(`/investigations/${incident.id}`)}
                    className="hover:bg-slate-800/40 cursor-pointer transition-colors duration-100 group"
                  >
                    <td className="py-2.5 px-3">
                      <SeverityTag severity={incident.severity} size="xs" />
                    </td>

                    <td className="py-2.5 px-3 font-semibold text-slate-200 group-hover:text-soc-accent transition-colors">
                      {incident.id}
                    </td>

                    <td className="py-2.5 px-3 text-2xs text-slate-400 whitespace-nowrap">
                      {incident.createdAt ? incident.createdAt.split(' ')[1] : 'N/A'}
                    </td>

                    <td className="py-2.5 px-3">
                      <div className="font-medium text-slate-200">{incident.target?.name}</div>
                      <div className="text-2xs text-slate-500">{incident.target?.role}</div>
                    </td>

                    <td className="py-2.5 px-3 text-slate-300">
                      {incident.target?.department || 'N/A'}
                    </td>

                    <td className="py-2.5 px-3">
                      <div className="text-red-300 font-semibold flex items-center gap-1.5">
                        {incident.claimedIdentity?.name}
                        {incident.claimedIdentity?.isProtected && (
                          <span className="text-[9px] px-1 py-0.2 rounded bg-red-950/80 text-red-400 border border-red-800">VIP</span>
                        )}
                      </div>
                      <div className="text-2xs text-slate-500">{incident.claimedIdentity?.role}</div>
                    </td>

                    <td className="py-2.5 px-3">
                      <div className="flex items-center gap-2">
                        <div className="w-12 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                          <div className={`h-full ${riskBar}`} style={{ width: `${incident.riskScore}%` }} />
                        </div>
                        <span className={`font-bold ${riskColor}`}>{incident.riskScore}</span>
                      </div>
                    </td>

                    <td className="py-2.5 px-3 text-slate-300">
                      <span className="truncate max-w-[160px] inline-block" title={incident.attackType}>
                        {incident.attackType}
                      </span>
                    </td>

                    <td className="py-2.5 px-3">
                      <span className={`px-2 py-0.5 rounded text-2xs font-semibold ${statusMeta.badge}`}>
                        {statusMeta.label}
                      </span>
                    </td>

                    <td className="py-2.5 px-3 text-slate-400 text-2xs">
                      {incident.assignedAnalyst || 'Unassigned'}
                    </td>

                    <td className="py-2.5 px-3 text-right">
                      <Button
                        size="xs"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/investigations/${incident.id}`);
                        }}
                        className="group-hover:text-soc-accent"
                      >
                        Investigate <ChevronRight className="w-3.5 h-3.5" />
                      </Button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
