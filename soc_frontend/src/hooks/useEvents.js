// src/hooks/useEvents.js
import { useState, useEffect, useCallback } from 'react';
import { wsService } from '../services/websocket';
import { api } from '../services/api';

export function useEvents() {
  const [events, setEvents] = useState([]);
  const [connectionStatus, setConnectionStatus] = useState('CONNECTING');
  const [lastUpdate, setLastUpdate] = useState(new Date());
  const [loading, setLoading] = useState(true);

  // Load real telemetry history from backend database
  const loadInitialTelemetry = useCallback(async () => {
    try {
      setLoading(true);
      const [calls, incidents] = await Promise.allSettled([
        api.getCalls(),
        api.getIncidents()
      ]);

      const initialList = [];

      if (incidents.status === 'fulfilled' && Array.isArray(incidents.value)) {
        incidents.value.forEach(inc => {
          initialList.push({
            id: inc.id,
            timestamp: inc.createdAt || new Date().toISOString(),
            severity: inc.severity || 'CRITICAL',
            title: inc.title || `Incident flagged: ${inc.scenario}`,
            target: typeof inc.target === 'string' ? inc.target : (inc.target?.name || 'Executive Desk'),
            claimedIdentity: typeof inc.claimedIdentity === 'string' ? inc.claimedIdentity : (inc.claimedIdentity?.name || 'David Vance (CFO)'),
            riskScore: inc.riskScore ?? 85,
            syntheticProbability: inc.syntheticProbability ?? 0.88,
            speakerStatus: inc.speakerStatus ?? 'MISMATCH',
            intent: inc.intent ?? 'URGENT_FINANCIAL_ACTION',
            channel: inc.channel || 'SIP-Trunk-01',
            status: inc.status || 'OPEN'
          });
        });
      }

      if (calls.status === 'fulfilled' && Array.isArray(calls.value)) {
        calls.value.forEach(call => {
          const riskScore = Math.round(call.current_risk_score ?? 0);
          initialList.push({
            id: call.session_id,
            timestamp: call.start_time || new Date().toISOString(),
            severity: call.current_risk_level || (riskScore >= 70 ? 'HIGH' : riskScore >= 30 ? 'MEDIUM' : 'LOW'),
            title: `Call Session: ${call.caller_name || call.caller_number || 'External caller'} (Score: ${riskScore})`,
            target: call.caller_name || 'Inbound PBX Gateway',
            claimedIdentity: call.claimed_speaker_id || 'Unspecified Caller',
            riskScore,
            syntheticProbability: call.final_verdict === 'cloned' ? 0.94 : (riskScore > 50 ? 0.65 : 0.08),
            speakerStatus: call.final_verdict === 'imposter' ? 'MISMATCH' : (call.final_verdict === 'genuine' ? 'VERIFIED' : 'UNVERIFIED'),
            intent: call.final_verdict === 'cloned' ? 'SUSPICIOUS_TRANSFER' : 'NORMAL_COMMUNICATION',
            channel: 'VoIP Gateway',
            status: call.status || 'ENDED'
          });
        });
      }

      // Sort newest first
      initialList.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      setEvents(initialList.slice(0, 50));
      setLastUpdate(new Date());
    } catch (err) {
      console.warn('[useEvents] Error fetching initial telemetry from backend:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadInitialTelemetry();
    wsService.connect();

    const unsubStatus = wsService.subscribeStatus((status) => {
      setConnectionStatus(status);
    });

    const unsubEvents = wsService.subscribe((newEvent) => {
      setEvents((prev) => [newEvent, ...prev.slice(0, 49)]); // Keep last 50 events
      setLastUpdate(new Date());
    });

    return () => {
      unsubStatus();
      unsubEvents();
    };
  }, [loadInitialTelemetry]);

  const clearEvents = () => {
    setEvents([]);
  };

  return {
    events,
    connectionStatus,
    lastUpdate,
    loading,
    clearEvents,
    refetch: loadInitialTelemetry
  };
}
