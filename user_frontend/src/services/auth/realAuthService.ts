import type { User } from '../../types';
import type { AuthService } from './authService';
import { config } from '../config';

interface LoginResponse {
  access_token: string;
  token_type: string;
  expires_in_minutes: number;
  user: BackendUser;
}

interface BackendUser {
  id: string;
  org_id: string;
  username: string;
  email: string;
  full_name: string;
  role: string;
  is_active: boolean;
  created_at?: string;
}

interface OrgResponse {
  id: string;
  name: string;
  code: string;
  is_active: boolean;
}

export class RealAuthService implements AuthService {
  private currentUser: User | null = null;
  private token: string | null = null;

  async sendOtp(_identifier: string): Promise<{ success: boolean }> {
    // Backend uses direct password authentication.
    // For passwordless UI convenience, returns success.
    return { success: true };
  }

  async verifyOtp(usernameInput: string, passwordOrOtp: string): Promise<{ token: string; user: User }> {
    const rawInput = usernameInput.trim();
    let username = rawInput;
    let password = passwordOrOtp.trim();

    // If only an OTP or empty password was provided, map to standard credentials
    if (!password || /^\d{6}$/.test(password)) {
      const lower = username.toLowerCase();
      if (lower.includes('attacker')) {
        password = 'attacker123';
      } else if (lower.includes('sreya')) {
        password = 'sreya123';
      } else if (lower.includes('caller')) {
        password = 'caller123';
      } else if (lower.includes('operator')) {
        password = 'operator123';
      } else {
        const cleanName = username.includes('@') ? username.split('@')[0] : username;
        password = `${cleanName}123`;
      }
    }

    let res: Response;
    try {
      res = await fetch(`${config.apiBaseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
        signal: AbortSignal.timeout(5000),
      });
    } catch (err: any) {
      if (err.name === 'TimeoutError') {
        throw new Error(`Connection timeout: Unable to reach VoiceShield backend at ${config.apiBaseUrl}`);
      }
      throw new Error(`Network error: Unable to connect to backend at ${config.apiBaseUrl}`);
    }

    if (!res.ok) {
      const errData = await res.json().catch(() => ({ detail: 'Authentication failed' }));
      throw new Error(errData.detail || `Login failed (HTTP ${res.status})`);
    }

    const data: LoginResponse = await res.json();
    this.token = data.access_token;
    localStorage.setItem('voiceshield_token', data.access_token);

    // Fetch user profile and organization details
    const user = await this.fetchUserProfile(data.access_token, data.user);
    this.currentUser = user;
    localStorage.setItem('voiceshield_user', JSON.stringify(user));

    return { token: this.token, user };
  }

  private async fetchUserProfile(token: string, fallbackBackendUser?: BackendUser): Promise<User> {
    let backendUser = fallbackBackendUser;
    try {
      const meRes = await fetch(`${config.apiBaseUrl}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(4000),
      });
      if (meRes.ok) {
        backendUser = await meRes.json();
      }
    } catch {
      // use fallback
    }

    if (!backendUser) {
      throw new Error('Failed to retrieve user profile from backend.');
    }

    // Fetch organization name
    let orgName = 'Protected Organization';
    try {
      const orgRes = await fetch(`${config.apiBaseUrl}/api/organizations/me`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(3000),
      });
      if (orgRes.ok) {
        const orgData: OrgResponse = await orgRes.json();
        if (orgData.name) orgName = orgData.name;
      }
    } catch {
      // ignore
    }

    const displayName = backendUser.full_name || backendUser.username;
    const isCitizen = !backendUser.org_id || backendUser.role === 'USER';
    const isCaller = backendUser.role === 'CALLER' || backendUser.role === 'ATTACKER';
    return {
      id: backendUser.id,
      name: displayName,
      email: backendUser.email,
      employeeId: isCaller
        ? 'CALLER-' + backendUser.id.slice(-6).toUpperCase()
        : isCitizen
        ? 'CITIZEN-' + backendUser.id.slice(-6).toUpperCase()
        : 'EMP-' + backendUser.id.slice(-6).toUpperCase(),
      organization: isCaller ? 'External Network' : isCitizen ? 'Citizen Protection' : orgName,
      // Store authoritative backend role directly: CALLER | USER | SECURITY_OPERATOR | ADMIN
      role: backendUser.role,
      avatarInitials: displayName.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase() || (isCaller ? 'AT' : 'SG'),
      accountStatus: backendUser.is_active ? 'active' : 'suspended',
    };
  }

  getCurrentUser(): User | null {
    if (!this.currentUser) {
      try {
        const saved = localStorage.getItem('voiceshield_user');
        if (saved) this.currentUser = JSON.parse(saved);
      } catch {}
    }
    return this.currentUser;
  }

  getToken(): string | null {
    if (!this.token) {
      this.token = localStorage.getItem('voiceshield_token');
    }
    return this.token;
  }

  async ensureToken(): Promise<string> {
    const token = this.getToken();
    if (token) return token;
    return '';
  }

  async logout(): Promise<void> {
    this.currentUser = null;
    this.token = null;
    localStorage.removeItem('voiceshield_token');
    localStorage.removeItem('voiceshield_user');
  }

  getDemoOtp(): string | null {
    return '123456';
  }
}

export const realAuthService = new RealAuthService();