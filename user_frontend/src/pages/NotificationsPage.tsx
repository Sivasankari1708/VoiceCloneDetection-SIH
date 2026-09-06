import { useNavigate } from 'react-router-dom';
import { ShieldAlert, CheckCircle, Bell, Phone, Check, ExternalLink } from 'lucide-react';
import { useNotifications } from '../context/AppContext';
import Button from '../components/ui/Button';
import type { AppNotification, NotificationType } from '../types';

const TYPE_CONFIG: Record<NotificationType, { icon: React.ElementType; color: string }> = {
  security_alert: { icon: ShieldAlert, color: 'text-red-500' },
  verification_complete: { icon: CheckCircle, color: 'text-green-500' },
  security_reminder: { icon: Bell, color: 'text-amber-500' },
  call_summary: { icon: Phone, color: 'text-blue-500' },
  system: { icon: Bell, color: 'text-slate-400' },
};

function timeAgo(date: Date): string {
  const diff = Date.now() - date.getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'Just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function NotificationItem({ notif, onMarkRead }: { notif: AppNotification; onMarkRead: () => void }) {
  const navigate = useNavigate();
  const { icon: Icon, color } = TYPE_CONFIG[notif.type];

  return (
    <div
      className={`flex gap-3 p-4 rounded-xl border transition-all
        ${notif.read ? 'bg-white border-slate-200' : 'bg-blue-50 border-blue-200 border-l-4 border-l-blue-500'}`}
      onClick={onMarkRead}
    >
      <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${notif.read ? 'bg-slate-100' : 'bg-white shadow-sm'}`}>
        <Icon size={18} className={color} />
      </div>
      <div className="flex-1 min-w-0">
        <div className={`text-sm ${notif.read ? 'font-normal text-slate-700' : 'font-semibold text-slate-900'}`}>
          {notif.title}
        </div>
        <div className="text-xs text-slate-500 mt-0.5 leading-relaxed">{notif.message}</div>
        <div className="flex items-center gap-3 mt-2">
          <span className="text-xs text-slate-400">{timeAgo(notif.createdAt)}</span>
          {notif.actionLabel && notif.actionRoute && (
            <button
              onClick={e => { e.stopPropagation(); navigate(notif.actionRoute!); }}
              className="text-xs text-blue-600 hover:underline flex items-center gap-1"
            >
              {notif.actionLabel} <ExternalLink size={10} />
            </button>
          )}
        </div>
      </div>
      {!notif.read && (
        <div className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0 mt-1.5" aria-label="Unread" />
      )}
    </div>
  );
}

export default function NotificationsPage() {
  const { notifications, markRead, markAllRead, unreadCount } = useNotifications();

  return (
    <div className="max-w-2xl mx-auto p-4 md:p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Notifications</h1>
          {unreadCount > 0 && (
            <p className="text-sm text-slate-500 mt-1">{unreadCount} unread</p>
          )}
        </div>
        {unreadCount > 0 && (
          <Button variant="ghost" size="sm" onClick={markAllRead} icon={<Check size={14} />}>
            Mark all read
          </Button>
        )}
      </div>

      {notifications.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <Bell size={36} className="mx-auto mb-3 opacity-30" />
          <div className="font-medium">No notifications</div>
          <div className="text-sm mt-1">You're all caught up.</div>
        </div>
      ) : (
        <div className="space-y-2">
          {notifications.map(n => (
            <NotificationItem key={n.id} notif={n} onMarkRead={() => markRead(n.id)} />
          ))}
        </div>
      )}
    </div>
  );
}
