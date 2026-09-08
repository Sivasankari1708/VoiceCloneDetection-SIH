// ─── VoiceShield — Centralized Environment Config ────────────────────────────

function resolveApiUrl(): string {
  const envUrl = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '');

  if (typeof window !== 'undefined' && window.location?.hostname) {
    const currentHost = window.location.hostname;
    let port = '8000';

    if (envUrl) {
      try {
        const parsed = new URL(envUrl);
        if (parsed.port) port = parsed.port;
      } catch {}
    }

    // Automatically align with the current browser host (localhost or network IP)
    // to avoid stale IPs when switching networks or laptops
    return `http://${currentHost}:${port}`;
  }

  return envUrl || 'http://localhost:8000';
}

function resolveWsUrl(): string {
  const envUrl = (import.meta.env.VITE_WS_BASE_URL as string | undefined)?.replace(/\/$/, '');

  if (typeof window !== 'undefined' && window.location?.hostname) {
    const currentHost = window.location.hostname;
    let port = '8000';

    if (envUrl) {
      try {
        const parsed = new URL(envUrl.replace(/^ws/, 'http'));
        if (parsed.port) port = parsed.port;
      } catch {}
    }

    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${wsProtocol}//${currentHost}:${port}`;
  }

  return envUrl || 'ws://localhost:8000';
}

export const config = {
  /** Base URL for REST API calls */
  apiBaseUrl: resolveApiUrl(),

  /** Base URL for WebSocket connections */
  wsBaseUrl: resolveWsUrl(),

  /** When true, uses built-in mock stream instead of real WebSocket backend */
  useMockStream: import.meta.env.VITE_USE_MOCK_STREAM === 'true',
} as const;

