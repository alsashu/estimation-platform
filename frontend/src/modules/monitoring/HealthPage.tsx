import { useQuery } from '@tanstack/react-query';
import {
  HeartPulse, Database, MemoryStick, Cpu, HardDrive, RefreshCw,
  CheckCircle2, AlertTriangle, XCircle, Clock, Server,
  FileText, Activity,
} from 'lucide-react';
import { Card } from '../../components/ui';
import { monitoringApi, type ServiceCheck, type HealthReport } from '../../services/api';
import { cn } from '../../utils/formatters';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function statusColor(s?: string) {
  if (s === 'healthy')   return 'text-greenline';
  if (s === 'degraded')  return 'text-gold';
  return 'text-vibrant';
}

function statusBg(s?: string) {
  if (s === 'healthy')   return 'bg-greenline/10 border-greenline/30';
  if (s === 'degraded')  return 'bg-gold/10 border-gold/30';
  return 'bg-vibrant/10 border-vibrant/30';
}

function StatusIcon({ status, size = 16 }: { status?: string; size?: number }) {
  if (status === 'healthy')  return <CheckCircle2 size={size} className="text-greenline" />;
  if (status === 'degraded') return <AlertTriangle size={size} className="text-gold" />;
  return <XCircle size={size} className="text-vibrant" />;
}

function StatusBadge({ status }: { status?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-semibold capitalize', statusColor(status), statusBg(status))}>
      <StatusIcon status={status} size={11} />
      {status ?? 'unknown'}
    </span>
  );
}

