import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { Shield, Lock, User, Mail, ShieldAlert, KeyRound, UserCheck, ShieldCheck } from 'lucide-react';

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
      setError('Please provide both operator identifier and password.');
      return;
    }

    try {
      setLoading(true);
      const response = await api.login(username, password);
      console.log('[Login] Successful:', response);

      setSuccess('Identity verified. Initializing Security Operations Console...');
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
      setError('All fields are required for operator provisioning.');
      return;
    }

    if (password.length < 6) {
      setError('Security policy requires password length of at least 6 characters.');
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

      setSuccess(`Operator '${username}' provisioned. Launching Security Operations Console...`);
      setTimeout(() => {
        navigate('/overview');
      }, 600);
    } catch (err) {
      console.error('[Register] Error:', err);
      setError(err.message || 'Provisioning failed. Please verify submitted credentials.');
    } finally {
      setLoading(false);
    }
  };

  // Quick-fill presets for demo
  const quickFill = (u, p) => {
    setMode('login');
    setUsername(u);
    setPassword(p);
    setError('');
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-blue-50/20 to-slate-100/70 flex items-center justify-center px-4 py-12 relative font-sans text-slate-800">
      <div className="relative w-full max-w-md">
        {/* Brand Header */}
        <div className="text-center mb-6">
          <div className="mx-auto mb-3.5 w-12 h-12 rounded-xl bg-blue-900 text-white flex items-center justify-center shadow-sm">
            <Shield className="w-6 h-6" />
          </div>

          <h1 className="text-xl font-bold text-slate-900 tracking-tight">
            VoiceShield Enterprise
          </h1>
          <p className="mt-1 text-xs text-slate-500 font-normal">
            Global Security Operations Center • Operator Gateway
          </p>
        </div>

        {/* Auth Card */}
        <div className="bg-white/95 border border-slate-200/90 rounded-2xl shadow-xl p-6 sm:p-8 backdrop-blur-sm">
          {/* Mode Switcher Tabs */}
          <div className="grid grid-cols-2 p-1 bg-slate-100/80 rounded-xl mb-6">
            <button
              type="button"
              onClick={() => { setMode('login'); setError(''); }}
              className={`py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                mode === 'login'
                  ? 'bg-white text-slate-900 shadow-xs border border-slate-200/60'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => { setMode('register'); setError(''); }}
              className={`py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                mode === 'register'
                  ? 'bg-white text-slate-900 shadow-xs border border-slate-200/60'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Provision Operator
            </button>
          </div>

          {/* Feedback Messages */}
          {error && (
            <div className="mb-5 flex items-start gap-2.5 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs">
              <ShieldAlert className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="mb-5 flex items-start gap-2.5 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs">
              <UserCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <span>{success}</span>
            </div>
          )}

          {/* LOGIN FORM */}
          {mode === 'login' && (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-2xs font-semibold text-slate-600 uppercase tracking-wider mb-1.5">
                  Operator ID or Corporate Email
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="e.g. operator or soc@apexcorp.com"
                    autoComplete="username"
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50/50 border border-slate-300 rounded-xl text-xs text-slate-900 placeholder-slate-400 outline-none focus:bg-white focus:border-blue-600 focus:ring-2 focus:ring-blue-500/15 transition"
                  />
                </div>
              </div>

              <div>
                <label className="block text-2xs font-semibold text-slate-600 uppercase tracking-wider mb-1.5">
                  Security Password
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter security password"
                    autoComplete="current-password"
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50/50 border border-slate-300 rounded-xl text-xs text-slate-900 placeholder-slate-400 outline-none focus:bg-white focus:border-blue-600 focus:ring-2 focus:ring-blue-500/15 transition"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 rounded-xl font-medium text-xs text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 transition shadow-xs hover:shadow cursor-pointer"
              >
                {loading ? 'Authenticating Operator...' : 'Sign In to Defense Console'}
              </button>
            </form>
          )}

          {/* REGISTER FORM */}
          {mode === 'register' && (
            <form onSubmit={handleRegister} className="space-y-3.5">
              <div>
                <label className="block text-2xs font-semibold text-slate-600 uppercase tracking-wider mb-1">
                  Full Name
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="e.g. Marcus Wright"
                    className="w-full pl-10 pr-4 py-2 bg-slate-50/50 border border-slate-300 rounded-xl text-xs text-slate-900 placeholder-slate-400 outline-none focus:bg-white focus:border-blue-600 transition"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-2xs font-semibold text-slate-600 uppercase tracking-wider mb-1">
                    Username
                  </label>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="marcus_sec"
                    className="w-full px-3 py-2 bg-slate-50/50 border border-slate-300 rounded-xl text-xs text-slate-900 placeholder-slate-400 outline-none focus:bg-white focus:border-blue-600 transition"
                  />
                </div>
                <div>
                  <label className="block text-2xs font-semibold text-slate-600 uppercase tracking-wider mb-1">
                    Role
                  </label>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    className="w-full px-2.5 py-2 bg-slate-50/50 border border-slate-300 rounded-xl text-xs text-slate-900 outline-none focus:bg-white focus:border-blue-600 transition"
                  >
                    <option value="SECURITY_OPERATOR">SOC Operator</option>
                    <option value="SOC_LEAD">SOC Lead</option>
                    <option value="ADMIN">Security Admin</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-2xs font-semibold text-slate-600 uppercase tracking-wider mb-1">
                  Corporate Email
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="operator@company.com"
                    className="w-full pl-10 pr-4 py-2 bg-slate-50/50 border border-slate-300 rounded-xl text-xs text-slate-900 placeholder-slate-400 outline-none focus:bg-white focus:border-blue-600 transition"
                  />
                </div>
              </div>

              <div>
                <label className="block text-2xs font-semibold text-slate-600 uppercase tracking-wider mb-1">
                  Security Password
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Min 6 characters"
                    className="w-full pl-10 pr-4 py-2 bg-slate-50/50 border border-slate-300 rounded-xl text-xs text-slate-900 placeholder-slate-400 outline-none focus:bg-white focus:border-blue-600 transition"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 rounded-xl font-medium text-xs text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 transition shadow-xs hover:shadow cursor-pointer"
              >
                {loading ? 'Registering Operator...' : 'Create Operator Account'}
              </button>
            </form>
          )}

          {/* Quick Preset Accounts */}
          <div className="mt-6 pt-5 border-t border-slate-200/80">
            <div className="flex items-center justify-between mb-2">
              <span className="text-2xs font-semibold text-slate-500 uppercase tracking-wider">
                Quick Access Credentials
              </span>
              <span className="text-2xs text-slate-400">One-click sign in</span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => quickFill('operator', 'operator123')}
                className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 hover:bg-slate-100 hover:border-slate-300 text-left transition cursor-pointer"
              >
                <span className="block text-xs font-semibold text-slate-800">Operator</span>
                <span className="block text-[11px] text-slate-500">operator / operator123</span>
              </button>

              <button
                type="button"
                onClick={() => quickFill('admin', 'admin123')}
                className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 hover:bg-slate-100 hover:border-slate-300 text-left transition cursor-pointer"
              >
                <span className="block text-xs font-semibold text-slate-800">Security Admin</span>
                <span className="block text-[11px] text-slate-500">admin / admin123</span>
              </button>
            </div>
          </div>
        </div>

        {/* Footer info */}
        <p className="text-center text-xs text-slate-500 mt-5">
          Zero-Audio Retention Architecture • SOC Telemetry Ingress Only
        </p>
      </div>
    </div>
  );
}