// src/pages/Incidents.jsx
import React, { useState, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useIncidents } from '../hooks/useIncidents';
import { SeverityTag } from '../components/common/SeverityTag';
import { formatStatus, getRiskColor, getRiskBarColor } from '../utils/formatters';
import { Search, Filter, ArrowUpDown, ChevronRight, AlertTriangle, CheckCircle, ShieldAlert } from 'lucide-react';
import { Button } from '../components/common/Button';

export function Incidents() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialSeverity = searchParams.get('severity') || 'ALL';

  const { incidents, loading } = useIncidents();
  const [activeTab, setActiveTab] = useState(initialSeverity === 'CRITICAL' ? 'CRITICAL' : 'ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('ALL');
  const [attackTypeFilter, setAttackTypeFilter] = useState('ALL');
  const [sortField, setSortField] = useState('createdAt');
  const [sortAsc, setSortAsc] = useState(false);

  const tabs = [
    { id: 'ALL', label: 'All Incidents' },
    { id: 'OPEN', label: 'Open' },
    { id: 'CRITICAL', label: 'Critical' },
    { id: 'UNDER_INVESTIGATION', label: 'Under Investigation' },
    { id: 'CONFIRMED_ATTACK', label: 'Confirmed Attack' },
    { id: 'FALSE_POSITIVE', label: 'False Positive' },
    { id: 'RESOLVED', label: 'Resolved' },
  ];

  const filteredIncidents = useMemo(() => {
    return incidents.filter((inc) => {
      // Tab filter
      if (activeTab === 'CRITICAL' && inc.severity !== 'CRITICAL') return false;
      if (activeTab === 'OPEN' && inc.status !== 'OPEN') return false;
      if (activeTab === 'UNDER_INVESTIGATION' && inc.status !== 'UNDER_INVESTIGATION') return false;
      if (activeTab === 'CONFIRMED_ATTACK' && inc.status !== 'CONFIRMED_ATTACK' && inc.resolution?.verdict !== 'CONFIRMED_ATTACK') return false;
      if (activeTab === 'FALSE_POSITIVE' && inc.status !== 'FALSE_POSITIVE' && inc.resolution?.verdict !== 'FALSE_POSITIVE') return false;
      if (activeTab === 'RESOLVED' && inc.status !== 'RESOLVED' && inc.status !== 'FALSE_POSITIVE' && inc.status !== 'CONFIRMED_ATTACK') return false;

      // Department filter
      if (departmentFilter !== 'ALL' && inc.target?.department !== departmentFilter) return false;

      // Attack type filter
      if (attackTypeFilter !== 'ALL' && !inc.attackType.includes(attackTypeFilter)) return false;

      // Search term
      const matchesSearch =
        inc.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        inc.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        inc.target?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        inc.claimedIdentity?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        inc.assignedAnalyst?.toLowerCase().includes(searchTerm.toLowerCase());

      return matchesSearch;
    }).sort((a, b) => {
      let valA = a[sortField];
      let valB = b[sortField];
      if (sortField === 'createdAt' || sortField === 'lastUpdated') {
        valA = new Date(a[sortField]).getTime();
        valB = new Date(b[sortField]).getTime();
      }
      if (valA < valB) return sortAsc ? -1 : 1;
      if (valA > valB) return sortAsc ? 1 : -1;
      return 0;
    });
  }, [incidents, activeTab, departmentFilter, attackTypeFilter, searchTerm, sortField, sortAsc]);

  const handleSort = (field) => {
    if (sortField === field) setSortAsc(!sortAsc);
    else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  return (
    <div className="space-y-4 font-mono">
      {/* Page Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-soc-border">
        <div>
          <h2 className="text-sm font-bold tracking-wider text-slate-100 uppercase flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-soc-accent" />
            <span>Incident Management Center</span>
          </h2>
          <p className="text-2xs text-slate-500 mt-0.5">
            Structured workflow for triaging, analyzing, escalating, and resolving voice impersonation threats
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-soc-border overflow-x-auto">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          let count = 0;
          if (tab.id === 'ALL') count = incidents.length;
          else if (tab.id === 'CRITICAL') count = incidents.filter(i => i.severity === 'CRITICAL').length;
          else if (tab.id === 'OPEN') count = incidents.filter(i => i.status === 'OPEN').length;
          else if (tab.id === 'UNDER_INVESTIGATION') count = incidents.filter(i => i.status === 'UNDER_INVESTIGATION').length;
          else if (tab.id === 'CONFIRMED_ATTACK') count = incidents.filter(i => i.status === 'CONFIRMED_ATTACK' || i.resolution?.verdict === 'CONFIRMED_ATTACK').length;
          else if (tab.id === 'FALSE_POSITIVE') count = incidents.filter(i => i.status === 'FALSE_POSITIVE' || i.resolution?.verdict === 'FALSE_POSITIVE').length;
          else if (tab.id === 'RESOLVED') count = incidents.filter(i => i.status === 'RESOLVED').length;

          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-2 text-xs font-semibold whitespace-nowrap transition-colors border-b-2 -mb-[1px] flex items-center gap-2 ${
                isActive
                  ? 'text-soc-accent border-soc-accent bg-soc-accent/5'
                  : 'text-slate-400 border-transparent hover:text-slate-200 hover:border-slate-700'
              }`}
            >
              <span>{tab.label}</span>
              <span className={`px-1.5 py-0.2 rounded text-[10px] ${isActive ? 'bg-soc-accent/20 text-soc-accent' : 'bg-slate-900 text-slate-500'}`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Filter Row */}
      <div className="p-3 bg-soc-card border border-soc-border rounded-md flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 flex-1 min-w-[280px]">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search incidents by ID, target, claimed executive, analyst..."
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
            <option value="HR">HR</option>
            <option value="Legal">Legal</option>
            <option value="IT Operations">IT Operations</option>
          </select>

          <select
            value={attackTypeFilter}
            onChange={(e) => setAttackTypeFilter(e.target.value)}
            className="bg-slate-900 border border-slate-700/80 rounded px-2.5 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-soc-accent"
          >
            <option value="ALL">All Attack Types</option>
            <option value="AI Voice Clone">AI Voice Clone</option>
            <option value="Credential">Credential / OTP</option>
            <option value="Direct Deposit">Payroll Diversion</option>
            <option value="Distortion">Channel Anomaly</option>
          </select>
        </div>

        <span className="text-2xs text-slate-500">
          Showing {filteredIncidents.length} of {incidents.length} incidents
        </span>
      </div>

      {/* Incidents Table */}
      <div className="bg-soc-card border border-soc-border rounded-md overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs font-mono">
            <thead>
              <tr className="border-b border-soc-border bg-slate-950/70 text-2xs uppercase tracking-wider text-slate-400 font-semibold">
                <th className="py-2.5 px-3">
                  <button onClick={() => handleSort('severity')} className="flex items-center gap-1 hover:text-slate-200">
                    Severity <ArrowUpDown className="w-2.5 h-2.5" />
                  </button>
                </th>
                <th className="py-2.5 px-3">Incident ID</th>
                <th className="py-2.5 px-3">
                  <button onClick={() => handleSort('createdAt')} className="flex items-center gap-1 hover:text-slate-200">
                    Created <ArrowUpDown className="w-2.5 h-2.5" />
                  </button>
                </th>
                <th className="py-2.5 px-3">Target Employee</th>
                <th className="py-2.5 px-3">Department</th>
                <th className="py-2.5 px-3">Claimed Identity</th>
                <th className="py-2.5 px-3">Attack Type</th>
                <th className="py-2.5 px-3">
                  <button onClick={() => handleSort('riskScore')} className="flex items-center gap-1 hover:text-slate-200">
                    Risk Score <ArrowUpDown className="w-2.5 h-2.5" />
                  </button>
                </th>
                <th className="py-2.5 px-3">Analyst</th>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-3">Last Updated</th>
                <th className="py-2.5 px-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-soc-border/60">
              {filteredIncidents.length === 0 ? (
                <tr>
                  <td colSpan={12} className="py-12 text-center text-slate-500">
                    No incidents match the active filter criteria.
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
                        {incident.createdAt ? incident.createdAt.split(' ')[0] : 'N/A'}
                      </td>

                      <td className="py-2.5 px-3">
                        <div className="font-medium text-slate-200">{incident.target?.name}</div>
                        <div className="text-2xs text-slate-500">{incident.target?.role}</div>
                      </td>

                      <td className="py-2.5 px-3 text-slate-300">
                        {incident.target?.department || 'N/A'}
                      </td>

                      <td className="py-2.5 px-3">
                        <div className="text-red-300 font-semibold">{incident.claimedIdentity?.name}</div>
                        <div className="text-2xs text-slate-500">{incident.claimedIdentity?.role}</div>
                      </td>

                      <td className="py-2.5 px-3 text-slate-300">
                        <span className="truncate max-w-[150px] inline-block" title={incident.attackType}>
                          {incident.attackType}
                        </span>
                      </td>

                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-2">
                          <div className="w-12 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                            <div className={`h-full ${riskBar}`} style={{ width: `${incident.riskScore}%` }} />
                          </div>
                          <span className={`font-bold ${riskColor}`}>{incident.riskScore}</span>
                        </div>
                      </td>

                      <td className="py-2.5 px-3 text-slate-300 text-2xs">
                        {incident.assignedAnalyst || 'Unassigned'}
                      </td>

                      <td className="py-2.5 px-3">
                        <span className={`px-2 py-0.5 rounded text-2xs font-semibold ${statusMeta.badge}`}>
                          {statusMeta.label}
                        </span>
                      </td>

                      <td className="py-2.5 px-3 text-2xs text-slate-500 whitespace-nowrap">
                        {incident.lastUpdated ? incident.lastUpdated.split(' ')[1] : 'N/A'}
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
                          Details <ChevronRight className="w-3.5 h-3.5" />
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
    </div>
  );
}
