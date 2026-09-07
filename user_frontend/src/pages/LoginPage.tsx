import { useState, useEffect, useRef } from 'react';
import { Shield, Phone, KeyRound, RotateCcw, AlertCircle, ChevronRight, PhoneOutgoing } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { authService } from '../services/auth/authService';
import { useAuth } from '../context/AppContext';
import type { User } from '../types';
import Button from '../components/ui/Button';

type LoginStep = 'email' | 'otp';
type OtpError = null | 'incorrect' | 'expired' | 'generic';

export default function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();

  const [step, setStep] = useState<LoginStep>('email');
  const [identifier, setIdentifier] = useState('');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<OtpError>(null);
  const [demoOtp, setDemoOtp] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState(300);
  const [resendCooldown, setResendCooldown] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  const routeByRole = (user: User) => {
    if (user.role === 'CALLER' || user.role === 'ATTACKER') {
      navigate('/attacker');
    } else {
      navigate('/home');
    }
  };

  // Countdown timer
  useEffect(() => {
    if (step !== 'otp') return;
    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          return 0;
        }
        return prev - 1;
      });
      setResendCooldown((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [step]);

  const formatTime = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  const handleSendOtp = async () => {
    if (!identifier.trim()) return;
    setLoading(true);
    setError(null);
    try {
      await authService.sendOtp(identifier.trim());
      const generatedOtp = (authService as any).getDemoOtp?.() || '123456';
      setDemoOtp(generatedOtp);
      setOtp(generatedOtp);
      setStep('otp');
      setTimeLeft(300);
      setResendCooldown(30);
    } catch {
      setDemoOtp('123456');
      setOtp('123456');
      setStep('otp');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (otp.length !== 6) return;
    setLoading(true);
    setError(null);
    try {
      const { token, user } = await authService.verifyOtp(identifier || 'sreya@demo.com', otp);
      login(user, token);
      routeByRole(user);
    } catch (err) {
      console.error('[LoginPage] Login failed:', err);
      setError('incorrect');
    } finally {
      setLoading(false);
    }
  };

  const handleLoginAs = async (email: string, pass: string) => {
    setLoading(true);
    setError(null);
    try {
      const { token, user } = await authService.verifyOtp(email, pass);
      login(user, token);
      routeByRole(user);
    } catch (err) {
      console.error('[LoginPage] Login failed:', err);
      setError('generic');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (resendCooldown > 0) return;
    setLoading(true);
    try {
      await authService.sendOtp(identifier);
      const newOtp = (authService as any).getDemoOtp?.() || '123456';
      setDemoOtp(newOtp);
      setOtp(newOtp);
      setError(null);
      setTimeLeft(300);
      setResendCooldown(30);
    } catch {
      setDemoOtp('123456');
      setOtp('123456');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-slate-100 to-blue-50 flex flex-col items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        {/* Branding */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-2xl shadow-lg mb-3">
            <Shield size={28} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">VoiceShield</h1>
          <p className="text-slate-500 text-sm mt-1">Real-time protection against AI voice clones & scam calls</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xl p-6 space-y-5">
          {step === 'email' ? (
            <>
              <div>
                <h2 className="text-lg font-bold text-slate-900">Sign in to your Shield</h2>
                <p className="text-sm text-slate-500 mt-1">
                  Enter your mobile number or email to receive a secure login code.
                </p>
              </div>

              <div>
                <label htmlFor="identifier" className="block text-sm font-semibold text-slate-700 mb-1.5">
                  Mobile Number or Email
                </label>
                <div className="relative">
                  <Phone size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    id="identifier"
                    type="text"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSendOtp()}
                    placeholder="+91 98765 43210 or name@gmail.com"
                    className="w-full pl-9 pr-4 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    autoFocus
                  />
                </div>
              </div>

              <Button
                variant="primary"
                fullWidth
                loading={loading}
                onClick={handleSendOtp}
                disabled={!identifier.trim()}
                icon={<ChevronRight size={16} />}
              >
                Get Verification Code
              </Button>

              <div className="relative flex items-center justify-center pt-2">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-slate-200" />
                </div>
                <span className="relative bg-white px-3 text-xs text-slate-400 uppercase font-semibold">
                  Or One-Click Demo Personas
                </span>
              </div>

              {/* Two Authenticated Demo Personas */}
              <div className="space-y-2.5">
                <button
                  type="button"
                  onClick={() => handleLoginAs('sreya@demo.com', 'sreya123')}
                  disabled={loading}
                  className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold flex items-center justify-between shadow-sm transition-all cursor-pointer"
                >
                  <div className="flex items-center gap-2.5">
                    <Shield size={16} className="text-blue-200" />
                    <div className="text-left">
                      <div className="font-bold leading-none">Sign In as Sreya</div>
                      <div className="text-[11px] text-blue-100 font-normal mt-0.5">Target Individual (Protected Citizen)</div>
                    </div>
                  </div>
                  <ChevronRight size={16} className="text-blue-200" />
                </button>

                <button
                  type="button"
                  onClick={() => handleLoginAs('attacker@demo.com', 'attacker123')}
                  disabled={loading}
                  className="w-full py-2.5 px-4 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-sm font-semibold flex items-center justify-between shadow-sm transition-all cursor-pointer"
                >
                  <div className="flex items-center gap-2.5">
                    <PhoneOutgoing size={16} className="text-amber-400" />
                    <div className="text-left">
                      <div className="font-bold leading-none">Sign In as Attacker</div>
                      <div className="text-[11px] text-slate-300 font-normal mt-0.5">Caller Console (Voice Injection Terminal)</div>
                    </div>
                  </div>
                  <ChevronRight size={16} className="text-slate-400" />
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">Enter verification code</h2>
                  <p className="text-sm text-slate-500 mt-1">
                    Sent to <span className="font-semibold text-slate-800">{identifier}</span>
                  </p>
                </div>
                <button
                  onClick={() => setStep('email')}
                  className="text-xs text-blue-600 hover:underline font-semibold mt-1"
                >
                  Change
                </button>
              </div>

              {/* Demo OTP Banner */}
              {demoOtp && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-2 h-2 bg-amber-500 rounded-full animate-pulse" />
                    <span className="text-xs font-bold text-amber-700 uppercase tracking-wide">
                      Instant Verification Code
                    </span>
                  </div>
                  <p className="text-xs text-amber-600 mb-2">Use this demo code to sign in:</p>
                  <div
                    onClick={() => setOtp(demoOtp)}
                    className="text-2xl font-mono font-bold text-amber-900 tracking-widest text-center py-2 bg-amber-100 rounded-lg cursor-pointer hover:bg-amber-200/80 transition-colors"
                    title="Click to auto-fill"
                  >
                    {demoOtp}
                  </div>
                  <div className="text-[11px] text-amber-700 text-center mt-1">Click the code above to auto-fill</div>
                </div>
              )}

              {/* OTP input */}
              <div>
                <label htmlFor="otp" className="block text-sm font-semibold text-slate-700 mb-1.5">
                  6-digit security code
                </label>
                <div className="relative">
                  <KeyRound size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    id="otp"
                    type="text"
                    inputMode="numeric"
                    value={otp}
                    onChange={(e) => {
                      const v = e.target.value.replace(/\D/g, '').slice(0, 6);
                      setOtp(v);
                      setError(null);
                    }}
                    onKeyDown={(e) => e.key === 'Enter' && handleVerifyOtp()}
                    placeholder="000000"
                    maxLength={6}
                    className={`w-full pl-9 pr-4 py-2.5 border rounded-lg text-sm font-mono tracking-widest text-center focus:outline-none focus:ring-2 ${
                      error
                        ? 'border-red-400 focus:ring-red-400'
                        : 'border-slate-300 focus:ring-blue-500 focus:border-blue-500'
                    }`}
                    autoFocus
                  />
                </div>

                {/* Timer */}
                <div className="flex items-center justify-between mt-2">
                  <span className={`text-xs ${timeLeft < 60 ? 'text-red-500' : 'text-slate-400'}`}>
                    Expires in {formatTime(timeLeft)}
                  </span>
                  <button
                    onClick={handleResend}
                    disabled={resendCooldown > 0 || loading}
                    className="text-xs text-blue-600 hover:underline disabled:opacity-40 flex items-center gap-1 font-medium"
                  >
                    <RotateCcw size={11} />
                    {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend code'}
                  </button>
                </div>
              </div>

              {/* Error messages */}
              {error && (
                <div
                  className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5"
                  role="alert"
                >
                  <AlertCircle size={15} className="text-red-500 flex-shrink-0 mt-0.5" />
                  <span className="text-sm text-red-700">
                    {error === 'incorrect'
                      ? 'Incorrect code. Please check and try again.'
                      : error === 'expired'
                      ? 'This code has expired. Please request a new one.'
                      : 'Something went wrong. Please try again.'}
                  </span>
                </div>
              )}

              <Button
                variant="primary"
                fullWidth
                loading={loading}
                onClick={handleVerifyOtp}
                disabled={otp.length !== 6}
              >
                Verify & Open VoiceShield
              </Button>
            </>
          )}
        </div>

        {/* Footer note */}
        <p className="text-center text-xs text-slate-400 mt-4">
          <span className="inline-flex items-center gap-1">
            <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
            Designed for Citizens & Everyday Smartphone Users
          </span>
        </p>
      </div>
    </div>
  );
}
