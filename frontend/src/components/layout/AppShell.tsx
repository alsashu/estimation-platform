import { Outlet } from 'react-router-dom';
import { useEffect } from 'react';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { ToastContainer } from '../ui';
import { useToastStore, useNotificationStore } from '../../store';
import { notificationsApi } from '../../services/api';
import { useTheme } from '../../hooks/useTheme';
import { useSyncQueue } from '../../hooks/useSyncQueue';

export function AppShell() {
  useTheme();
  useSyncQueue();
  const { toasts, removeToast } = useToastStore();
  const { setNotifications } = useNotificationStore();

  useEffect(() => {
    const fetchNotifs = async () => {
      try {
        const res = await notificationsApi.getAll();
        setNotifications(res.data, res.unread_count);
      } catch {}
    };
    fetchNotifs();
    const interval = setInterval(fetchNotifs, 60_000);
    return () => clearInterval(interval);
  }, [setNotifications]);

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
