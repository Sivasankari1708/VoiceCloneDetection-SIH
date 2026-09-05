// src/services/api.js
// VoiceShield Enterprise SOC REST API Client
// Handles both real backend connectivity and robust local mock data fallback

import {
  getStoredIncidents,
  saveStoredIncidents,
  getStoredAuditLogs,
  addAuditEntry,
  INITIAL_KPIS,
  INITIAL_SYSTEM_SERVICES,
  INITIAL_PROTECTED_IDENTITIES,
  INITIAL_REPORTS
} from '../utils/mockData';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

class ApiService {
  constructor() {
    this.baseUrl = BASE_URL;
    this.isBackendAvailable = false;
  }

  async fetchWithFallback(endpoint, fallbackFn, options = {}) {
    try {
      const res = await fetch(`${this.baseUrl}${endpoint}`, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...(options.headers || {})
        }
      });
      if (res.ok) {
        this.isBackendAvailable = true;
        return await res.json();
      }
      throw new Error(`Server returned ${res.status}`);
    } catch (err) {
      // Graceful fallback to mock data layer
      return fallbackFn();
    }
  }

  // Incidents API
  async getIncidents() {
    return this.fetchWithFallback('/api/v1/incidents', () => {
      return getStoredIncidents();
    });
  }

  async getIncidentById(id) {
    return this.fetchWithFallback(`/api/v1/incidents/${id}`, () => {
      const incidents = getStoredIncidents();
      return incidents.find(inc => inc.id === id) || null;
    });
  }

  async updateIncident(id, updates) {
    return this.fetchWithFallback(`/api/v1/incidents/${id}`, () => {
      const incidents = getStoredIncidents();
      const idx = incidents.findIndex(inc => inc.id === id);
      if (idx !== -1) {
        const oldState = incidents[idx].status;
        incidents[idx] = {
          ...incidents[idx],
          ...updates,
          lastUpdated: new Date().toISOString().replace('T', ' ').replace(/\.\d+Z$/, ' UTC')
        };
        saveStoredIncidents(incidents);
        
        if (updates.status && updates.status !== oldState) {
          addAuditEntry('STATUS_UPDATE', id, oldState, updates.status);
        }
        return incidents[idx];
      }
      return null;
    }, {
      method: 'PATCH',
      body: JSON.stringify(updates)
    });
  }

  async acknowledgeIncident(id, analyst = 'Sarah Chen (SOC Lead)') {
    return this.updateIncident(id, {
      status: 'UNDER_INVESTIGATION',
      assignedAnalyst: analyst
    });
  }

  async escalateIncident(id, notes = 'Escalated to CIRT & Executive Security Desk') {
    return this.fetchWithFallback(`/api/v1/incidents/${id}/escalate`, () => {
      const incidents = getStoredIncidents();
      const idx = incidents.findIndex(inc => inc.id === id);
      if (idx !== -1) {
        const oldState = incidents[idx].status;
        incidents[idx].status = 'ESCALATED';
        incidents[idx].lastUpdated = new Date().toISOString().replace('T', ' ').replace(/\.\d+Z$/, ' UTC');
        
        incidents[idx].timeline.push({
          id: `tl-${Date.now()}`,
          time: new Date().toISOString().replace('T', ' ').replace(/\.\d+Z$/, ' UTC'),
          event: `Incident escalated to CIRT: ${notes}`,
          severity: 'CRITICAL'
        });
        
        saveStoredIncidents(incidents);
        addAuditEntry('ESCALATE_TO_CIRT', id, oldState, 'ESCALATED (CIRT)');
        return incidents[idx];
      }
      return null;
    }, {
      method: 'POST',
      body: JSON.stringify({ notes })
    });
  }

  async resolveIncident(id, resolutionData) {
    return this.fetchWithFallback(`/api/v1/incidents/${id}/resolve`, () => {
      const incidents = getStoredIncidents();
      const idx = incidents.findIndex(inc => inc.id === id);
      if (idx !== -1) {
        const oldState = incidents[idx].status;
        const newStatus = resolutionData.verdict === 'FALSE_POSITIVE' ? 'FALSE_POSITIVE' : 'RESOLVED';
        
        incidents[idx].status = newStatus;
        incidents[idx].lastUpdated = new Date().toISOString().replace('T', ' ').replace(/\.\d+Z$/, ' UTC');
        incidents[idx].resolution = {
          verdict: resolutionData.verdict,
          reason: resolutionData.reason,
          resolvedBy: resolutionData.resolvedBy || 'Sarah Chen (SOC Lead)',
          resolvedAt: new Date().toISOString().replace('T', ' ').replace(/\.\d+Z$/, ' UTC')
        };
        
        incidents[idx].timeline.push({
          id: `tl-${Date.now()}`,
          time: new Date().toISOString().replace('T', ' ').replace(/\.\d+Z$/, ' UTC'),
          event: `Incident resolved as ${resolutionData.verdict}. Reason: ${resolutionData.reason}`,
          severity: resolutionData.verdict === 'CONFIRMED_ATTACK' ? 'CRITICAL' : 'LOW'
        });
        
        saveStoredIncidents(incidents);
        addAuditEntry('RESOLVE_INCIDENT', id, oldState, `${newStatus} (${resolutionData.verdict})`);
        return incidents[idx];
      }
      return null;
    }, {
      method: 'POST',
      body: JSON.stringify(resolutionData)
    });
  }

  // Protected Identities API
  async getProtectedIdentities() {
    return this.fetchWithFallback('/api/v1/protected-identities', () => {
      return INITIAL_PROTECTED_IDENTITIES;
    });
  }

  // System Health API
  async getSystemHealth() {
    return this.fetchWithFallback('/api/v1/health', () => {
      return {
        overallStatus: 'OPERATIONAL',
        activeSessions: 7,
        connectedClients: 3,
        lastCheck: new Date().toISOString(),
        services: INITIAL_SYSTEM_SERVICES
      };
    });
  }

  // Audit Logs API
  async getAuditLogs() {
    return this.fetchWithFallback('/api/v1/audit-logs', () => {
      return getStoredAuditLogs();
    });
  }

  // Reports API
  async getReports() {
    return this.fetchWithFallback('/api/v1/reports', () => {
      return INITIAL_REPORTS;
    });
  }

  // Analytics Metrics API
  async getAnalytics() {
    return this.fetchWithFallback('/api/v1/analytics', () => {
      return {
        kpis: INITIAL_KPIS,
        totalCallsAnalyzed: 4892,
        highRiskCalls: 124,
        criticalIncidents: 19,
        aiVoiceDetections: 32,
        identityMismatches: 41,
        confirmedAttacks: 11,
        falsePositives: 7,
        avgResponseTimeSec: 42,
        avgInvestigationTimeMin: 14.5,
        attackTypeDistribution: [
          { type: 'AI Voice Clone (Executive)', count: 18, percentage: 45 },
          { type: 'Direct Deposit / Payroll Diversion', count: 11, percentage: 27 },
          { type: 'Credential / OTP Harvesting', count: 8, percentage: 20 },
          { type: 'Unknown Voice Acoustic Anomaly', count: 3, percentage: 8 }
        ],
        departmentRisk: [
          { department: 'Finance & Treasury', incidentCount: 16, riskScore: 88 },
          { department: 'Executive Office', incidentCount: 9, riskScore: 82 },
          { department: 'IT & Infrastructure', incidentCount: 7, riskScore: 68 },
          { department: 'Human Resources', incidentCount: 5, riskScore: 54 },
          { department: 'Legal & Compliance', incidentCount: 3, riskScore: 35 }
        ],
        trendOverWeek: [
          { day: 'Mon', analyzed: 640, flagged: 18, critical: 2 },
          { day: 'Tue', analyzed: 710, flagged: 22, critical: 4 },
          { day: 'Wed', analyzed: 685, flagged: 19, critical: 3 },
          { day: 'Thu', analyzed: 750, flagged: 25, critical: 5 },
          { day: 'Fri', analyzed: 820, flagged: 31, critical: 6 },
          { day: 'Sat', analyzed: 310, flagged: 8, critical: 1 },
          { day: 'Sun', analyzed: 280, flagged: 6, critical: 1 }
        ]
      };
    });
  }
}

export const api = new ApiService();
