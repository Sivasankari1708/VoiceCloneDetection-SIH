import React, { createContext, useContext, useReducer, useCallback, type ReactNode } from 'react';
import type {
  User,
  CallSession,
  CallHistoryItem,
  AppNotification,
  SecuritySettings,
  ScenarioId,
} from '../types';

// ─── State Shape ──────────────────────────────────────────────
interface AppState {
  // Auth
  isAuthenticated: boolean;
  user: User | null;
  token: string | null;

  // Active call
  activeCall: CallSession | null;
  selectedScenarioId: ScenarioId | null;

  // History
  callHistory: CallHistoryItem[];

  // Notifications
  notifications: AppNotification[];

  // Settings
  settings: SecuritySettings;
}

// ─── Actions ──────────────────────────────────────────────────
type Action =
  | { type: 'LOGIN'; payload: { user: User; token: string } }
  | { type: 'LOGOUT' }
  | { type: 'SET_ACTIVE_CALL'; payload: CallSession }
  | { type: 'UPDATE_ACTIVE_CALL'; payload: Partial<CallSession> }
  | { type: 'END_ACTIVE_CALL' }
  | { type: 'SET_SCENARIO'; payload: ScenarioId }
  | { type: 'ADD_CALL_HISTORY'; payload: CallHistoryItem }
  | { type: 'MARK_NOTIFICATION_READ'; payload: string }
  | { type: 'MARK_ALL_READ' }
  | { type: 'ADD_NOTIFICATION'; payload: AppNotification }
  | { type: 'UPDATE_SETTINGS'; payload: Partial<SecuritySettings> };

// ─── Default State ────────────────────────────────────────────
const DEFAULT_SETTINGS: SecuritySettings = {
  callProtectionEnabled: true,
  showSecurityWarnings: true,
  suggestVerification: true,
  notifyOnAlerts: true,
  notifyOnVerification: true,
  notifyOnCallProtection: true,
  trustedVerificationMethods: ['trusted_call', 'mfa'],
  mfaEnabled: true,
};

function getSavedInitialState(): AppState {
  let user: User | null = null;
  let token: string | null = null;
  try {
    token = localStorage.getItem('voiceshield_token');
    const uStr = localStorage.getItem('voiceshield_user');
    if (uStr) user = JSON.parse(uStr);
  } catch {}
  return {
    isAuthenticated: Boolean(token && user),
    user: user,
    token,
    activeCall: null,
    selectedScenarioId: null,
    callHistory: [],
    notifications: [],
    settings: DEFAULT_SETTINGS,
  };
}

const INITIAL_STATE: AppState = getSavedInitialState();

// ─── Reducer ──────────────────────────────────────────────────
function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'LOGIN':
      try {
        localStorage.setItem('voiceshield_token', action.payload.token);
        localStorage.setItem('voiceshield_user', JSON.stringify(action.payload.user));
      } catch {}
      return {
        ...state,
        isAuthenticated: true,
        user: action.payload.user,
        token: action.payload.token,
      };

    case 'LOGOUT':
      try {
        localStorage.removeItem('voiceshield_token');
        localStorage.removeItem('voiceshield_user');
      } catch {}
      return {
        ...INITIAL_STATE,
        isAuthenticated: false,
        user: null,
        token: null,
        notifications: [],
      };

    case 'SET_ACTIVE_CALL':
      return { ...state, activeCall: action.payload };

    case 'UPDATE_ACTIVE_CALL':
      if (!state.activeCall) return state;
      return {
        ...state,
        activeCall: {
          ...state.activeCall,
          ...action.payload,
          security: action.payload.security
            ? { ...state.activeCall.security, ...action.payload.security }
            : state.activeCall.security,
          caller: action.payload.caller
            ? { ...state.activeCall.caller, ...action.payload.caller }
            : state.activeCall.caller,
          transcript: action.payload.transcript ?? state.activeCall.transcript,
        },
      };

    case 'END_ACTIVE_CALL':
      return { ...state, activeCall: null };

    case 'SET_SCENARIO':
      try {
        localStorage.setItem('voiceshield_selected_scenario', action.payload);
      } catch {}
      return { ...state, selectedScenarioId: action.payload };

    case 'ADD_CALL_HISTORY':
      return {
        ...state,
        callHistory: [action.payload, ...state.callHistory],
      };

    case 'MARK_NOTIFICATION_READ':
      return {
        ...state,
        notifications: state.notifications.map(n =>
          n.id === action.payload ? { ...n, read: true } : n
        ),
      };

    case 'MARK_ALL_READ':
      return {
        ...state,
        notifications: state.notifications.map(n => ({ ...n, read: true })),
      };

    case 'ADD_NOTIFICATION':
      return {
        ...state,
        notifications: [action.payload, ...state.notifications],
      };

    case 'UPDATE_SETTINGS':
      return {
        ...state,
        settings: { ...state.settings, ...action.payload },
      };

    default:
      return state;
  }
}

// ─── Context ──────────────────────────────────────────────────
interface AppContextValue {
  state: AppState;
  dispatch: React.Dispatch<Action>;
  unreadCount: number;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE);
  const unreadCount = state.notifications.filter(n => !n.read).length;

  return (
    <AppContext.Provider value={{ state, dispatch, unreadCount }}>
      {children}
    </AppContext.Provider>
  );
}

export function useAppContext(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useAppContext must be used within AppProvider');
  return ctx;
}

// ─── Convenience Hooks ────────────────────────────────────────
export function useAuth() {
  const { state, dispatch } = useAppContext();
  const login = useCallback((user: User, token: string) => {
    dispatch({ type: 'LOGIN', payload: { user, token } });
  }, [dispatch]);
  const logout = useCallback(() => {
    dispatch({ type: 'LOGOUT' });
  }, [dispatch]);
  return { isAuthenticated: state.isAuthenticated, user: state.user, login, logout };
}

export function useActiveCall() {
  const { state, dispatch } = useAppContext();
  const setActiveCall = useCallback((call: CallSession) => {
    dispatch({ type: 'SET_ACTIVE_CALL', payload: call });
  }, [dispatch]);
  const updateActiveCall = useCallback((updates: Partial<CallSession>) => {
    dispatch({ type: 'UPDATE_ACTIVE_CALL', payload: updates });
  }, [dispatch]);
  const endActiveCall = useCallback(() => {
    dispatch({ type: 'END_ACTIVE_CALL' });
  }, [dispatch]);
  return { activeCall: state.activeCall, setActiveCall, updateActiveCall, endActiveCall };
}

export function useCallHistory() {
  const { state, dispatch } = useAppContext();
  const addCallHistory = useCallback((item: CallHistoryItem) => {
    dispatch({ type: 'ADD_CALL_HISTORY', payload: item });
  }, [dispatch]);
  return { callHistory: state.callHistory, addCallHistory };
}

export function useNotifications() {
  const { state, dispatch, unreadCount } = useAppContext();
  const markRead = useCallback((id: string) => {
    dispatch({ type: 'MARK_NOTIFICATION_READ', payload: id });
  }, [dispatch]);
  const markAllRead = useCallback(() => {
    dispatch({ type: 'MARK_ALL_READ' });
  }, [dispatch]);
  return { notifications: state.notifications, unreadCount, markRead, markAllRead };
}

export function useSettings() {
  const { state, dispatch } = useAppContext();
  const updateSettings = useCallback((updates: Partial<SecuritySettings>) => {
    dispatch({ type: 'UPDATE_SETTINGS', payload: updates });
  }, [dispatch]);
  return { settings: state.settings, updateSettings };
}
