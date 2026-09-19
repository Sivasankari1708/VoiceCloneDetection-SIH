import type { User } from '../../types';
import { config } from '../config';

// ─── Storage Keys ─────────────────────────────────────────────────────────────
export const STORAGE_KEYS = {
  SESSION_TOKEN: 'voiceshield_token',
  SESSION_USER: 'voiceshield_user',
  EMPLOYEE_TOKEN: 'voiceshield_employee_token',
  EMPLOYEE_USER: 'voiceshield_employee_user',
  ATTACKER_TOKEN: 'voiceshield_attacker_token',
  ATTACKER_USER: 'voiceshield_attacker_user',
  BRIDGE_EVENT: 'voiceshield_bridge_event',
  ACTIVE_CALL_META: 'voiceshield_active_call_meta',
  ACTIVE_DIALOGUES: 'voiceshield_active_dialogues',
} as const;

export function isAttackerRole(role?: string): boolean {
  if (!role) return false;
  const upper = role.toUpperCase();
  return upper === 'ATTACKER' || upper === 'CALLER';
}

export function isAttackerUser(user?: User | null): boolean {
  return isAttackerRole(user?.role);
}

export function isAttackerRoute(pathname?: string): boolean {
  const path = pathname || (typeof window !== 'undefined' ? window.location.pathname : '');
  return path.startsWith('/attacker') || path.startsWith('/sender');
}

/**
 * Saves authenticated session with strict tab isolation and persona-specific persistent storage.
 */
export function saveAuthSession(user: User, token: string): void {
  const isAttacker = isAttackerUser(user);
  const userJson = JSON.stringify(user);

  // 1. Tab-isolated session (prevents tabs on the same origin from overwriting each other)
  try {
    sessionStorage.setItem(STORAGE_KEYS.SESSION_TOKEN, token);
    sessionStorage.setItem(STORAGE_KEYS.SESSION_USER, userJson);
  } catch (err) {
    console.warn('[authStorage] Failed writing to sessionStorage:', err);
  }

  // 2. Persona-partitioned persistent storage in localStorage
  try {
    if (isAttacker) {
      localStorage.setItem(STORAGE_KEYS.ATTACKER_TOKEN, token);
      localStorage.setItem(STORAGE_KEYS.ATTACKER_USER, userJson);
    } else {
      localStorage.setItem(STORAGE_KEYS.EMPLOYEE_TOKEN, token);
      localStorage.setItem(STORAGE_KEYS.EMPLOYEE_USER, userJson);
    }

    // Secondary fallback for legacy single-tab utilities
    localStorage.setItem(STORAGE_KEYS.SESSION_TOKEN, token);
    localStorage.setItem(STORAGE_KEYS.SESSION_USER, userJson);
  } catch (err) {
    console.warn('[authStorage] Failed writing to localStorage:', err);
  }
}

/**
 * Recovers the correct session for the active tab and route, preventing persona collisions on refresh.
 */
export function getEffectiveAuthSession(routePath?: string): { user: User | null; token: string | null } {
  if (typeof window === 'undefined') {
    return { user: null, token: null };
  }

  const targetIsAttacker = isAttackerRoute(routePath);

  // Step 1: Check tab-scoped sessionStorage first
  try {
    const sUserStr = sessionStorage.getItem(STORAGE_KEYS.SESSION_USER);
    const sToken = sessionStorage.getItem(STORAGE_KEYS.SESSION_TOKEN);
    if (sUserStr && sToken) {
      const parsedUser = JSON.parse(sUserStr) as User;
      const userIsAttacker = isAttackerUser(parsedUser);

      // If the tab's session role matches the route affinity, use it directly
      if (userIsAttacker === targetIsAttacker) {
        return { user: parsedUser, token: sToken };
      }
    }
  } catch (err) {
    console.warn('[authStorage] Error reading sessionStorage:', err);
  }

  // Step 2: Recover from persona-partitioned localStorage
  try {
    if (targetIsAttacker) {
      const aUserStr = localStorage.getItem(STORAGE_KEYS.ATTACKER_USER);
      const aToken = localStorage.getItem(STORAGE_KEYS.ATTACKER_TOKEN);
      if (aUserStr && aToken) {
        const parsed = JSON.parse(aUserStr) as User;
        // Sync into this tab's sessionStorage for fast subsequent lookups
        sessionStorage.setItem(STORAGE_KEYS.SESSION_TOKEN, aToken);
        sessionStorage.setItem(STORAGE_KEYS.SESSION_USER, aUserStr);
        return { user: parsed, token: aToken };
      }
    } else {
      const eUserStr = localStorage.getItem(STORAGE_KEYS.EMPLOYEE_USER);
      const eToken = localStorage.getItem(STORAGE_KEYS.EMPLOYEE_TOKEN);
      if (eUserStr && eToken) {
        const parsed = JSON.parse(eUserStr) as User;
        // Sync into this tab's sessionStorage
        sessionStorage.setItem(STORAGE_KEYS.SESSION_TOKEN, eToken);
        sessionStorage.setItem(STORAGE_KEYS.SESSION_USER, eUserStr);
        return { user: parsed, token: eToken };
      }
    }
  } catch (err) {
    console.warn('[authStorage] Error reading partitioned localStorage:', err);
  }

  // Step 3: Check generic localStorage fallback if matching role
  try {
    const gUserStr = localStorage.getItem(STORAGE_KEYS.SESSION_USER);
    const gToken = localStorage.getItem(STORAGE_KEYS.SESSION_TOKEN);
    if (gUserStr && gToken) {
      const parsed = JSON.parse(gUserStr) as User;
      const userIsAttacker = isAttackerUser(parsed);
      if (userIsAttacker === targetIsAttacker) {
        sessionStorage.setItem(STORAGE_KEYS.SESSION_TOKEN, gToken);
        sessionStorage.setItem(STORAGE_KEYS.SESSION_USER, gUserStr);
        return { user: parsed, token: gToken };
      }
    }
  } catch (err) {
    console.warn('[authStorage] Error reading generic localStorage:', err);
  }

  return { user: null, token: null };
}

