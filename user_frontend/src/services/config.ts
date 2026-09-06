// ─── VoiceShield — Centralized Environment Config ────────────────────────────
export const config = {
  /** Base URL for REST API calls, e.g. http://localhost:8000 */
  apiBaseUrl: (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '') || 'http://localhost:8000',

  /** Base URL for WebSocket connections, e.g. ws://localhost:8000 */
  wsBaseUrl: (import.meta.env.VITE_WS_BASE_URL as string | undefined)?.replace(/\/$/, '') || 'ws://localhost:8000',

  /** When true, uses built-in mock stream instead of real WebSocket backend */
  useMockStream: import.meta.env.VITE_USE_MOCK_STREAM === 'true',
} as const;
