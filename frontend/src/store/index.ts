import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Theme, ToastMessage, Notification } from '../types';

// ─── Theme Store ─────────────────────────────────────────────────────────────
interface ThemeStore {
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggleTheme: () => void;
}

export const useThemeStore = create<ThemeStore>()(
  persist(
    (set, get) => ({
      theme: (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') as Theme,
      setTheme: (theme) => {
        set({ theme });
        document.documentElement.classList.toggle('dark', theme === 'dark');
      },
      toggleTheme: () => {
        const next: Theme = get().theme === 'light' ? 'dark' : 'light';
        get().setTheme(next);
      },
    }),
    { name: 'ep-theme' }
  )
);

// ─── Sidebar Store ────────────────────────────────────────────────────────────
interface SidebarStore {
  collapsed: boolean;
  toggle: () => void;
  setCollapsed: (v: boolean) => void;
}

export const useSidebarStore = create<SidebarStore>()(
  persist(
    (set) => ({
      collapsed: false,
      toggle: () => set((s) => ({ collapsed: !s.collapsed })),
      setCollapsed: (collapsed) => set({ collapsed }),
    }),
    { name: 'ep-sidebar' }
  )
);

// ─── Toast Store ──────────────────────────────────────────────────────────────
interface ToastStore {
  toasts: ToastMessage[];
  addToast: (t: Omit<ToastMessage, 'id'>) => void;
  removeToast: (id: string) => void;
}

export const useToastStore = create<ToastStore>()((set) => ({
  toasts: [],
  addToast: (t) => {
    const id = Math.random().toString(36).slice(2);
    set((s) => ({ toasts: [...s.toasts, { ...t, id }] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })), 5000);
  },
  removeToast: (id) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),
}));

// ─── Notification Store ───────────────────────────────────────────────────────
interface NotificationStore {
  notifications: Notification[];
  unreadCount: number;
  setNotifications: (n: Notification[], count: number) => void;
}

export const useNotificationStore = create<NotificationStore>()((set) => ({
  notifications: [],
  unreadCount: 0,
  setNotifications: (notifications, unreadCount) => set({ notifications, unreadCount }),
}));

// ─── Sync Queue Store ─────────────────────────────────────────────────────────
export interface SyncQueueItem {
  id: string;
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  url: string;
  data?: unknown;
  timestamp: number;
}

interface SyncQueueStore {
  queue: SyncQueueItem[];
  enqueue: (item: Omit<SyncQueueItem, 'id' | 'timestamp'>) => void;
  dequeue: (id: string) => void;
  clearQueue: () => void;
}

export const useSyncQueueStore = create<SyncQueueStore>()(
  persist(
    (set) => ({
      queue: [],
      enqueue: (item) =>
        set((s) => ({
          queue: [
            ...s.queue,
            { ...item, id: Math.random().toString(36).slice(2), timestamp: Date.now() },
          ],
        })),
      dequeue: (id) => set((s) => ({ queue: s.queue.filter((i) => i.id !== id) })),
      clearQueue: () => set({ queue: [] }),
    }),
    { name: 'ep-sync-queue' }
  )
);

// ─── Connection Store ─────────────────────────────────────────────────────────
interface ConnectionStore {
  isOnline: boolean;
  toggle: () => void;
  setOnline: (v: boolean) => void;
}

export const useConnectionStore = create<ConnectionStore>()(
  persist(
    (set) => ({
      isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
      toggle: () => set((s) => ({ isOnline: !s.isOnline })),
      setOnline: (isOnline) => set({ isOnline }),
    }),
    { name: 'ep-connection' }
  )
);
