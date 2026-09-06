import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut, Settings, Shield, Phone, KeyRound, Edit } from 'lucide-react';
import { useAuth, useCallHistory } from '../context/AppContext';
import { authService } from '../services/auth/authService';
import { MOCK_CALL_HISTORY } from '../mock-data';
import Card from '../components/ui/Card';

export default function ProfilePage() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { callHistory } = useCallHistory();
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3000);
  };

  const handleLogout = async () => {
    await authService.logout();
    logout();
    navigate('/login');
  };

  const totalCalls = callHistory.length + MOCK_CALL_HISTORY.length;

  if (!user) return null;

  return (
    <div className="max-w-2xl mx-auto p-4 md:p-6 space-y-5">
      <h1 className="text-2xl font-bold text-slate-900">Profile</h1>

      {/* Avatar + Info */}
      <Card padding="lg">
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5">
          <div className="w-20 h-20 rounded-full bg-blue-600 text-white text-2xl font-bold flex items-center justify-center flex-shrink-0">
            {user.avatarInitials}
          </div>
          <div className="flex-1 text-center sm:text-left">
            <div className="text-xl font-bold text-slate-900">{user.name}</div>
            <div className="text-slate-500 text-sm mt-0.5">{user.role}</div>
            <div className="text-slate-400 text-sm">{user.email}</div>
            <div className="mt-2 inline-flex items-center gap-1.5 bg-green-100 text-green-700 text-xs font-semibold px-2.5 py-1 rounded-full border border-green-200">
              <span className="w-1.5 h-1.5 bg-green-500 rounded-full" />
              Account active
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 mt-5 pt-5 border-t border-slate-100">
          <div>
            <div className="text-xs text-slate-400 mb-0.5">Protection Plan</div>
            <div className="text-sm font-medium text-slate-700">{user.organization || 'Personal Active Shield'}</div>
          </div>
          <div>
            <div className="text-xs text-slate-400 mb-0.5">Account ID</div>
            <div className="text-sm font-mono font-medium text-slate-700">{user.employeeId || 'ACC-001'}</div>
          </div>
        </div>
      </Card>

      {/* Security Info */}
      <Card header={<span className="text-sm font-semibold text-slate-700">Security Overview</span>}>
        <div className="grid grid-cols-3 gap-4 text-center py-2">
          <div>
            <div className="text-2xl font-bold text-slate-900">{totalCalls}</div>
            <div className="text-xs text-slate-400 mt-0.5">Calls analyzed</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-green-600">✓</div>
            <div className="text-xs text-slate-400 mt-0.5">Protected</div>
          </div>
          <div>
            <div className="text-sm font-semibold text-slate-700">Today</div>
            <div className="text-xs text-slate-400 mt-0.5">Last check</div>
          </div>
        </div>
      </Card>

      {/* Actions */}
      <Card header={<span className="text-sm font-semibold text-slate-700">Account Actions</span>}>
        <div className="space-y-1">
          <button onClick={() => showToast('Profile editing coming soon.')}
            className="w-full flex items-center gap-3 px-3 py-3 rounded-lg hover:bg-slate-50 text-sm text-slate-700 transition-colors">
            <Edit size={16} className="text-slate-400" />
            Edit profile
          </button>
          <button onClick={() => navigate('/settings/security')}
            className="w-full flex items-center gap-3 px-3 py-3 rounded-lg hover:bg-slate-50 text-sm text-slate-700 transition-colors">
            <Shield size={16} className="text-slate-400" />
            Manage verification methods
          </button>
          <button onClick={() => showToast('Password change coming soon.')}
            className="w-full flex items-center gap-3 px-3 py-3 rounded-lg hover:bg-slate-50 text-sm text-slate-700 transition-colors">
            <KeyRound size={16} className="text-slate-400" />
            Change password
          </button>
          <div className="pt-1 border-t border-slate-100 mt-1">
            <button onClick={handleLogout}
              className="w-full flex items-center gap-3 px-3 py-3 rounded-lg hover:bg-red-50 text-sm text-red-600 transition-colors font-medium">
              <LogOut size={16} />
              Sign out
            </button>
          </div>
        </div>
      </Card>

      {/* Other links */}
      <div className="flex flex-col gap-1">
        <button onClick={() => navigate('/settings/security')} className="text-sm text-blue-600 hover:underline flex items-center gap-1 px-1 py-1">
          <Settings size={13} /> Security Settings
        </button>
        <button onClick={() => navigate('/privacy')} className="text-sm text-blue-600 hover:underline flex items-center gap-1 px-1 py-1">
          <Shield size={13} /> Privacy Information
        </button>
        <button onClick={() => navigate('/settings/sources')} className="text-sm text-blue-600 hover:underline flex items-center gap-1 px-1 py-1">
          <Phone size={13} /> Communication Sources
        </button>
      </div>

      {/* Toast */}
      {toastMsg && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-sm px-4 py-2.5 rounded-xl shadow-lg z-50 animate-fade-in-up">
          {toastMsg}
        </div>
      )}
    </div>
  );
}