/**
 * Clears the session for the current tab and current persona.
 */
export function clearAuthSession(userOrRole?: User | string | null): void {
  if (typeof window === 'undefined') return;

  const isAttacker =
    typeof userOrRole === 'string'
      ? isAttackerRole(userOrRole)
      : userOrRole
      ? isAttackerUser(userOrRole)
      : isAttackerRoute();

  try {
    sessionStorage.removeItem(STORAGE_KEYS.SESSION_TOKEN);
    sessionStorage.removeItem(STORAGE_KEYS.SESSION_USER);

    if (isAttacker) {
      localStorage.removeItem(STORAGE_KEYS.ATTACKER_TOKEN);
      localStorage.removeItem(STORAGE_KEYS.ATTACKER_USER);
    } else {
      localStorage.removeItem(STORAGE_KEYS.EMPLOYEE_TOKEN);
      localStorage.removeItem(STORAGE_KEYS.EMPLOYEE_USER);
    }

    // Only remove global keys if no other persona is using them
    const activeAttacker = localStorage.getItem(STORAGE_KEYS.ATTACKER_USER);
    const activeEmployee = localStorage.getItem(STORAGE_KEYS.EMPLOYEE_USER);
    if (!activeAttacker && !activeEmployee) {
      localStorage.removeItem(STORAGE_KEYS.SESSION_TOKEN);
      localStorage.removeItem(STORAGE_KEYS.SESSION_USER);
    }
  } catch (err) {
    console.warn('[authStorage] Error clearing auth session:', err);
  }
}

/**
 * Pre-authenticates and provisions the Attacker persona credentials if not yet stored.
 * This guarantees that opening the Attacker Console in a new tab never redirects back to the user page.
 */
export async function ensureAttackerCredentials(): Promise<{ user: User; token: string }> {
  const existing = getEffectiveAuthSession('/attacker');
  if (existing.user && existing.token) {
    return { user: existing.user, token: existing.token };
  }

  try {
    const res = await fetch(`${config.apiBaseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'attacker@demo.com', password: 'attacker123' }),
      signal: AbortSignal.timeout(5000),
    });

    if (res.ok) {
      const data = await res.json();
      const backendUser = data.user;
      const user: User = {
        id: backendUser.id,
        name: backendUser.full_name || 'VoiceShield Attack Simulator',
        email: backendUser.email || 'attacker@demo.com',
        employeeId: 'CALLER-' + backendUser.id.slice(-6).toUpperCase(),
        organization: 'External Network',
        role: backendUser.role || 'CALLER',
        avatarInitials: 'AT',
        accountStatus: 'active',
      };

      // Store in partitioned storage
      localStorage.setItem(STORAGE_KEYS.ATTACKER_TOKEN, data.access_token);
      localStorage.setItem(STORAGE_KEYS.ATTACKER_USER, JSON.stringify(user));
      return { user, token: data.access_token };
    }
  } catch (err) {
    console.warn('[authStorage] ensureAttackerCredentials API call failed, using demo fallback:', err);
  }

  // Fallback demo attacker if backend is briefly unreachable
  const fallbackUser: User = {
    id: 'user_attacker_001',
    name: 'VoiceShield Attack Simulator',
    email: 'attacker@demo.com',
    employeeId: 'CALLER-ATTACKER',
    organization: 'External Network',
    role: 'CALLER',
    avatarInitials: 'AT',
    accountStatus: 'active',
  };
  const fallbackToken = 'demo-attacker-token-' + Date.now();
  localStorage.setItem(STORAGE_KEYS.ATTACKER_TOKEN, fallbackToken);
  localStorage.setItem(STORAGE_KEYS.ATTACKER_USER, JSON.stringify(fallbackUser));
  return { user: fallbackUser, token: fallbackToken };
}
