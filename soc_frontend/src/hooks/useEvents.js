// src/hooks/useEvents.js
import { useState, useEffect } from 'react';
import { wsService } from '../services/websocket';
import { INITIAL_LIVE_EVENTS } from '../utils/mockData';

export function useEvents() {
  const [events, setEvents] = useState(INITIAL_LIVE_EVENTS);
  const [connectionStatus, setConnectionStatus] = useState('RECONNECTING');
  const [lastUpdate, setLastUpdate] = useState(new Date());

  useEffect(() => {
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
  }, []);

  const clearEvents = () => {
    setEvents([]);
  };

  return {
    events,
    connectionStatus,
    lastUpdate,
    clearEvents
  };
}
