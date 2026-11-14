import { useMemo, useState } from 'react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, Cell, LineChart, Line, LabelList,
} from 'recharts';
import { BarChart3 } from 'lucide-react';
import { Card } from '../../components/ui';
import { cn } from '../../utils/formatters';
import { useTheme } from '../../hooks/useTheme';
import { formatTick, formatDisplayDate } from '../../components/dashboard/activityRange';
import { fmtNum, fmtPct, fmtPd, KPI_DEFS, NA } from './kpiFormat';
import { chartInk, CURRENT_COLOR, DIRECTION_COLORS, HISTORICAL_COLOR, KPI_COLORS } from './palette';
import type { DistributionBucket, GroupRow, KpiKey, KpiSummary, PerformanceDashboard, TrendPoint } from './types';

// ─── Shared bits ─────────────────────────────────────────────────────────────

export function ChartCard({ title, subtitle, actions, children, className, testId }: {
  title: string; subtitle?: string; actions?: React.ReactNode; children: React.ReactNode; className?: string; testId?: string;
}) {
  return (
    <Card padding="p-5" className={className}>
      <div data-testid={testId}>
        <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
          <div className="min-w-0">
            <h3 className="font-display font-semibold text-carbon dark:text-white">{title}</h3>
            {subtitle && <p className="text-xs text-coolslate mt-0.5">{subtitle}</p>}
          </div>
          {actions}
        </div>
        {children}
      </div>
    </Card>
  );
}

export function Legend({ items }: { items: { label: string; color: string; shape?: 'line' | 'box' }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-2 text-xs text-coolslate">
      {items.map(i => (
        <span key={i.label} className="inline-flex items-center gap-1.5">
          <span className={cn('inline-block', i.shape === 'line' ? 'w-3.5 h-0.5 rounded' : 'w-2.5 h-2.5 rounded-sm')} style={{ background: i.color }} />
          {i.label}
        </span>
      ))}
    </div>
  );
}

export function ChartEmpty({ message, hint }: { message: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-[220px] text-coolslate text-center px-4" data-testid="chart-empty">
      <BarChart3 size={26} className="opacity-30 mb-2" />
      <p className="text-sm">{message}</p>
      {hint && <p className="text-xs mt-1 max-w-sm">{hint}</p>}
    </div>
  );
}

function TipBox({ title, rows }: { title: string; rows: { label: string; value: string; color?: string }[] }) {
  return (
    <div className="rounded-lg bg-white dark:bg-carbon-800 border border-lgrayblue/60 dark:border-slate-600 shadow-modal px-3 py-2 text-xs min-w-[180px]">
      <p className="font-semibold text-carbon dark:text-white mb-1">{title}</p>
      {rows.map(r => (
        <div key={r.label} className="flex items-center justify-between gap-4">
          <span className="inline-flex items-center gap-1.5 text-coolslate">
            {r.color && <span className="w-2 h-2 rounded-sm" style={{ background: r.color }} />}{r.label}
          </span>
          <span className="font-medium tabular-nums text-carbon dark:text-white">{r.value}</span>
        </div>
      ))}
    </div>
  );
}

const shortName = (s: string, n = 16) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const pctTick = (v: number) => `${Math.round(v)}%`;

// ─── 1. ED deviation by program ──────────────────────────────────────────────

