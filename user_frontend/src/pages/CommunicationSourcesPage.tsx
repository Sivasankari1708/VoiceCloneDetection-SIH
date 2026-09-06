import { Globe, Phone, Wifi, Monitor, Video } from 'lucide-react';
import Card from '../components/ui/Card';
import type { CommunicationSource } from '../types';

interface SourceConfig {
  id: CommunicationSource;
  name: string;
  description: string;
  icon: React.ElementType;
  available: boolean;
}

const SOURCES: SourceConfig[] = [
  {
    id: 'browser',
    name: 'Microphone',
    description: 'Live voice communication capture directly through your device microphone. Active and protected.',
    icon: Globe,
    available: true,
  },
  {
    id: 'phone',
    name: 'Phone Calls',
    description: 'Monitor incoming and outgoing phone calls for suspicious activity.',
    icon: Phone,
    available: false,
  },
  {
    id: 'voip',
    name: 'VoIP Calls',
    description: "Integrate with your organization's VoIP system for seamless call protection.",
    icon: Wifi,
    available: false,
  },
  {
    id: 'teams',
    name: 'Microsoft Teams',
    description: 'Real-time protection during Teams meetings and calls.',
    icon: Monitor,
    available: false,
  },
  {
    id: 'zoom',
    name: 'Zoom',
    description: 'Protect yourself during Zoom video and audio calls.',
    icon: Video,
    available: false,
  },
];

export default function CommunicationSourcesPage() {
  return (
    <div className="max-w-2xl mx-auto p-4 md:p-6 space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Communication Sources</h1>
        <p className="text-slate-500 text-sm mt-1">VoiceShield monitors your communications from these sources.</p>
      </div>

      <div className="space-y-3">
        {SOURCES.map(({ id, name, description, icon: Icon, available }) => (
          <Card key={id} className={available ? '' : 'opacity-70'}>
            <div className="flex items-start gap-4">
              <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0
                ${available ? 'bg-blue-50 text-blue-600' : 'bg-slate-100 text-slate-400'}`}>
                <Icon size={22} />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-semibold text-slate-900">{name}</span>
                  {available ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-semibold bg-green-100 text-green-700 border border-green-200 rounded-full">
                      <span className="w-1.5 h-1.5 bg-green-500 rounded-full" />
                      Active
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium bg-slate-100 text-slate-500 border border-slate-200 rounded-full">
                      Coming soon
                    </span>
                  )}
                </div>
                <p className="text-sm text-slate-500">{description}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <p className="text-xs text-slate-400 text-center pt-2">
        More communication sources will be available in future updates. VoiceShield is designed to protect all your voice channels.
      </p>
    </div>
  );
}