function formatUptime(secs: number) {
  const d = Math.floor(secs / 86400);
  const h = Math.floor((secs % 86400) / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  return `${m}m ${s}s`;
}

function MemoryBar({ used, total }: { used: number; total: number }) {
  const pct = Math.min((used / total) * 100, 100);
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-coolslate">
        <span>{used} MB used</span>
        <span>{total} MB total</span>
      </div>
      <div className="h-2 rounded-full bg-lgrayblue/20 dark:bg-slate-700 overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all duration-500',
            pct > 85 ? 'bg-vibrant' : pct > 65 ? 'bg-gold' : 'bg-greenline'
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ─── Service Card ─────────────────────────────────────────────────────────────
function ServiceCard({
  title, icon, check,
}: {
  title: string;
  icon: React.ReactNode;
  check?: ServiceCheck;
}) {
  const details = check?.details as Record<string, unknown> | undefined;

  return (
    <Card padding="p-4">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className={cn('p-1.5 rounded-lg', statusBg(check?.status))}>{icon}</span>
          <span className="text-sm font-semibold text-carbon dark:text-white">{title}</span>
        </div>
        <StatusBadge status={check?.status} />
      </div>

      {check?.message && (
        <p className="text-xs text-coolslate mb-2 italic">{check.message}</p>
      )}

      {check?.responseTimeMs != null && check.responseTimeMs > 0 && (
        <div className="flex items-center gap-1 text-xs text-coolslate mb-2">
          <Clock size={11} /> {check.responseTimeMs}ms response
        </div>
      )}

      {/* Database details */}
      {Boolean(details?.pgVersion) && (
        <div className="space-y-1.5 mt-2">
          <Detail label="Version" value={String(details!.pgVersion)} />
          <Detail label="Connections" value={`${details!.poolTotal ?? 0} total / ${details!.poolIdle ?? 0} idle`} />
          {(details!.poolWaiting as number) > 0 && (
            <Detail label="Waiting" value={String(details!.poolWaiting)} warn />
          )}
        </div>
      )}

      {/* Memory details */}
      {details?.heapUsedMb !== undefined && (
        <div className="mt-2 space-y-2">
          <MemoryBar used={details.heapUsedMb as number} total={details.heapTotalMb as number} />
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-2">
            <Detail label="RSS" value={`${details.rssMb} MB`} />
            <Detail label="External" value={`${details.externalMb} MB`} />
          </div>
        </div>
      )}

      {/* System details */}
      {Boolean(details?.platform) && (
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-2">
          <Detail label="Platform" value={`${details!.platform}/${details!.arch}`} />
          <Detail label="Node" value={String(details!.nodeVersion)} />
          <Detail label="CPUs" value={String(details!.cpuCount)} />
          <Detail label="Load (1m)" value={String(details!.loadAvg1m)} />
          <Detail label="Free mem" value={`${details!.freeMemoryMb} MB`} />
          <Detail label="Total mem" value={`${details!.totalMemoryMb} MB`} />
        </div>
      )}

      {/* Log storage details */}
      {details?.fileCount != null && details.directory == null ? (
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-2">
          <Detail label="Total logs" value={String(details.total)} />
          <Detail label="Last hour" value={String(details.last_hour)} />
          <Detail label="Errors (24h)" value={String(details.errors_24h)} />
        </div>
      ) : details?.fileCount != null ? (
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-2">
          <Detail label="Files" value={String(details.fileCount)} />
          <Detail label="Total size" value={`${details.totalSizeMb} MB`} />
        </div>
      ) : null}
    </Card>
  );
}

function Detail({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="flex items-baseline gap-1">
      <span className="text-[10px] text-coolslate min-w-[60px]">{label}</span>
      <span className={cn('text-xs font-medium', warn ? 'text-gold' : 'text-carbon dark:text-lgrayblue')}>{value}</span>
    </div>
  );
}

// ─── Overall Banner ───────────────────────────────────────────────────────────
function OverallBanner({ report }: { report: HealthReport }) {
  const isHealthy  = report.status === 'healthy';
  const isDegraded = report.status === 'degraded';
  return (
    <div className={cn(
      'flex items-center justify-between p-5 rounded-2xl border-2 transition-colors duration-300',
      isHealthy  ? 'bg-greenline/8 border-greenline/30 dark:bg-greenline/10' :
      isDegraded ? 'bg-gold/8 border-gold/30 dark:bg-gold/10' :
                   'bg-vibrant/8 border-vibrant/30 dark:bg-vibrant/10',
    )}>
      <div className="flex items-center gap-4">
        <div className={cn('p-3 rounded-xl', isHealthy ? 'bg-greenline/15' : isDegraded ? 'bg-gold/15' : 'bg-vibrant/15')}>
          <HeartPulse size={26} className={statusColor(report.status)} />
        </div>
        <div>
          <p className="text-xs text-coolslate uppercase tracking-widest font-medium mb-0.5">System Status</p>
          <p className={cn('text-2xl font-display font-bold capitalize', statusColor(report.status))}>
            {report.status}
          </p>
          <p className="text-xs text-coolslate mt-0.5">
            {report.environment} · v{report.version} · {new Date(report.timestamp).toLocaleString()}
          </p>
        </div>
      </div>
      <div className="hidden sm:flex flex-col items-end gap-1 text-right">
        <div className="flex items-center gap-1.5">
          <Clock size={13} className="text-coolslate" />
          <span className="text-sm font-semibold text-carbon dark:text-white">{formatUptime(report.uptimeSeconds)}</span>
        </div>
        <span className="text-xs text-coolslate">Uptime</span>
        <div className="flex items-center gap-1.5 mt-1">
          <Activity size={13} className="text-coolslate" />
          <span className="text-sm font-semibold text-carbon dark:text-white">{report.responseTimeMs}ms</span>
        </div>
        <span className="text-xs text-coolslate">Check latency</span>
      </div>
    </div>
  );
}

// ─── Refresh Countdown ────────────────────────────────────────────────────────
function RefreshIndicator({ isFetching, onRefresh }: { isFetching: boolean; onRefresh: () => void }) {
  return (
    <button
      onClick={onRefresh}
      className="flex items-center gap-1.5 text-xs text-coolslate hover:text-carbon dark:hover:text-white transition-colors"
    >
      <RefreshCw size={12} className={isFetching ? 'animate-spin' : ''} />
      {isFetching ? 'Checking…' : 'Auto-refresh 30s'}
    </button>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function HealthPage() {
  const { data, isFetching, refetch, dataUpdatedAt } = useQuery({
    queryKey: ['health'],
    queryFn: () => monitoringApi.getHealth(),
    refetchInterval: 30_000,
    retry: 1,
  });

  if (!data && isFetching) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-3 text-coolslate">
          <RefreshCw size={20} className="animate-spin" />
          <p className="text-sm">Running health checks…</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <Card padding="p-8">
        <div className="flex flex-col items-center gap-3 text-center">
          <XCircle size={32} className="text-vibrant" />
          <p className="font-semibold text-carbon dark:text-white">Unable to reach health endpoint</p>
          <p className="text-sm text-coolslate">The backend may be offline or unreachable.</p>
          <button onClick={() => void refetch()} className="mt-2 text-sm text-carbon dark:text-white underline">Retry</button>
        </div>
      </Card>
    );
  }

  const s = data.services;
  const lastCheck = dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString() : '—';

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-display font-bold text-carbon dark:text-white flex items-center gap-2">
            <HeartPulse size={22} /> Health Monitor
          </h1>
          <p className="text-sm text-coolslate mt-0.5">Last checked: {lastCheck}</p>
        </div>
        <RefreshIndicator isFetching={isFetching} onRefresh={() => void refetch()} />
      </div>

      {/* Overall banner */}
      <OverallBanner report={data} />

      {/* Service grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        <ServiceCard
          title="API Server"
          icon={<Server size={16} className={statusColor(s.api?.status)} />}
          check={{
            status: 'healthy',
            responseTimeMs: data.responseTimeMs,
            details: { version: data.version, environment: data.environment },
          }}
        />
        <ServiceCard
          title="Database"
          icon={<Database size={16} className={statusColor(s.database?.status)} />}
          check={s.database}
        />
        <ServiceCard
          title="Memory"
          icon={<MemoryStick size={16} className={statusColor(s.memory?.status)} />}
          check={s.memory}
        />
        <ServiceCard
          title="System"
          icon={<Cpu size={16} className={statusColor(s.system?.status)} />}
          check={s.system}
        />
        <ServiceCard
          title="Log Storage"
          icon={<HardDrive size={16} className={statusColor(s.logStorage?.status)} />}
          check={s.logStorage}
        />
        <ServiceCard
          title="Log Database"
          icon={<FileText size={16} className={statusColor(s.logDatabase?.status)} />}
          check={s.logDatabase}
        />
      </div>

      {/* Quick links */}
      <Card padding="p-4">
        <h2 className="text-sm font-semibold text-carbon dark:text-white mb-3">Quick Links</h2>
        <div className="flex flex-wrap gap-2 text-xs">
          {[
            { label: 'Swagger / API Docs',  href: '/api-docs',                   icon: <FileText size={12} /> },
            { label: 'Raw OpenAPI JSON',    href: '/api-docs.json',              icon: <FileText size={12} /> },
            { label: 'Liveness Probe',      href: '/api/monitoring/health/live', icon: <CheckCircle2 size={12} /> },
            { label: 'Readiness Probe',     href: '/api/monitoring/health/ready',icon: <Database size={12} /> },
          ].map(({ label, href, icon }) => (
            <a
              key={href}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-lgrayblue/30 dark:border-slate-700 text-carbon dark:text-lgrayblue hover:border-carbon/30 dark:hover:border-slate-500 hover:bg-lgrayblue/10 dark:hover:bg-white/5 transition-colors"
            >
              {icon} {label}
            </a>
          ))}
        </div>
      </Card>
    </div>
  );
}
