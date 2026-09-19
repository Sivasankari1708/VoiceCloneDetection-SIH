// src/components/dashboard/ActiveThreatsTable.jsx
import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { SeverityTag } from '../common/SeverityTag';
import { formatStatus } from '../../utils/formatters';
import { Search, Filter, ArrowUpDown, ChevronRight, ShieldAlert, ArrowRight } from 'lucide-react';
import { Button } from '../common/Button';

export function ActiveThreatsTable({ incidents, title = "Active Security Threats", isFullPage = false }) {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [severityFilter, setSeverityFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [sortField, setSortField] = useState('createdAt');
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
    <div className="bg-white border border-slate-200/90 rounded-xl shadow-xs overflow-hidden flex flex-col">
      {/* Header & Controls */}
      <div className="p-4 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-3 bg-slate-50/40">
        <div>
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-900 flex items-center gap-2">
            <span>{title}</span>
            <span className="text-2xs font-semibold text-slate-400">({filteredIncidents.length} Records)</span>
          </h2>
          <p className="text-2xs text-slate-500 mt-0.5">
            Intercepted voice impersonation calls requiring operational oversight and response
          </p>
        </div>

        {/* Search and Filters */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search target, ID, identity..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 pl-8 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 w-48 sm:w-60 shadow-2xs"
            />
          </div>

          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
            className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 focus:outline-none focus:border-blue-500 shadow-2xs"
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
            className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 focus:outline-none focus:border-blue-500 shadow-2xs"
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
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/70 text-[11px] uppercase tracking-wider text-slate-500 font-bold">
              <th className="py-3 px-3.5">
                <button onClick={() => handleSort('severity')} className="flex items-center gap-1 hover:text-slate-900 cursor-pointer">
                  Severity <ArrowUpDown className="w-2.5 h-2.5" />
                </button>
              </th>
              <th className="py-3 px-3.5">
                <button onClick={() => handleSort('id')} className="flex items-center gap-1 hover:text-slate-900 cursor-pointer">
                  Incident ID <ArrowUpDown className="w-2.5 h-2.5" />
                </button>
              </th>
              <th className="py-3 px-3.5">
                <button onClick={() => handleSort('createdAt')} className="flex items-center gap-1 hover:text-slate-900 cursor-pointer">
                  Time <ArrowUpDown className="w-2.5 h-2.5" />
                </button>
              </th>
              <th className="py-3 px-3.5">Target Employee</th>
              <th className="py-3 px-3.5">Department</th>
              <th className="py-3 px-3.5">Claimed Identity</th>
              <th className="py-3 px-3.5">Exposure Scope</th>
              <th className="py-3 px-3.5">Threat Type</th>
              <th className="py-3 px-3.5">Status</th>
              <th className="py-3 px-3.5">Assigned Analyst</th>
              <th className="py-3 px-3.5 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-700">
            {filteredIncidents.length === 0 ? (
              <tr>
                <td colSpan={11} className="py-12 text-center text-slate-400">
                  No security incidents match the selected filter criteria.
                </td>
              </tr>
            ) : (
              filteredIncidents.map((incident) => {
                const statusMeta = formatStatus(incident.status);
                const isFinancial = 
                  incident.attackType?.toLowerCase().includes('wire') || 
                  incident.attackType?.toLowerCase().includes('deposit') || 
                  incident.attackType?.toLowerCase().includes('financial') || 
                  incident.attackType?.toLowerCase().includes('payroll') ||
                  incident.title?.toLowerCase().includes('payment');

                return (
                  <tr
                    key={incident.id}
                    onClick={() => navigate(`/investigations/${incident.id}`)}
                    className="hover:bg-slate-50 cursor-pointer transition-colors duration-100 group"
                  >
                    <td className="py-3 px-3.5">
                      <SeverityTag severity={incident.severity} size="xs" />
                    </td>

                    <td className="py-3 px-3.5 font-bold text-slate-900 group-hover:text-blue-600 transition-colors">
                      {incident.id}
                    </td>

                    <td className="py-3 px-3.5 text-2xs text-slate-400 whitespace-nowrap font-mono">
                      {incident.createdAt ? incident.createdAt.split(' ')[1] : 'N/A'}
                    </td>

                    <td className="py-3 px-3.5">
                      <div className="font-semibold text-slate-900">{incident.target?.name}</div>
                      <div className="text-2xs text-slate-400">{incident.target?.role}</div>
                    </td>

                    <td className="py-3 px-3.5 text-slate-600">
                      {incident.target?.department || 'N/A'}
                    </td>

                    <td className="py-3 px-3.5">
                      <div className="text-slate-900 font-semibold flex items-center gap-1.5">
                        <span>{incident.claimedIdentity?.name}</span>
                        {incident.claimedIdentity?.isProtected && (
                          <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-50 text-amber-700 border border-amber-200 font-bold">VIP</span>
                        )}
                      </div>
                      <div className="text-2xs text-slate-400">{incident.claimedIdentity?.role}</div>
                    </td>

                    <td className="py-3 px-3.5">
                      <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold inline-block ${
                        isFinancial 
                          ? 'bg-amber-50 text-amber-800 border border-amber-200' 
                          : 'bg-blue-50 text-blue-800 border border-blue-200'
                      }`}>
                        {isFinancial ? 'Financial Pretext' : 'Credential Pretext'}
                      </span>
                    </td>

                    <td className="py-3 px-3.5 text-slate-600">
                      <span className="truncate max-w-[160px] inline-block font-medium" title={incident.attackType}>
                        {incident.attackType}
                      </span>
                    </td>

                    <td className="py-3 px-3.5">
                      <span className={`px-2 py-0.5 rounded-full text-2xs font-semibold ${statusMeta.badge}`}>
                        {statusMeta.label}
                      </span>
                    </td>

                    <td className="py-3 px-3.5 text-slate-500 text-2xs font-medium">
                      {incident.assignedAnalyst || 'Unassigned'}
                    </td>

                    <td className="py-3 px-3.5 text-right">
                      <Button
                        size="xs"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/investigations/${incident.id}`);
                        }}
                        className="group-hover:text-blue-600 font-semibold"
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