export function EdDeviationChart({ rows, tolerance, onDrill }: { rows: GroupRow[]; tolerance: number; onDrill?: (r: GroupRow) => void }) {
  const { isDark } = useTheme();
  const ink = chartInk(isDark);
  const mode = isDark ? 'dark' : 'light';
  const data = rows.filter(r => r.ed != null).map(r => ({ ...r, label: shortName(r.name) }));
  if (data.length === 0) return <ChartEmpty message="No eligible records for the selected filters" hint="Records need an approved estimate and recorded actual effort." />;
  const colorOf = (ed: number) => (Math.abs(ed) <= tolerance ? DIRECTION_COLORS.on_target[mode] : ed < 0 ? DIRECTION_COLORS.under[mode] : DIRECTION_COLORS.over[mode]);
  const max = Math.max(5, ...data.map(d => Math.abs(d.ed!)));
  const lim = Math.ceil(max / 5) * 5;
  return (
    <>
      <Legend items={[
        { label: 'Underestimation (ED < 0)', color: DIRECTION_COLORS.under[mode] },
        { label: `On target (±${tolerance}%)`, color: DIRECTION_COLORS.on_target[mode] },
        { label: 'Overestimation (ED > 0)', color: DIRECTION_COLORS.over[mode] },
      ]} />
      <div className="h-[260px]" data-testid="ed-deviation-chart">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 16, right: 8, left: -12, bottom: data.length > 5 ? 28 : 4 }}>
            <CartesianGrid vertical={false} stroke={ink.grid} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: ink.axis }} interval={0} angle={data.length > 5 ? -30 : 0}
              textAnchor={data.length > 5 ? 'end' : 'middle'} tickLine={false} axisLine={{ stroke: ink.baseline }} />
            <YAxis domain={[-lim, lim]} tickFormatter={pctTick} tick={{ fontSize: 11, fill: ink.axis }} tickLine={false} axisLine={false} />
            <ReferenceLine y={0} stroke={ink.axis} strokeWidth={1.5} />
            <Tooltip cursor={{ fill: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(30,50,70,0.05)' }} content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const r = payload[0].payload as GroupRow;
              return <TipBox title={r.department_name ? `${r.name} · ${r.department_name}` : r.name} rows={[
                { label: 'ED', value: fmtPct(r.ed, 2, true), color: colorOf(r.ed!) },
                { label: 'Estimated', value: fmtPd(r.total_estimated_pd) },
                { label: 'Actual', value: fmtPd(r.total_actual_pd) },
                { label: 'Records', value: `${r.record_count} (${r.under_count} under · ${r.over_count} over)` },
                ...(onDrill ? [{ label: 'Click', value: 'drill down →' }] : []),
              ]} />;
            }} />
            <Bar dataKey="ed" radius={[4, 4, 4, 4]} maxBarSize={44} onClick={(d) => onDrill?.(d as unknown as GroupRow)} className={onDrill ? 'cursor-pointer' : ''}>
              {data.map(d => <Cell key={`${d.id}`} fill={colorOf(d.ed!)} />)}
              <LabelList dataKey="ed" position="top" formatter={(v: number) => `${v > 0 ? '+' : ''}${v.toFixed(1)}%`}
                style={{ fontSize: 10, fill: ink.axis }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </>
  );
}

// ─── 2. Historical vs current deviation ───────────────────────────────────────

