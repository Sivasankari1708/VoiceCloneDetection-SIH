import { useNavigate } from 'react-router-dom';
import { Shield, Eye, Users, Sliders, FlaskConical } from 'lucide-react';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';

interface PrivacySectionProps {
  icon: React.ElementType;
  title: string;
  children: React.ReactNode;
}

function PrivacySection({ icon: Icon, title, children }: PrivacySectionProps) {
  return (
    <Card>
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
          <Icon size={18} className="text-blue-600" />
        </div>
        <div>
          <div className="font-semibold text-slate-900 mb-2">{title}</div>
          <div className="text-sm text-slate-600 space-y-1">{children}</div>
        </div>
      </div>
    </Card>
  );
}

export default function PrivacyPage() {
  const navigate = useNavigate();

  return (
    <div className="max-w-2xl mx-auto p-4 md:p-6 space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Your Privacy</h1>
        <p className="text-slate-500 text-sm mt-1">How VoiceShield handles your information.</p>
      </div>

      <PrivacySection icon={Shield} title="What we protect">
        <p>VoiceShield analyzes the following during your calls:</p>
        <ul className="mt-2 space-y-1 list-none">
          <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 bg-blue-400 rounded-full flex-shrink-0" />Voice audio during active calls</li>
          <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 bg-blue-400 rounded-full flex-shrink-0" />Security analysis results and severity levels</li>
          <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 bg-blue-400 rounded-full flex-shrink-0" />Verification outcomes</li>
          <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 bg-blue-400 rounded-full flex-shrink-0" />Call metadata (duration, time, caller)</li>
        </ul>
      </PrivacySection>

      <PrivacySection icon={Eye} title="Why information is analyzed">
        <p>
          VoiceShield analyzes voice communications to help you identify suspicious or impersonation attempts in real time.
          The analysis happens automatically in the background so you can focus on the conversation without needing to understand the technical details.
        </p>
        <p className="mt-2">
          Analysis results are translated into simple, human-friendly security guidance — not raw technical outputs.
        </p>
      </PrivacySection>

      <PrivacySection icon={Users} title="Who can access your security information">
        <ul className="space-y-2">
          <li>
            <span className="font-medium text-slate-700">You</span>
            <span className="text-slate-500"> — through this application, at any time.</span>
          </li>
          <li>
            <span className="font-medium text-slate-700">Your organization's security team</span>
            <span className="text-slate-500"> — only when a HIGH or CRITICAL security event is detected, as required by your organization's security policy.</span>
          </li>
          <li>
            <span className="font-medium text-slate-700">No third parties</span>
            <span className="text-slate-500"> — your security information is not shared with external parties.</span>
          </li>
        </ul>
      </PrivacySection>

      <PrivacySection icon={Sliders} title="Your controls">
        <p>You can control how VoiceShield works for you:</p>
        <div className="mt-3 space-y-2">
          <Button variant="outline" size="sm" fullWidth onClick={() => navigate('/settings/security')}>
            Adjust security settings
          </Button>
          <Button variant="outline" size="sm" fullWidth onClick={() => {}}>
            Delete call history <span className="text-xs text-slate-400 ml-1">(coming soon)</span>
          </Button>
          <Button variant="outline" size="sm" fullWidth onClick={() => {}}>
            Export my data <span className="text-xs text-slate-400 ml-1">(coming soon)</span>
          </Button>
        </div>
      </PrivacySection>

      {/* Demo note */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
        <FlaskConical size={16} className="text-amber-600 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-amber-800">
          <strong>Demo Mode:</strong> In this demonstration, no real data is stored, transmitted, or sent to any server. All analysis is simulated locally.
        </div>
      </div>
    </div>
  );
}
