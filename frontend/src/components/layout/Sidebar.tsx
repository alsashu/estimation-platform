import { NavLink, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard, Calculator, History, BarChart3, Database,
  BookOpen, Settings, ChevronLeft, ChevronRight, Layers, Target, Users, Menu,
  Activity, HeartPulse,
} from 'lucide-react';
import { useSidebarStore, useConnectionStore } from '../../store';
import { cn } from '../../utils/formatters';

const navGroups = [
  {
    label: 'Overview',
    items: [
      { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
      // { to: '/estimate',  icon: Calculator,       label: 'New Estimate' },
    ],
  },
  {
    label: 'Estimation Methods',
    items: [
      { to: '/estimate',  icon: Calculator, label: 'Storypoint Estimation' },
      { to: '/parametric-estimation', icon: LayoutDashboard, label: 'Parametric Estimation' },
    ],
  },
  {
    label: 'Records',
    items: [
      { to: '/history',   icon: History,   label: 'Historical Data' },
      { to: '/analysis',  icon: BarChart3,  label: 'Analytics' },
    ],
  },
  {
    label: 'Master Data',
    items: [
      { to: '/master/story-points',   icon: Target,  label: 'Story Points' },
      { to: '/master/effort',         icon: Layers,  label: 'Effort Estimates' },
      { to: '/master/competency',     icon: Users,   label: 'Competency' },
    ],
  },
  {
    label: 'Monitoring',
    items: [
      { to: '/logs',       icon: Activity,   label: 'Log Monitor' },
      { to: '/monitoring', icon: HeartPulse, label: 'Health' },
    ],
  },
  {
    label: 'Help',
    items: [
      { to: '/docs',     icon: BookOpen, label: 'Documentation' },
      { to: '/settings', icon: Settings, label: 'Settings' },
    ],
  },
];

export function Sidebar() {
  const { collapsed, toggle } = useSidebarStore();
  const { isOnline, toggle: toggleConnection } = useConnectionStore();
  const location = useLocation();

  return (
    <motion.aside
      animate={{ width: collapsed ? 68 : 240 }}
      transition={{ type: 'spring', damping: 25, stiffness: 200 }}
      className="relative flex flex-col h-full bg-carbon dark:bg-carbon-900 shadow-sidebar flex-shrink-0 z-20 overflow-hidden"
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 py-5 border-b border-white/10">
        <div className="w-8 h-8 rounded-lg bg-gradient-primary flex items-center justify-center flex-shrink-0">
          <BarChart3 size={16} className="text-white" />
        </div>
        <AnimatePresence>
          {!collapsed && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="overflow-hidden whitespace-nowrap">
              <p className="text-white font-display font-semibold text-sm leading-tight">Estimation</p>
              <p className="text-white/50 text-xs">Platform</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-4 overflow-y-auto overflow-x-hidden space-y-1 px-2">
        {navGroups.map((group) => (
          <div key={group.label} className="mb-2">
            {!collapsed && (
              <p className="text-white/30 text-[10px] font-semibold uppercase tracking-widest px-3 mb-1">{group.label}</p>
            )}
            {group.items.map(({ to, icon: Icon, label }) => {
              const active = to === '/' ? location.pathname === '/' : location.pathname.startsWith(to);
              return (
                <NavLink key={to} to={to}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 group relative',
                    active ? 'bg-white/15 text-white' : 'text-white/60 hover:text-white hover:bg-white/8'
                  )}
                >
                  {active && <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-greenline rounded-r-full" />}
                  <Icon size={18} className="flex-shrink-0" />
                  <AnimatePresence>
                    {!collapsed && (
                      <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="whitespace-nowrap">
                        {label}
                      </motion.span>
                    )}
                  </AnimatePresence>
                  {collapsed && (
                    <div className="absolute left-full ml-2 px-2 py-1 bg-carbon-800 text-white text-xs rounded-md whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">
                      {label}
                    </div>
                  )}
                </NavLink>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Bottom: Connection Status + Collapse Toggle */}
      <div className="border-t border-white/10">
        {/* Connection status */}
        <div className={cn('px-3 pt-3 pb-1', collapsed ? 'flex justify-center' : 'flex items-center gap-3')}>
          {collapsed ? (
            <button
              onClick={toggleConnection}
              className="relative flex h-3 w-3 group"
              aria-label={isOnline ? 'Online — click to go offline' : 'Offline — click to go online'}
            >
              {isOnline && (
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-greenline opacity-60" />
              )}
              <span className={cn('relative inline-flex rounded-full h-3 w-3', isOnline ? 'bg-greenline' : 'bg-vibrant')} />
              <div className="absolute left-full ml-3 px-2 py-1 bg-carbon-800 text-white text-xs rounded-md whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">
                {isOnline ? 'Online' : 'Offline'}
              </div>
            </button>
          ) : (
            <>
              <span className="relative flex h-3 w-3 flex-shrink-0">
                {isOnline && (
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-greenline opacity-60" />
                )}
                <span className={cn('relative inline-flex rounded-full h-3 w-3', isOnline ? 'bg-greenline' : 'bg-vibrant')} />
              </span>
              <AnimatePresence>
                <motion.div
                  key="connection-label"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex items-center justify-between flex-1 min-w-0"
                >
                  <div className="min-w-0">
                    <p className="text-white text-xs font-medium leading-none">{isOnline ? 'Online' : 'Offline'}</p>
                    <p className="text-white/40 text-[10px] mt-0.5">Connection</p>
                  </div>
                  <button
                    onClick={toggleConnection}
                    aria-label={isOnline ? 'Switch to offline' : 'Switch to online'}
                    className={cn(
                      'relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors duration-300',
                      isOnline ? 'bg-greenline' : 'bg-vibrant'
                    )}
                  >
                    <span
                      className={cn(
                        'inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform duration-300',
                        isOnline ? 'translate-x-[18px]' : 'translate-x-0.5'
                      )}
                    />
                  </button>
                </motion.div>
              </AnimatePresence>
            </>
          )}
        </div>

        {/* Collapse toggle */}
        <div className="px-3 pb-3 pt-1">
          <button
            onClick={toggle}
            className="flex items-center justify-center w-full p-2 rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition-all duration-150"
          >
            {collapsed ? <ChevronRight size={16} /> : <><ChevronLeft size={16} /><span className="ml-2 text-xs">Collapse</span></>}
          </button>
        </div>
      </div>
    </motion.aside>
  );
}
