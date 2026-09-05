// src/hooks/useSystemHealth.js
import { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';

export function useSystemHealth() {
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchHealth = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.getSystemHealth();
      setHealth(data);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHealth();
    const interval = setInterval(fetchHealth, 15000); // Poll every 15s
    return () => clearInterval(interval);
  }, [fetchHealth]);

  return { health, loading, error, refetch: fetchHealth };
}
