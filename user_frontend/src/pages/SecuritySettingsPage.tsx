import { useSettings } from '../context/AppContext';
import Card from '../components/ui/Card';

interface ToggleRowProps {
  label: string;
  description: string;
  checked: boolean;
  onChange: (val: boolean) => void;
}

function ToggleRow({ label, description, checked, onChange }: ToggleRowProps) {
  return (
    <div className="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0 border-b border-slate-100 last:border-0">
      <div className="flex-1">
        <div className="text-sm font-medium text-slate-900">{label}</div>
        <div className="text-xs text-slate-500 mt-0.5">{description}</div>
      </div>
      <button
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative w-11 h-6 rounded-full flex-shrink-0 transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${checked ? 'bg-blue-600' : 'bg-slate-300'}`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${checked ? 'translate-x-5' : ''}`}
        />
        <span className="sr-only">{checked ? 'Enabled' : 'Disabled'}</span>
      </button>
    </div>
  );
}

interface CheckboxRowProps {
  label: string;
  description: string;
  checked: boolean;
  onChange: (val: boolean) => void;
}

function CheckboxRow({ label, description, checked, onChange }: CheckboxRowProps) {
  return (
    <div className="flex items-start gap-3 py-3 first:pt-0 last:pb-0 border-b border-slate-100 last:border-0">
      <input
        type="checkbox"
        checked={checked}
        onChange={e => onChange(e.target.checked)}
        className="w-4 h-4 mt-0.5 accent-blue-600 flex-shrink-0"
      />
      <div>
        <div className="text-sm font-medium text-slate-900">{label}</div>
        <div className="text-xs text-slate-500 mt-0.5">{description}</div>
      </div>
    </div>
  );
}

export default function SecuritySettingsPage() {
  const { settings, updateSettings } = useSettings();

  return (
    <div className="max-w-2xl mx-auto p-4 md:p-6 space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Security Settings</h1>
        <p className="text-slate-500 text-sm mt-1">Control how VoiceShield protects your communications.</p>
      </div>

      {/* Call Protection */}
      <Card header={<span className="text-sm font-semibold text-slate-700">Call Protection</span>}>
        <ToggleRow
          label="Protect incoming calls"
          description="Monitor all incoming calls for suspicious activity."
          checked={settings.callProtectionEnabled}
          onChange={v => updateSettings({ callProtectionEnabled: v })}
        />
        <ToggleRow
          label="Show security warnings"
          description="Alert me when a call appears suspicious or risky."
          checked={settings.showSecurityWarnings}
          onChange={v => updateSettings({ showSecurityWarnings: v })}
        />
        <ToggleRow
          label="Suggest verification"
          description="Recommend caller verification when something seems unusual."
          checked={settings.suggestVerification}
          onChange={v => updateSettings({ suggestVerification: v })}
        />
      </Card>

      {/* Notifications */}
      <Card header={<span className="text-sm font-semibold text-slate-700">Notifications</span>}>
        <ToggleRow
          label="Security alerts"
          description="Notify me of critical security events and suspicious calls."
          checked={settings.notifyOnAlerts}
          onChange={v => updateSettings({ notifyOnAlerts: v })}
        />
        <ToggleRow
          label="Verification notifications"
          description="Notify me when caller verification is completed."
          checked={settings.notifyOnVerification}
          onChange={v => updateSettings({ notifyOnVerification: v })}
        />
        <ToggleRow
          label="Call protection notifications"
          description="Receive a summary notification after each protected call."
          checked={settings.notifyOnCallProtection}
          onChange={v => updateSettings({ notifyOnCallProtection: v })}
        />
      </Card>

      {/* Verification Methods */}
      <Card header={<span className="text-sm font-semibold text-slate-700">Verification Methods</span>}>
        <p className="text-xs text-slate-500 mb-3">Choose which methods you'll use to independently verify suspicious callers.</p>
        <CheckboxRow
          label="Call trusted number"
          description="Call the person back on their known official number to confirm identity."
          checked={settings.trustedVerificationMethods.includes('trusted_call')}
          onChange={v => updateSettings({
            trustedVerificationMethods: v
              ? [...settings.trustedVerificationMethods, 'trusted_call']
              : settings.trustedVerificationMethods.filter(m => m !== 'trusted_call')
          })}
        />
        <CheckboxRow
          label="Send verification request"
          description="Send a digital verification ping to their registered device."
          checked={settings.trustedVerificationMethods.includes('verification_request')}
          onChange={v => updateSettings({
            trustedVerificationMethods: v
              ? [...settings.trustedVerificationMethods, 'verification_request']
              : settings.trustedVerificationMethods.filter(m => m !== 'verification_request')
          })}
        />
        <CheckboxRow
          label="MFA / authenticator app"
          description="Use a shared authenticator code to verify the caller's identity."
          checked={settings.trustedVerificationMethods.includes('mfa')}
          onChange={v => updateSettings({
            trustedVerificationMethods: v
              ? [...settings.trustedVerificationMethods, 'mfa']
              : settings.trustedVerificationMethods.filter(m => m !== 'mfa')
          })}
        />
        <div className="pt-3 border-t border-slate-100 mt-2">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-slate-900">MFA enabled</div>
              <div className="text-xs text-slate-500">Authenticator app is configured</div>
            </div>
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${settings.mfaEnabled ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
              {settings.mfaEnabled ? 'Enabled' : 'Disabled'}
            </span>
          </div>
        </div>
      </Card>
    </div>
  );
}
