import type { User } from '../../types';
import { MOCK_USER } from '../../mock-data';
import { config } from '../config';
import { RealAuthService } from './realAuthService';

// ─── Auth Service Interface ───────────────────────────────────────────────────
// UI components depend only on this interface — never on the implementation.
export interface AuthService {
  sendOtp(email: string): Promise<{ success: boolean }>;
  verifyOtp(email: string, otp: string): Promise<{ token: string; user: User }>;
  getCurrentUser(): User | null;
  getToken(): string | null;
  logout(): Promise<void>;
  /** Demo only — exposed for the DemoController panel */
  getDemoOtp?(): string | null;
}

// ─── Demo Auth Service (mock fallback) ───────────────────────────────────────
class DemoAuthServiceImpl implements AuthService {
  private demoOtp: string | null = null;
  private currentUser: User | null = null;
  private token: string | null = null;
  private otpExpiry: number | null = null;

  async sendOtp(email: string): Promise<{ success: boolean }> {
    await delay(800);
    this.demoOtp = generateOtp();
    this.otpExpiry = Date.now() + 5 * 60 * 1000;
    console.info(`[DEMO MODE] OTP for ${email}: ${this.demoOtp}`);
    return { success: true };
  }

  async verifyOtp(email: string, otp: string): Promise<{ token: string; user: User }> {
    await delay(600);
    if (!this.demoOtp || !this.otpExpiry) throw new Error('NO_OTP_SENT');
    if (Date.now() > this.otpExpiry) { this.demoOtp = null; throw new Error('OTP_EXPIRED'); }
    if (otp !== this.demoOtp) throw new Error('INCORRECT_OTP');
    this.currentUser = { ...MOCK_USER, email: email || MOCK_USER.email };
    this.token = `demo-token-${Date.now()}`;
    this.demoOtp = null;
    return { token: this.token, user: this.currentUser };
  }

  getCurrentUser(): User | null { return this.currentUser; }
  getToken(): string | null { return this.token; }

  async logout(): Promise<void> {
    await delay(300);
    this.currentUser = null;
    this.token = null;
    this.demoOtp = null;
  }

  getDemoOtp(): string | null { return this.demoOtp; }
}

function delay(ms: number): Promise<void> { return new Promise(r => setTimeout(r, ms)); }
function generateOtp(): string { return String(Math.floor(100000 + Math.random() * 900000)); }

// ─── Singleton Export ─────────────────────────────────────────────────────────
// VITE_USE_MOCK_STREAM=true  → demo OTP flow (no backend needed)
// VITE_USE_MOCK_STREAM=false → real backend login (employee / employee123)
export const authService: AuthService = config.useMockStream
  ? new DemoAuthServiceImpl()
  : new RealAuthService();