export function HistoricalVsCurrentChart({ byProgram, byDepartment }: { byProgram: GroupRow[]; byDepartment: GroupRow[] }) {
  const { isDark } = useTheme();
  const ink = chartInk(isDark);
  const mode = isDark ? 'dark' : 'light';
  const [groupBy, setGroupBy] = useState<'program' | 'department'>('program');
  const rows = (groupBy === 'program' ? byProgram : byDepartment)
    .filter(r => r.historical_ed != null || r.current_ed != null)
    .map(r => ({ ...r, label: shortName(r.name) }));
  return (
    <ChartCard
      title="Historical vs Current Deviation"
      subtitle="Aggregate ED without the framework (governed baseline) vs with the framework"
      testId="hist-vs-current"
      actions={<Segmented value={groupBy} onChange={setGroupBy} options={[{ id: 'program', label: 'Program' }, { id: 'department', label: 'Department' }]} />}
    >
      {rows.length === 0 ? (
        <ChartEmpty message="No historical baseline matches this scope" hint="Add a pre-framework Historical Baseline for a Department or Program to compare." />
      ) : (
        <>
          <Legend items={[{ label: 'Historical ED (without framework)', color: HISTORICAL_COLOR[mode] }, { label: 'Current ED (with framework)', color: CURRENT_COLOR[mode] }]} />
          <div className="h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rows} margin={{ top: 16, right: 8, left: -12, bottom: 4 }} barGap={2}>
                <CartesianGrid vertical={false} stroke={ink.grid} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: ink.axis }} tickLine={false} axisLine={{ stroke: ink.baseline }} interval={0} />
                <YAxis tickFormatter={pctTick} tick={{ fontSize: 11, fill: ink.axis }} tickLine={false} axisLine={false} />
                <Tooltip cursor={{ fill: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(30,50,70,0.05)' }} content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const r = payload[0].payload as GroupRow;
                  return <TipBox title={r.name} rows={[
                    { label: 'Historical ED', value: fmtPct(r.historical_ed), color: HISTORICAL_COLOR[mode] },
                    { label: 'Current ED', value: fmtPct(r.current_ed), color: CURRENT_COLOR[mode] },
                    { label: 'EBI', value: fmtPct(r.ebi) },
                  ]} />;
                }} />
                <Bar dataKey="historical_ed" name="Historical ED" fill={HISTORICAL_COLOR[mode]} radius={[4, 4, 0, 0]} maxBarSize={36} />
                <Bar dataKey="current_ed" name="Current ED" fill={CURRENT_COLOR[mode]} radius={[4, 4, 0, 0]} maxBarSize={36} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </ChartCard>
  );
}

// ─── 3. EFA & EEI trend ───────────────────────────────────────────────────────

export function EfaEeiTrendChart({ points, interval }: { points: TrendPoint[]; interval: 'day' | 'week' | 'month' }) {
  const { isDark } = useTheme();
  const ink = chartInk(isDark);
  const mode = isDark ? 'dark' : 'light';
  const hasData = points.some(p => p.efa != null || p.eei != null);
  if (!hasData) return <ChartEmpty message="No eligible records in the selected period" />;
  const values = points.flatMap(p => [p.efa, p.eei]).filter((v): v is number => v != null);
  const lo = Math.min(0, Math.floor(Math.min(...values) / 10) * 10);
  return (
    <>
      <Legend items={[{ label: 'EFA (solid)', color: KPI_COLORS.efa[mode], shape: 'line' }, { label: 'EEI (dashed)', color: KPI_COLORS.eei[mode], shape: 'line' }]} />
      <div className="h-[240px]" data-testid="efa-eei-trend">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points} margin={{ top: 8, right: 12, left: -12, bottom: 4 }}>
            <CartesianGrid vertical={false} stroke={ink.grid} />
            <XAxis dataKey="period" tickFormatter={(v: string) => formatTick(v, interval)} tick={{ fontSize: 11, fill: ink.axis }}
              tickLine={false} axisLine={{ stroke: ink.baseline }} minTickGap={16} />
            <YAxis domain={[lo, 100]} tickFormatter={pctTick} tick={{ fontSize: 11, fill: ink.axis }} tickLine={false} axisLine={false} />
            <Tooltip content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload as TrendPoint;
              return <TipBox title={`${interval === 'month' ? '' : 'From '}${formatDisplayDate(p.period)}`} rows={[
                { label: 'EFA', value: fmtPct(p.efa), color: KPI_COLORS.efa[mode] },
                { label: 'EEI', value: fmtPct(p.eei), color: KPI_COLORS.eei[mode] },
                { label: 'Records', value: `${p.record_count} (${p.framework_record_count} framework)` },
              ]} />;
            }} />
            <Line type="monotone" dataKey="efa" name="EFA" stroke={KPI_COLORS.efa[mode]} strokeWidth={2} dot={{ r: 5, strokeWidth: 2, fill: ink.surface }} connectNulls />
            <Line type="monotone" dataKey="eei" name="EEI" stroke={KPI_COLORS.eei[mode]} strokeWidth={2} strokeDasharray="6 4" dot={{ r: 3, strokeWidth: 2, fill: KPI_COLORS.eei[mode] }} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="text-[11px] text-coolslate mt-1">Periods without completed records are skipped (shown as gaps in the tooltip, not as 0 %).</p>
    </>
  );
}

