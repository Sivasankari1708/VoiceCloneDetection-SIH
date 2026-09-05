// src/pages/Reports.jsx
import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { Card } from '../components/common/Card';
import { Button } from '../components/common/Button';
import { FileText, Download, Filter, Calendar, CheckCircle2, Shield } from 'lucide-react';

export function Reports() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [downloadSuccess, setDownloadSuccess] = useState('');

  useEffect(() => {
    async function load() {
      const data = await api.getReports();
      setReports(data);
      setLoading(false);
    }
    load();
  }, []);

  const filtered = reports.filter((r) => {
    return typeFilter === 'ALL' || r.type.includes(typeFilter);
  });

  const handleExport = (report) => {
    // Generate clean downloadable summary report in-browser
    const content = `=====================================================
VOICESHIELD ENTERPRISE SOC - SECURITY DOSSIER
=====================================================
Title: ${report.title}
Report ID: ${report.id}
Type: ${report.type}
Period: ${report.period}
Generated: ${report.generatedAt}
Author: ${report.author}

EXECUTIVE SUMMARY:
${report.summary}

KEY TELEMETRY METRICS:
- Analyzed Inbound Audio: ${report.stats.analyzed}
- Critical Incidents: ${report.stats.critical}
- High-Risk Alerts: ${report.stats.high}
- Confirmed Neutralized Attacks: ${report.stats.confirmedAttacks}
- False Positives Cleared: ${report.stats.falsePositives}

COMPLIANCE NOTICE:
Zero audio payloads are preserved in this dossier in accordance
with enterprise voice data privacy protocols.
=====================================================`;

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${report.id}_dossier.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    setDownloadSuccess(`Exported ${report.id} successfully.`);
    setTimeout(() => setDownloadSuccess(''), 3000);
  };

  return (
    <div className="space-y-4 font-mono">
      {/* Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-soc-border">
        <div>
          <h2 className="text-sm font-bold tracking-wider text-slate-100 uppercase flex items-center gap-2">
            <FileText className="w-4 h-4 text-soc-accent" />
            <span>Voice Security Intelligence & Compliance Reports</span>
          </h2>
          <p className="text-2xs text-slate-500 mt-0.5">
            Automated compliance summaries, threat trend analyses, and forensic incident dossiers
          </p>
        </div>
      </div>

      {downloadSuccess && (
        <div className="p-3 bg-emerald-950/80 border border-emerald-700 text-emerald-200 text-xs rounded-md flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{downloadSuccess}</span>
        </div>
      )}

      {/* Filter Row */}
      <div className="p-3 bg-soc-card border border-soc-border rounded-md flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <label className="text-2xs text-slate-400 uppercase font-semibold">Report Type:</label>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="bg-slate-900 border border-slate-700/80 rounded px-2.5 py-1 text-xs text-slate-300 focus:outline-none focus:border-soc-accent"
          >
            <option value="ALL">All Report Types</option>
            <option value="Weekly">Weekly Voice Security Reports</option>
            <option value="Daily">Daily Security Summaries</option>
            <option value="Incident">Incident Forensic Reports</option>
            <option value="Department">Department Risk Reports</option>
          </select>
        </div>

        <span className="text-2xs text-slate-500">
          Showing {filtered.length} generated reports
        </span>
      </div>

      {/* Reports Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filtered.map((report) => (
          <div key={report.id} className="p-4 bg-soc-card border border-soc-border rounded-md space-y-3 flex flex-col justify-between hover:border-slate-700 transition-colors">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-2xs font-bold text-soc-accent uppercase tracking-wider">{report.id}</span>
                <span className="text-2xs text-slate-500">{report.period}</span>
              </div>

              <h3 className="text-sm font-semibold text-slate-100 mt-1">
                {report.title}
              </h3>
              <p className="text-2xs text-slate-400 mt-1">
                Type: <span className="text-slate-300 font-medium">{report.type}</span>
              </p>

              <p className="text-xs text-slate-400 mt-2 bg-slate-950/50 p-2.5 rounded border border-slate-800/80 leading-relaxed">
                {report.summary}
              </p>

              {/* Stats pill row */}
              <div className="grid grid-cols-3 gap-2 mt-3 text-center text-2xs">
                <div className="p-2 bg-slate-900 rounded border border-slate-800">
                  <span className="text-slate-500 block">Analyzed</span>
                  <span className="font-bold text-slate-200">{report.stats.analyzed}</span>
                </div>
                <div className="p-2 bg-slate-900 rounded border border-slate-800">
                  <span className="text-slate-500 block">Critical</span>
                  <span className="font-bold text-red-400">{report.stats.critical}</span>
                </div>
                <div className="p-2 bg-slate-900 rounded border border-slate-800">
                  <span className="text-slate-500 block">Neutralized</span>
                  <span className="font-bold text-emerald-400">{report.stats.confirmedAttacks}</span>
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-soc-border flex items-center justify-between">
              <span className="text-2xs text-slate-500">Format: {report.format}</span>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => handleExport(report)}
                icon={Download}
              >
                Export Report
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
