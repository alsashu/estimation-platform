import { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Bell, Sun, Moon, Search, ChevronRight, User, Settings, LogOut,
  Wifi, WifiOff, CheckCheck,
} from 'lucide-react';
import { useTheme } from '../../hooks/useTheme';
import { useOffline } from '../../hooks/useOffline';
import { useNotificationStore } from '../../store';
import { fmt, cn } from '../../utils/formatters';
import { Badge } from '../ui';

const BREADCRUMB_MAP: Record<string, string> = {
  '': 'Dashboard', 'estimate': 'Storypoint Estimation', 'parametric-estimation': 'Parametric Estimation', 'history': 'Historical Data',
  'analysis': 'Analytics', 'master': 'Master Data', 'story-points': 'Story Points',
  'effort': 'Effort Estimates', 'competency': 'Competency Levels',
  'docs': 'Documentation', 'settings': 'Settings', 'notifications': 'Notifications',
};

function useBreadcrumbs() {
  const location = useLocation();
  const parts = location.pathname.split('/').filter(Boolean);
  const crumbs = [{ label: 'Home', to: '/' }];
  let path = '';
  for (const part of parts) {
    path += `/${part}`;
    crumbs.push({ label: BREADCRUMB_MAP[part] || part, to: path });
  }
  return crumbs;
}

export function TopBar() {
  const { isDark, toggleTheme } = useTheme();
  const { isOffline } = useOffline();
  const { notifications, unreadCount } = useNotificationStore();
  const navigate = useNavigate();
  const crumbs = useBreadcrumbs();
  const [notifOpen, setNotifOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false);
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) setProfileOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const typeColors = {
    info: 'bg-carbon/10 text-carbon dark:text-lgrayblue',
    success: 'bg-greenline/10 text-greenline',
    warning: 'bg-gold/10 text-gold',
    error: 'bg-vibrant/10 text-vibrant',
  };

  return (
    <header className="h-14 bg-white dark:bg-carbon-800 border-b border-lgrayblue/30 dark:border-slate-700 flex items-center px-5 gap-4 flex-shrink-0 z-10">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1 text-sm flex-1 min-w-0">
        {crumbs.map((c, i) => (
          <span key={c.to} className="flex items-center gap-1 min-w-0">
            {i > 0 && <ChevronRight size={13} className="text-coolslate flex-shrink-0" />}
            <button
              onClick={() => navigate(c.to)}
              className={cn(
                'truncate transition-colors',
                i === crumbs.length - 1 ? 'text-carbon dark:text-white font-semibold' : 'text-coolslate hover:text-carbon dark:hover:text-white'
              )}
            >
              {c.label}
            </button>
          </span>
        ))}
      </nav>

      {/* Right actions */}
      <div className="flex items-center gap-2">
        {/* Offline indicator */}
        {isOffline && (
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-gold/10 text-gold rounded-full text-xs font-medium">
            <WifiOff size={12} /><span>Offline</span>
          </div>
        )}

        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          className="p-2 rounded-lg text-coolslate hover:text-carbon dark:hover:text-white hover:bg-lgrayblue/40 dark:hover:bg-slate-700 transition-all"
        >
          {isDark ? <Sun size={18} /> : <Moon size={18} />}
        </button>

        {/* Notifications */}
        <div className="relative" ref={notifRef}>
          <button
            onClick={() => setNotifOpen(o => !o)}
            className="relative p-2 rounded-lg text-coolslate hover:text-carbon dark:hover:text-white hover:bg-lgrayblue/40 dark:hover:bg-slate-700 transition-all"
          >
            <Bell size={18} />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 w-4 h-4 bg-vibrant text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>
          <AnimatePresence>
            {notifOpen && (
              <motion.div initial={{ opacity: 0, y: 8, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8, scale: 0.96 }}
                className="absolute right-0 top-12 w-80 bg-white dark:bg-carbon-700 rounded-xl shadow-modal border border-lgrayblue/30 dark:border-slate-600 overflow-hidden z-50"
              >
                <div className="flex items-center justify-between px-4 py-3 border-b border-lgrayblue/30 dark:border-slate-700">
                  <span className="text-sm font-semibold text-carbon dark:text-white">Notifications</span>
                  {unreadCount > 0 && <Badge variant="danger">{unreadCount} new</Badge>}
                </div>
                <div className="max-h-72 overflow-y-auto">
                  {notifications.length === 0 ? (
                    <div className="p-6 text-center">
                      <CheckCheck size={24} className="text-coolslate mx-auto mb-2" />
                      <p className="text-sm text-coolslate">All caught up!</p>
                    </div>
                  ) : notifications.slice(0, 10).map((n) => (
                    <div key={n.id} className={cn('px-4 py-3 border-b border-lgrayblue/20 dark:border-slate-700/50 last:border-0', !n.read && 'bg-lgrayblue/20 dark:bg-slate-700/30')}>
                      <div className="flex items-start gap-2.5">
                        <span className={cn('w-2 h-2 rounded-full mt-1.5 flex-shrink-0', typeColors[n.type])} />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-carbon dark:text-white">{n.title}</p>
                          <p className="text-xs text-coolslate mt-0.5 line-clamp-2">{n.message}</p>
                          <p className="text-[10px] text-coolslate/70 mt-1">{fmt.datetime(n.created_at)}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="px-4 py-2 border-t border-lgrayblue/30 dark:border-slate-700">
                  <button onClick={() => { navigate('/notifications'); setNotifOpen(false); }} className="text-xs text-carbon dark:text-lgrayblue font-medium hover:underline w-full text-center">
                    View all notifications
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Profile */}
        <div className="relative" ref={profileRef}>
          <button onClick={() => setProfileOpen(o => !o)}
            className="flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-lg hover:bg-lgrayblue/40 dark:hover:bg-slate-700 transition-all"
          >
            <div className="w-7 h-7 rounded-lg bg-gradient-primary flex items-center justify-center">
              <User size={14} className="text-white" />
            </div>
            <span className="text-sm font-medium text-carbon dark:text-white hidden sm:block">Admin</span>
          </button>
          <AnimatePresence>
            {profileOpen && (
              <motion.div initial={{ opacity: 0, y: 8, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8, scale: 0.96 }}
                className="absolute right-0 top-12 w-48 bg-white dark:bg-carbon-700 rounded-xl shadow-modal border border-lgrayblue/30 dark:border-slate-600 overflow-hidden z-50"
              >
                {[{ icon: User, label: 'Profile', to: '/settings' }, { icon: Settings, label: 'Settings', to: '/settings' }].map(({ icon: Icon, label, to }) => (
                  <button key={label} onClick={() => { navigate(to); setProfileOpen(false); }}
                    className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-carbon dark:text-lgrayblue hover:bg-lgrayblue/30 dark:hover:bg-slate-700 transition-colors"
                  >
                    <Icon size={15} />{label}
                  </button>
                ))}
                <div className="border-t border-lgrayblue/30 dark:border-slate-700">
                  <button className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-vibrant hover:bg-vibrant/5 transition-colors">
                    <LogOut size={15} />Sign out
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </header>
  );
}
