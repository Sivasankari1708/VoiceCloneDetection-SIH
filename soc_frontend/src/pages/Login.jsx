import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { Shield, Lock, User, Mail, ShieldAlert, KeyRound, UserCheck } from 'lucide-react';

export default function Login() {
  const navigate = useNavigate();

  // Mode: 'login' | 'register'
  const [mode, setMode] = useState('login');

  // Form State
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('SECURITY_OPERATOR');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!username || !password) {
      setError('Please provide both username and password.');
      return;
    }

    try {
      setLoading(true);
      const response = await api.login(username, password);
      console.log('[Login] Successful:', response);

      setSuccess('Authenticated successfully. Initializing SOC workspace...');
      setTimeout(() => {
        navigate('/overview');
      }, 500);
    } catch (err) {
      console.error('[Login] Error:', err);
      setError(err.message || 'Authentication failed. Please check credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!fullName || !username || !email || !password) {
      setError('All fields are required for operator registration.');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters in length.');
      return;
    }

    try {
      setLoading(true);
      const response = await api.register({
        username,
        email,
        password,
        full_name: fullName,
        role
      });
      console.log('[Register] Successful:', response);

      setSuccess(`Account '${username}' created. Redirecting to SOC Defense Console...`);
      setTimeout(() => {
        navigate('/overview');
      }, 600);
    } catch (err) {
      console.error('[Register] Error:', err);
      setError(err.message || 'Registration failed. Please check your inputs.');
    } finally {
      setLoading(false);
    }
  };

  // Quick-fill presets for hackathon demo
  const quickFill = (u, p) => {
    setMode('login');
    setUsername(u);
    setPassword(p);
    setError('');
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center px-4 py-8 relative font-mono">
      {/* Background glow effects */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-180px] left-[-150px] w-[500px] h-[500px] bg-cyan-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-[-180px] right-[-150px] w-[500px] h-[500px] bg-sky-500/10 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        {/* Brand Header */}
        <div className="text-center mb-6">
          <div className="mx-auto mb-4 w-14 h-14 rounded-2xl bg-cyan-500/10 border border-cyan-400/30 flex items-center justify-center text-cyan-400 shadow-[0_0_20px_rgba(6,182,212,0.15)]">
            <Shield className="w-7 h-7" />
          </div>

          <h1 className="text-2xl font-bold text-white tracking-wider uppercase">
            VoiceShield
          </h1>
          <p className="mt-1 text-xs text-slate-400">
            Enterprise Voice Clone Detection & Defense Platform
          </p>
        </div>

        {/* Auth Card */}
        <div className="bg-slate-900/95 border border-slate-800 rounded-2xl shadow-2xl p-6 sm:p-8 backdrop-blur-sm">
          {/* Mode Switcher Tabs */}
          <div className="grid grid-cols-2 p-1 bg-slate-950 rounded-xl border border-slate-800 mb-6">
            <button
              type="button"
              onClick={() => { setMode('login'); setError(''); }}
              className={`py-2 text-xs font-semibold rounded-lg transition ${
                mode === 'login'
                  ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-400/30 shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => { setMode('register'); setError(''); }}
              className={`py-2 text-xs font-semibold rounded-lg transition ${
                mode === 'register'
                  ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-400/30 shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Create Account
            </button>
          </div>

          {/* Feedback Messages */}
          {error && (
            <div className="mb-5 flex items-start gap-2.5 p-3 rounded-xl bg-red-950/40 border border-red-800/60 text-red-300 text-xs animate-shake">
              <ShieldAlert className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="mb-5 flex items-start gap-2.5 p-3 rounded-xl bg-emerald-950/40 border border-emerald-800/60 text-emerald-300 text-xs">
              <UserCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <span>{success}</span>
            </div>
          )}

          {/* LOGIN FORM */}
          {mode === 'login' && (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-2xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Username or Corporate Email
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="e.g. operator or soc@apexcorp.com"
                    autoComplete="username"
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-950 border border-slate-700/80 rounded-xl text-xs text-white placeholder-slate-600 outline-none focus:border-cyan-400 transition"
                  />
                </div>
              </div>

              <div>
                <label className="block text-2xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Password
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter security password"
                    autoComplete="current-password"
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-950 border border-slate-700/80 rounded-xl text-xs text-white placeholder-slate-600 outline-none focus:border-cyan-400 transition"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 rounded-xl font-bold text-xs uppercase tracking-wider text-slate-950 bg-cyan-400 hover:bg-cyan-300 disabled:opacity-50 transition shadow-lg shadow-cyan-500/20"
              >
                {loading ? 'Authenticating Operator...' : 'Sign In to Defense Console'}
              </button>
            </form>
          )}

          {/* REGISTER FORM */}
          {mode === 'register' && (
            <form onSubmit={handleRegister} className="space-y-3.5">
              <div>
                <label className="block text-2xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Full Name
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="e.g. Marcus Wright"
                    className="w-full pl-10 pr-4 py-2 bg-slate-950 border border-slate-700/80 rounded-xl text-xs text-white placeholder-slate-600 outline-none focus:border-cyan-400 transition"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-2xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                    Username
                  </label>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="marcus_sec"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700/80 rounded-xl text-xs text-white placeholder-slate-600 outline-none focus:border-cyan-400 transition"
                  />
                </div>
                <div>
                  <label className="block text-2xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                    Role
                  </label>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    className="w-full px-2.5 py-2 bg-slate-950 border border-slate-700/80 rounded-xl text-xs text-white outline-none focus:border-cyan-400 transition"
                  >
                    <option value="SECURITY_OPERATOR">SOC Operator</option>
                    <option value="ADMIN">SOC Administrator</option>
                    <option value="USER">Corporate User</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-2xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Corporate Email
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="marcus@apexcorp.com"
                    className="w-full pl-10 pr-4 py-2 bg-slate-950 border border-slate-700/80 rounded-xl text-xs text-white placeholder-slate-600 outline-none focus:border-cyan-400 transition"
                  />
                </div>
              </div>

              <div>
                <label className="block text-2xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Password (min. 6 characters)
                </label>
                <div className="relative">
                  <KeyRound className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full pl-10 pr-4 py-2 bg-slate-950 border border-slate-700/80 rounded-xl text-xs text-white placeholder-slate-600 outline-none focus:border-cyan-400 transition"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full mt-2 py-3 rounded-xl font-bold text-xs uppercase tracking-wider text-slate-950 bg-cyan-400 hover:bg-cyan-300 disabled:opacity-50 transition shadow-lg shadow-cyan-500/20"
              >
                {loading ? 'Creating Account...' : 'Register Operator Account'}
              </button>
            </form>
          )}

          {/* Quick Demo Login Presets */}
          <div className="mt-6 pt-5 border-t border-slate-800/80">
            <span className="text-[10px] text-slate-500 uppercase tracking-widest block font-bold mb-2.5 text-center">
              Quick-Fill Demo Credentials
            </span>

            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => quickFill('operator', 'operator123')}
                className="p-2 rounded-lg bg-slate-950 border border-slate-800 hover:border-cyan-400/40 text-left transition group"
              >
                <span className="block text-[11px] font-bold text-cyan-400 group-hover:underline">Operator</span>
                <span className="block text-[9px] text-slate-500">operator123</span>
              </button>

              <button
                type="button"
                onClick={() => quickFill('admin', 'admin123')}
                className="p-2 rounded-lg bg-slate-950 border border-slate-800 hover:border-cyan-400/40 text-left transition group"
              >
                <span className="block text-[11px] font-bold text-amber-400 group-hover:underline">Admin</span>
                <span className="block text-[9px] text-slate-500">admin123</span>
              </button>

              <button
                type="button"
                onClick={() => quickFill('employee', 'employee123')}
                className="p-2 rounded-lg bg-slate-950 border border-slate-800 hover:border-cyan-400/40 text-left transition group"
              >
                <span className="block text-[11px] font-bold text-emerald-400 group-hover:underline">Employee</span>
                <span className="block text-[9px] text-slate-500">employee123</span>
              </button>
            </div>
          </div>
        </div>

        {/* Footer info */}
        <p className="text-center text-[11px] text-slate-500 mt-5">
          Protected by VoiceShield Zero-Trust Biometric Security Engine
        </p>
      </div>
    </div>
  );
}