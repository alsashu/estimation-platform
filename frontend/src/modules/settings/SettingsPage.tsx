import { Settings, Moon, Sun, Monitor, Wifi, WifiOff } from 'lucide-react';
import { Card, Button } from '../../components/ui';
import { useTheme } from '../../hooks/useTheme';
import { useConnectionStore } from '../../store';
import { cn } from '../../utils/formatters';

export default function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const { isOnline, toggle: toggleConnection } = useConnectionStore();

  return (
    <div className="space-y-5 max-w-2xl">
      <div>
        <h1 className="text-2xl font-display font-bold text-carbon dark:text-white flex items-center gap-2"><Settings size={22} /> Settings</h1>
        <p className="text-sm text-coolslate mt-0.5">Manage application preferences</p>
      </div>

      <Card padding="p-5">
        <h2 className="font-semibold text-carbon dark:text-white mb-4">Appearance</h2>
        <div>
          <p className="text-sm font-medium text-carbon dark:text-lgrayblue mb-3">Theme</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[
              { id: 'light', label: 'Light', icon: <Sun size={18} />, desc: 'Soft neutral backgrounds' },
              { id: 'dark',  label: 'Dark',  icon: <Moon size={18} />, desc: 'Deep navy backgrounds' },
              { id: 'system', label: 'System', icon: <Monitor size={18} />, desc: 'Follows OS preference' },
            ].map(({ id, label, icon, desc }) => (
              <button key={id} onClick={() => setTheme(id === 'system' ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : id as any)}
                className={cn(
                  'flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all text-sm',
                  (theme === id || (id === 'system')) && theme === id
                    ? 'border-carbon dark:border-lgrayblue bg-carbon/5 dark:bg-white/5'
                    : 'border-lgrayblue/30 dark:border-slate-700 hover:border-carbon/30 dark:hover:border-slate-500'
                )}
              >
                <span className="text-carbon dark:text-lgrayblue">{icon}</span>
                <span className="font-medium text-carbon dark:text-white">{label}</span>
                <span className="text-xs text-coolslate text-center leading-tight">{desc}</span>
              </button>
            ))}
          </div>
        </div>
      </Card>

      <Card padding="p-5">
        <h2 className="font-semibold text-carbon dark:text-white mb-1">Connection</h2>
        <p className="text-xs text-coolslate mb-4">Manage application connectivity mode</p>

        <div className={cn(
          'flex items-center justify-between p-4 rounded-xl border-2 transition-colors duration-300',
          isOnline
            ? 'border-greenline/30 bg-greenline/5 dark:bg-greenline/10'
            : 'border-vibrant/30 bg-vibrant/5 dark:bg-vibrant/10'
        )}>
          <div className="flex items-center gap-3">
            {/* Pulsing signal dot */}
            <span className="relative flex h-3 w-3 flex-shrink-0">
              {isOnline && (
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-greenline opacity-60" />
              )}
              <span
                className="relative inline-flex rounded-full h-3 w-3"
                style={{ backgroundColor: isOnline ? '#19AA6E' : '#DC3223' }}
              />
            </span>
            <div>
              <p className={cn('text-sm font-semibold', isOnline ? 'text-greenline' : 'text-vibrant')}>
                {isOnline ? 'Online' : 'Offline'}
              </p>
              <p className="text-xs text-coolslate mt-0.5">
                {isOnline ? 'Application is connected and syncing' : 'Application is running in offline mode'}
              </p>
            </div>
          </div>

          {/* Toggle switch */}
          <button
            onClick={toggleConnection}
            aria-label={isOnline ? 'Switch to offline mode' : 'Switch to online mode'}
            className={cn(
              'relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
              isOnline
                ? 'bg-greenline focus-visible:ring-greenline'
                : 'bg-vibrant focus-visible:ring-vibrant'
            )}
          >
            <span
              className={cn(
                'inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform duration-300',
                isOnline ? 'translate-x-6' : 'translate-x-1'
              )}
            />
          </button>
        </div>

        {/* Mode cards */}
        <div className="grid grid-cols-2 gap-3 mt-3">
          {[
            {
              id: 'online',
              label: 'Online',
              icon: <Wifi size={16} />,
              desc: 'Live data, real-time sync',
              color: '#19AA6E',
            },
            {
              id: 'offline',
              label: 'Offline',
              icon: <WifiOff size={16} />,
              desc: 'Cached data, no sync',
              color: '#DC3223',
            },
          ].map(({ id, label, icon, desc, color }) => {
            const active = (id === 'online') === isOnline;
            return (
              <button
                key={id}
                onClick={() => toggleConnection()}
                disabled={active}
                className={cn(
                  'flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all duration-200 disabled:cursor-default',
                  active
                    ? 'border-opacity-60 bg-white dark:bg-carbon-800 shadow-sm'
                    : 'border-lgrayblue/20 dark:border-slate-700 hover:border-lgrayblue/40 dark:hover:border-slate-600 opacity-60 hover:opacity-80'
                )}
                style={active ? { borderColor: color } : {}}
              >
                <span style={{ color }} className="flex-shrink-0">{icon}</span>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-carbon dark:text-white">{label}</p>
                  <p className="text-[11px] text-coolslate leading-tight">{desc}</p>
                </div>
              </button>
            );
          })}
        </div>
      </Card>

      <Card padding="p-5">
        <h2 className="font-semibold text-carbon dark:text-white mb-4">About</h2>
        <div className="space-y-2 text-sm">
          {[
            ['Application', 'Estimation Platform'],
            ['Version', '1.0.0'],
            ['Build', 'React + Node.js + PostgreSQL'],
            ['PWA', 'Enabled — offline support active'],
          ].map(([l, v]) => (
            <div key={l} className="flex justify-between border-b border-lgrayblue/20 dark:border-slate-700/40 pb-2 last:border-0">
              <span className="text-coolslate">{l}</span>
              <span className="font-medium text-carbon dark:text-white">{v}</span>
            </div>
          ))}
        </div>
      </Card>

      <Card padding="p-5">
        <h2 className="font-semibold text-carbon dark:text-white mb-1">Colour Palette</h2>
        <p className="text-xs text-coolslate mb-4">Application colour scheme reference</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { name: 'Carbon Blue', hex: '#1E3246' }, { name: 'Vibrant Red', hex: '#DC3223' },
            { name: 'Gold', hex: '#9B875F' }, { name: 'Green Line', hex: '#19AA6E' },
            { name: 'Steel Slate', hex: '#4B5A69' }, { name: 'Soft Red', hex: '#E15A50' },
            { name: 'Muted Gold', hex: '#AFA082' }, { name: 'Mint Green', hex: '#73CDAA' },
          ].map(({ name, hex }) => (
            <div key={name} className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg shadow-sm flex-shrink-0" style={{ background: hex }} />
              <div>
                <p className="text-xs font-medium text-carbon dark:text-white">{name}</p>
                <p className="text-[10px] font-mono text-coolslate">{hex}</p>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
