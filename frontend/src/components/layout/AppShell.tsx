import { Outlet } from 'react-router-dom';
import { useEffect } from 'react';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { ToastContainer } from '../ui';
import { useToastStore, useNotificationStore } from '../../store';
import { notificationsApi, projectsApi } from '../../services/api';
import { useTheme } from '../../hooks/useTheme';
import { useSyncQueue } from '../../hooks/useSyncQueue';
import { useAuthStore } from '../../store/authStore';
import { useProjectStore } from '../../store/projectStore';

export function AppShell() {
  useTheme();
  useSyncQueue();
  const { toasts, removeToast } = useToastStore();
  const { setNotifications } = useNotificationStore();
  const { user } = useAuthStore();
  const { setProjects, reset: resetProject } = useProjectStore();

  // Initialize project context when user changes
  useEffect(() => {
    if (!user) {
      resetProject();
      return;
    }
    projectsApi.list({ limit: 100 }).then(res => {
      setProjects(res.data, user.projectIds);
    }).catch(() => {
      // Graceful — don't block the app if projects fail to load
    });
  }, [user?.id]);

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
