import { Outlet } from 'react-router-dom';
import { useEffect } from 'react';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { ToastContainer } from '../ui';
import { useToastStore, useNotificationStore } from '../../store';
import { useQuery } from '@tanstack/react-query';
import { notificationsApi, hierarchyApi } from '../../services/api';
import { useTheme } from '../../hooks/useTheme';
import { useSyncQueue } from '../../hooks/useSyncQueue';
import { useAuthStore } from '../../store/authStore';
import { useHierarchyStore } from '../../store/hierarchyStore';

export function AppShell() {
  useTheme();
  useSyncQueue();
  const { toasts, removeToast } = useToastStore();
  const { setNotifications } = useNotificationStore();
  const { user } = useAuthStore();
  const { setContext, reset: resetContext } = useHierarchyStore();

  // Department / Program context for the header (permission-filtered by the API).
  // Admin pages invalidate ['hierarchy-context'] after changing master data.
  const { data: hierarchyContext } = useQuery({
    queryKey: ['hierarchy-context', user?.id],
    queryFn: hierarchyApi.context,
    enabled: !!user,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (!user) { resetContext(); return; }
    if (hierarchyContext) setContext(hierarchyContext);
  }, [user?.id, hierarchyContext]); // eslint-disable-line react-hooks/exhaustive-deps

  // Poll notifications
  useEffect(() => {
    if (!user) return;
    const fetchNotifs = async () => {
      try {
        const res = await notificationsApi.getAll();
        setNotifications(res.data, res.unread_count);
      } catch {}
    };
    fetchNotifs();
    const interval = setInterval(fetchNotifs, 30_000);
    return () => clearInterval(interval);
  }, [setNotifications, user]);

  return (
    <div className="flex h-screen bg-offwhite dark:bg-carbon-900 overflow-hidden font-sans">
      <Sidebar />
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <TopBar />
        <main className="flex-1 overflow-y-auto">
          <div className="p-6 max-w-[1600px] mx-auto animate-fade-in">
            <Outlet />
          </div>
        </main>
      </div>
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </div>
  );
}