// ─── 4. Program-wise performance ─────────────────────────────────────────────

export function ProgramPerformanceChart({ rows }: { rows: GroupRow[] }) {
  const { isDark } = useTheme();
  const ink = chartInk(isDark);
  const mode = isDark ? 'dark' : 'light';
  const [metric, setMetric] = useState<KpiKey>('eei');
  const [sort, setSort] = useState<'desc' | 'asc'>('desc');
  const valueOf = (r: GroupRow) => r[metric];
  const data = useMemo(() => rows
    .filter(r => valueOf(r) != null)
    .map(r => ({ ...r, value: valueOf(r) as number, label: shortName(r.name, 22) }))
    .sort((a, b) => {
      // ED is ranked by distance from zero (best = closest)
      const ka = metric === 'ed' ? -Math.abs(a.value) : a.value;
      const kb = metric === 'ed' ? -Math.abs(b.value) : b.value;
      return sort === 'desc' ? kb - ka : ka - kb;
    }), [rows, metric, sort]); // eslint-disable-line react-hooks/exhaustive-deps
  const na = rows.length - data.length;
  const color = KPI_COLORS[metric][mode];
  return (
    <ChartCard
      title="Program-wise Performance"
      subtitle={`${KPI_DEFS[metric].name} by program · ${sort === 'desc' ? 'best first' : 'worst first'}`}
      testId="program-performance"
      actions={
        <div className="flex flex-wrap gap-2">
          <Segmented value={metric} onChange={setMetric} options={(['efa', 'ed', 'ebi', 'eei'] as KpiKey[]).map(k => ({ id: k, label: KPI_DEFS[k].short }))} />
          <Segmented value={sort} onChange={setSort} options={[{ id: 'desc', label: 'Best' }, { id: 'asc', label: 'Worst' }]} />
        </div>
      }
    >
      {data.length === 0 ? <ChartEmpty message={`${KPI_DEFS[metric].short} is N/A for every program in this scope`} /> : (
        <div style={{ height: Math.max(140, data.length * 38 + 30) }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" margin={{ top: 4, right: 52, left: 8, bottom: 4 }}>
              <CartesianGrid horizontal={false} stroke={ink.grid} />
              <XAxis type="number" tickFormatter={pctTick} tick={{ fontSize: 11, fill: ink.axis }} tickLine={false} axisLine={{ stroke: ink.baseline }} />
              <YAxis type="category" dataKey="label" width={120} tick={{ fontSize: 11, fill: ink.axis }} tickLine={false} axisLine={false} />
              {metric === 'ed' && <ReferenceLine x={0} stroke={ink.axis} />}
              <Tooltip cursor={{ fill: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(30,50,70,0.05)' }} content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const r = payload[0].payload as GroupRow;
                return <TipBox title={r.department_name ? `${r.name} · ${r.department_name}` : r.name} rows={[
                  { label: 'EFA', value: fmtPct(r.efa), color: KPI_COLORS.efa[mode] },
                  { label: 'ED', value: fmtPct(r.ed, 2, true), color: KPI_COLORS.ed[mode] },
                  { label: 'EBI', value: fmtPct(r.ebi), color: KPI_COLORS.ebi[mode] },
                  { label: 'EEI', value: fmtPct(r.eei), color: KPI_COLORS.eei[mode] },
                  { label: 'Records', value: String(r.record_count) },
                ]} />;
              }} />
              <Bar dataKey="value" fill={color} radius={4} maxBarSize={22}>
                <LabelList dataKey="value" position="right" formatter={(v: number) => fmtPct(v, 1, metric === 'ed')} style={{ fontSize: 11, fill: ink.axis }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      {na > 0 && data.length > 0 && <p className="text-[11px] text-coolslate mt-1">{na} program(s) not shown: {KPI_DEFS[metric].short} is N/A.</p>}
    </ChartCard>
  );
}

// ─── 5. Under- vs over-estimation (diverging) ────────────────────────────────

export function DirectionChart({ ed }: { ed: KpiSummary['ed'] }) {
  const { isDark } = useTheme();
  const mode = isDark ? 'dark' : 'light';
  const total = ed.under_count + ed.over_count + ed.on_target_count;
  if (total === 0) return <ChartEmpty message="No eligible records for the selected filters" />;
  const rows = [
    { label: 'Tasks', under: ed.under_count, over: ed.over_count, center: `${ed.on_target_count} on target`,
      fmtU: `${ed.under_count} · ${fmtPct(ed.under_pct, 0)}`, fmtO: `${ed.over_count} · ${fmtPct(ed.over_pct, 0)}` },
    { label: 'Effort deviation', under: ed.under_effort_pd, over: ed.over_effort_pd, center: `±${ed.tolerance}%`,
      fmtU: `${fmtNum(ed.under_effort_pd, 1)} PD${ed.under_ed != null ? ` · ${fmtPct(ed.under_ed, 1, true)}` : ''}`,
      fmtO: `${fmtNum(ed.over_effort_pd, 1)} PD${ed.over_ed != null ? ` · ${fmtPct(ed.over_ed, 1, true)}` : ''}` },
  ];
  return (
    <div data-testid="direction-chart">
      <div className="grid grid-cols-[1fr_auto_1fr] text-[11px] font-medium text-coolslate mb-2">
        <span className="text-right pr-2">← Underestimated (actual &gt; estimate)</span>
        <span className="px-2 text-center">On target</span>
        <span className="pl-2">Overestimated (estimate &gt; actual) →</span>
      </div>
      <div className="space-y-4">
        {rows.map(r => {
          const m = Math.max(r.under, r.over) || 1;
          return (
            <div key={r.label}>
              <p className="text-xs font-medium text-carbon dark:text-lgrayblue mb-1">{r.label}</p>
              <div className="grid grid-cols-[1fr_auto_1fr] items-center">
                <div className="flex justify-end items-center gap-2">
                  <span className="text-[11px] tabular-nums text-carbon dark:text-white whitespace-nowrap">{r.fmtU}</span>
                  <div className="h-5 rounded-l" style={{ width: `${(r.under / m) * 60}%`, minWidth: r.under > 0 ? 3 : 0, background: DIRECTION_COLORS.under[mode] }} />
                </div>
                <span className="mx-1.5 px-2 py-0.5 rounded-full text-[10.5px] whitespace-nowrap border border-lgrayblue dark:border-slate-600 text-carbon dark:text-lgrayblue"
                  style={{ background: isDark ? '#383835' : '#f0efec' }}>{r.center}</span>
                <div className="flex items-center gap-2">
                  <div className="h-5 rounded-r" style={{ width: `${(r.over / m) * 60}%`, minWidth: r.over > 0 ? 3 : 0, background: DIRECTION_COLORS.over[mode] }} />
                  <span className="text-[11px] tabular-nums text-carbon dark:text-white whitespace-nowrap">{r.fmtO}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-[11px] text-coolslate mt-3">On target: {ed.on_target_count} task(s) within ±{ed.tolerance}% ({fmtPct(ed.on_target_pct, 0)}). Each row has its own scale.</p>
    </div>
  );
}

// ─── 6. Accuracy distribution ────────────────────────────────────────────────

export function DistributionChart({ buckets }: { buckets: DistributionBucket[] }) {
  const { isDark } = useTheme();
  const ink = chartInk(isDark);
  const color = KPI_COLORS.efa[isDark ? 'dark' : 'light'];
  if (buckets.every(b => b.count === 0)) return <ChartEmpty message="No completed tasks with actual effort in this period" />;
  return (
    <div className="h-[220px]" data-testid="distribution-chart">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={buckets} margin={{ top: 18, right: 8, left: -20, bottom: 4 }} barCategoryGap={2}>
          <CartesianGrid vertical={false} stroke={ink.grid} />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: ink.axis }} tickLine={false} axisLine={{ stroke: ink.baseline }} />
          <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: ink.axis }} tickLine={false} axisLine={false} />
          <Tooltip cursor={{ fill: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(30,50,70,0.05)' }} content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const b = payload[0].payload as DistributionBucket;
            return <TipBox title={`|ED| ${b.label}`} rows={[{ label: 'Tasks', value: String(b.count), color }, { label: 'Share', value: fmtPct(b.pct, 1) }]} />;
          }} />
          <Bar dataKey="count" fill={color} radius={[4, 4, 0, 0]}>
            <LabelList dataKey="count" position="top" style={{ fontSize: 11, fill: ink.axis }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── 7. Department comparison ────────────────────────────────────────────────

export function DepartmentChart({ rows }: { rows: GroupRow[] }) {
  const { isDark } = useTheme();
  const ink = chartInk(isDark);
  const mode = isDark ? 'dark' : 'light';
  const data = rows.filter(r => r.record_count > 0).map(r => ({ ...r, label: shortName(r.name) }));
  if (data.length === 0) return <ChartEmpty message="No eligible records for the selected filters" />;
  const keys: KpiKey[] = ['efa', 'ebi', 'eei'];
  return (
    <>
      <Legend items={keys.map(k => ({ label: KPI_DEFS[k].short, color: KPI_COLORS[k][mode] }))} />
      <div className="h-[240px]" data-testid="department-chart">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 4 }} barGap={2}>
            <CartesianGrid vertical={false} stroke={ink.grid} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: ink.axis }} tickLine={false} axisLine={{ stroke: ink.baseline }} interval={0} />
            <YAxis tickFormatter={pctTick} tick={{ fontSize: 11, fill: ink.axis }} tickLine={false} axisLine={false} />
            <ReferenceLine y={0} stroke={ink.baseline} />
            <Tooltip cursor={{ fill: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(30,50,70,0.05)' }} content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const r = payload[0].payload as GroupRow;
              return <TipBox title={r.name} rows={[
                ...keys.map(k => ({ label: KPI_DEFS[k].short, value: r[k] == null ? NA : fmtPct(r[k]), color: KPI_COLORS[k][mode] })),
                { label: 'Records', value: String(r.record_count) },
              ]} />;
            }} />
            {keys.map(k => <Bar key={k} dataKey={k} name={KPI_DEFS[k].short} fill={KPI_COLORS[k][mode]} radius={[4, 4, 0, 0]} maxBarSize={28} />)}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="text-[11px] text-coolslate mt-1">EBI is N/A (no bar) for departments without a historical baseline.</p>
    </>
  );
}

// ─── Segmented control ───────────────────────────────────────────────────────

export function Segmented<T extends string>({ value, onChange, options, ariaLabel }: {
  value: T; onChange: (v: T) => void; options: { id: T; label: string; disabled?: boolean; title?: string }[]; ariaLabel?: string;
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="inline-flex rounded-lg border border-lgrayblue dark:border-slate-600 p-0.5 bg-white dark:bg-carbon-800">
      {options.map(o => (
        <button key={o.id} type="button" role="radio" aria-checked={value === o.id} disabled={o.disabled} title={o.title}
          onClick={() => onChange(o.id)}
          className={cn('px-2.5 py-1 text-xs font-medium rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed',
            value === o.id ? 'bg-carbon text-white dark:bg-lgrayblue dark:text-carbon' : 'text-coolslate hover:text-carbon dark:hover:text-white')}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export type { PerformanceDashboard };
