// src/hooks/useIncidents.js
import { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';

export function useIncidents() {
  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchIncidents = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.getIncidents();
      setIncidents(data);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchIncidents();
  }, [fetchIncidents]);

  const acknowledge = async (id, analyst) => {
    const updated = await api.acknowledgeIncident(id, analyst);
    if (updated) {
      setIncidents(prev => prev.map(inc => inc.id === id ? updated : inc));
    }
    return updated;
  };

  const escalate = async (id, notes) => {
    const updated = await api.escalateIncident(id, notes);
    if (updated) {
      setIncidents(prev => prev.map(inc => inc.id === id ? updated : inc));
    }
    return updated;
  };

  const resolve = async (id, resolutionData) => {
    const updated = await api.resolveIncident(id, resolutionData);
    if (updated) {
      setIncidents(prev => prev.map(inc => inc.id === id ? updated : inc));
    }
    return updated;
  };

  const update = async (id, updates) => {
    const updated = await api.updateIncident(id, updates);
    if (updated) {
      setIncidents(prev => prev.map(inc => inc.id === id ? updated : inc));
    }
    return updated;
  };

  return {
    incidents,
    loading,
    error,
    refetch: fetchIncidents,
    acknowledge,
    escalate,
    resolve,
    update
  };
}
