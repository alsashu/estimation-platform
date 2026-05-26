import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, CheckCheck } from 'lucide-react';
import { notificationsApi } from '../../services/api';
import { Button, Card, Badge, EmptyState } from '../../components/ui';
import { useNotificationStore } from '../../store';
import { fmt, cn } from '../../utils/formatters';

const TYPE_STYLES = {
  info:    { bar: 'bg-carbon dark:bg-lgrayblue', badge: 'info' as const },
  success: { bar: 'bg-greenline', badge: 'success' as const },
  warning: { bar: 'bg-gold', badge: 'warning' as const },
  error:   { bar: 'bg-vibrant', badge: 'danger' as const },
};

export default function NotificationsPage() {
  const qc = useQueryClient();
  const { setNotifications } = useNotificationStore();

  const { data, isLoading } = useQuery({
    queryKey: ['notifications'],
    queryFn: async () => {
      const res = await notificationsApi.getAll();
      setNotifications(res.data, res.unread_count);
      return res;
    },
    retry: false,
  });

  const markAllMutation = useMutation({
    mutationFn: notificationsApi.markAllRead,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const markOneMutation = useMutation({
    mutationFn: (id: string) => notificationsApi.markRead(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const notifications = data?.data || [];
  const unread = data?.unread_count || 0;

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold text-carbon dark:text-white flex items-center gap-2">
            <Bell size={22} /> Notifications
          </h1>
          <p className="text-sm text-coolslate mt-0.5">{unread} unread</p>
        </div>
        {unread > 0 && (
          <Button variant="outline" size="sm" icon={<CheckCheck size={15} />} onClick={() => markAllMutation.mutate()} loading={markAllMutation.isPending}>
            Mark all read
          </Button>
        )}
      </div>

      {notifications.length === 0 ? (
        <Card>
          <EmptyState icon={<CheckCheck size={28} />} title="All caught up!" message="No notifications to show." />
        </Card>
      ) : (
        <div className="space-y-2">
          {notifications.map((n) => {
            const style = TYPE_STYLES[n.type] || TYPE_STYLES.info;
            return (
              <div key={n.id}
                className={cn('flex gap-0 bg-white dark:bg-carbon-700/60 rounded-xl border border-lgrayblue/30 dark:border-slate-700/50 overflow-hidden transition-all', !n.read && 'shadow-card')}
              >
                <div className={cn('w-1 flex-shrink-0', style.bar)} />
                <div className="flex items-start gap-4 px-5 py-4 flex-1">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <Badge variant={style.badge}>{n.type}</Badge>
                      {!n.read && <span className="w-2 h-2 rounded-full bg-vibrant" />}
                    </div>
                    <p className="text-sm font-semibold text-carbon dark:text-white">{n.title}</p>
                    <p className="text-sm text-coolslate mt-0.5">{n.message}</p>
                    <p className="text-xs text-coolslate/60 mt-1.5">{fmt.datetime(n.created_at)}</p>
                  </div>
                  {!n.read && (
                    <button onClick={() => markOneMutation.mutate(n.id)}
                      className="text-xs text-coolslate hover:text-carbon dark:hover:text-white transition-colors flex-shrink-0 mt-0.5">
                      Mark read
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
