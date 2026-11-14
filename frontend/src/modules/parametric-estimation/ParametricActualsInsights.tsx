/**
 * Estimated vs Actual (PersonDays) KPIs and charts for Dashboard PE and Analytics PE.
 * PE convention: Variance = Estimated − Actual (positive = finished under estimate).
 */
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Target, Scale, ArrowDownRight, ArrowUpRight, Minus, Crosshair } from 'lucide-react';
import {
  ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis, ZAxis, Tooltip, CartesianGrid, ReferenceLine,
  BarChart, Bar, Cell, LabelList,
} from 'recharts';
import { parametricAnalysisApi } from '../../services/api';
import { StatCard, Card, EmptyState } from '../../components/ui';
import { useTheme } from '../../hooks/useTheme';
import { cn } from '../../utils/formatters';
import { fmt1 } from './ParametricActualsPanel';
import type { ParametricActualsPoint, ParametricAnalysisSummary } from '../../types';

/**
 * Status colours for accuracy bands — validated with the dataviz palette checker
 * (lightness band, chroma, CVD ΔE, normal-vision floor) separately for each surface.
 * Light: amber is < 3:1 vs the surface, so every band carries a visible text label + count.
 */
export const ACCURACY_STATUS = {
  light: { good: '#0F784D', fair: '#E0A100', poor: '#C02B1E' },
  dark:  { good: '#19AA6E', fair: '#B88800', poor: '#D0352A' },
} as const;

const fmtPD = (n: number) => `${n.toFixed(1)} PD`;

/** "+3.0 PD under" / "−2.5 PD over" / "On estimate" — sign and words, never colour alone. */
export function varianceLabel(v: number): string {
  if (Math.abs(v) < 0.05) return 'On estimate';
  return `${v > 0 ? '+' : '−'}${Math.abs(v).toFixed(1)} PD ${v > 0 ? 'under' : 'over'}`;
}

// ─── KPI row ─────────────────────────────────────────────────────────────────

export function ParametricActualsKpis({ summary, loading }: { summary?: ParametricAnalysisSummary; loading?: boolean }) {
  const s = summary;
  const completed = s?.completed_count ?? 0;
  const total = s?.total_estimations ?? 0;
  const hasActuals = completed > 0;
  return (
    <div className="space-y-3" data-testid="pe-actuals-kpis">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard label="Tasks with Actuals" loading={loading} color="bg-gradient-primary" icon={<CheckCircle2 size={18} />}
          value={`${completed} / ${total}`} />
        <StatCard label="Avg Accuracy" loading={loading} color="bg-gradient-success" icon={<Target size={18} />}
          value={hasActuals && s?.avg_accuracy_percent != null ? `${fmt1(s.avg_accuracy_percent)}%` : 'Not Available'} />
        <StatCard label="Estimated vs Actual (completed)" loading={loading} color="bg-gradient-gold" icon={<Scale size={18} />}
          value={hasActuals ? `${s!.estimated_completed_days.toFixed(1)} / ${s!.actual_total_days.toFixed(1)} PD` : '—'} />
        <StatCard label="Total Variance (Est − Act)" loading={loading} color="bg-gradient-danger" icon={<Crosshair size={18} />}
          value={hasActuals ? varianceLabel(s!.total_variance_days) : '—'} />
      </div>
      {hasActuals && !loading && <OutcomeSplit summary={s!} />}
    </div>
  );
}

/** Under / on / over estimate split — a segmented bar with labelled counts and icons. */
function OutcomeSplit({ summary }: { summary: ParametricAnalysisSummary }) {
  const { isDark } = useTheme();
  const c = isDark ? ACCURACY_STATUS.dark : ACCURACY_STATUS.light;
  const total = summary.completed_count || 1;
  const parts = [
    { key: 'under', label: 'Under estimate', count: summary.under_estimate_count, color: c.good, icon: <ArrowDownRight size={12} /> },
    { key: 'on',    label: 'On estimate',    count: summary.on_target_count,      color: isDark ? '#788291' : '#4B5A69', icon: <Minus size={12} /> },
    { key: 'over',  label: 'Over estimate',  count: summary.over_estimate_count,  color: c.poor, icon: <ArrowUpRight size={12} /> },
  ];
  return (
    <Card padding="p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <p className="text-sm font-semibold text-carbon dark:text-white">Estimate outcome</p>
        <p className="text-xs text-coolslate">
          {summary.completed_count} completed · avg deviation {summary.avg_deviation_percent != null ? `${fmt1(summary.avg_deviation_percent)}%` : '—'}
        </p>
      </div>
      <div className="flex h-2.5 w-full gap-[2px] rounded-full overflow-hidden" role="img"
        aria-label={parts.map(p => `${p.label}: ${p.count}`).join(', ')}>
        {parts.filter(p => p.count > 0).map(p => (
          <div key={p.key} style={{ width: `${(p.count / total) * 100}%`, background: p.color }} title={`${p.label}: ${p.count}`} />
        ))}
      </div>
      <ul className="flex flex-wrap gap-x-5 gap-y-1 mt-2.5">
        {parts.map(p => (
          <li key={p.key} className="flex items-center gap-1.5 text-xs text-carbon dark:text-lgrayblue">
            <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: p.color }} aria-hidden />
            <span className="text-coolslate">{p.icon}</span>
            {p.label} <span className="font-semibold">{p.count}</span>
            <span className="text-coolslate">({Math.round((p.count / total) * 100)}%)</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

// ─── Charts (Analytics PE) ───────────────────────────────────────────────────

function ScatterTip({ active, payload }: { active?: boolean; payload?: { payload: ParametricActualsPoint }[] }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-lg border border-lgrayblue/40 dark:border-slate-600 bg-white dark:bg-carbon-800 px-3 py-2 shadow-modal text-xs space-y-0.5">
      <p className="font-semibold text-carbon dark:text-white max-w-[14rem] truncate">{p.task_title}</p>
      <p className="text-coolslate">Estimated <span className="text-carbon dark:text-white font-medium">{fmtPD(p.estimated_days)}</span></p>
      <p className="text-coolslate">Actual <span className="text-carbon dark:text-white font-medium">{fmtPD(p.actual_days)}</span></p>
      <p className="text-coolslate">Variance <span className="text-carbon dark:text-white font-medium">{varianceLabel(p.variance_days)}</span></p>
      <p className="text-coolslate">Accuracy <span className="text-carbon dark:text-white font-medium">{p.accuracy_percent == null ? 'N/A' : `${fmt1(p.accuracy_percent)}%`}</span></p>
    </div>
  );
}

export function ParametricActualsCharts({ params, queryKey }: { params: Record<string, unknown>; queryKey: unknown[] }) {
  const { isDark } = useTheme();
  const status = isDark ? ACCURACY_STATUS.dark : ACCURACY_STATUS.light;
  const ink = isDark ? '#C5CDD7' : '#1E3246';
  const muted = isDark ? '#9EAEBE' : '#788291';
  const grid = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(30,50,70,0.08)';

  const { data, isLoading } = useQuery({
    queryKey: ['parametric-actuals', ...queryKey],
    queryFn: () => parametricAnalysisApi.getActuals(params),
    retry: false,
  });
  const points = data?.points ?? [];
  const max = Math.ceil(Math.max(1, ...points.map(p => Math.max(p.estimated_days, p.actual_days))) * 1.1);
  const bandColor = [status.good, status.fair, status.poor];
  const bands = (data?.accuracy_bands ?? []).map((b, i) => ({ ...b, color: bandColor[i], name: ['High', 'Fair', 'Low'][i] + ` (${b.band})` }));

  if (!isLoading && points.length === 0) {
    return (
      <Card padding="p-5">
        <EmptyState icon={<Target size={26} />} title="No actual effort recorded yet"
          message="Record actual PersonDays on completed tasks (Historical Data PE → task details) to compare estimates with reality." />
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-5" data-testid="pe-actuals-charts">
      <Card className="xl:col-span-2" padding="p-5">
        <p className="text-sm font-semibold text-carbon dark:text-white">Estimated vs Actual PersonDays</p>
        <p className="text-xs text-coolslate mb-3">Each dot is a completed task. Above the dashed line = took longer than estimated; below = finished early.</p>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 8, right: 16, bottom: 24, left: 4 }}>
              <CartesianGrid stroke={grid} />
              <XAxis type="number" dataKey="estimated_days" name="Estimated" domain={[0, max]} tick={{ fill: muted, fontSize: 11 }}
                stroke={grid} label={{ value: 'Estimated (PD)', position: 'insideBottom', offset: -12, fill: muted, fontSize: 11 }} />
              <YAxis type="number" dataKey="actual_days" name="Actual" domain={[0, max]} tick={{ fill: muted, fontSize: 11 }}
                stroke={grid} width={44} label={{ value: 'Actual (PD)', angle: -90, position: 'insideLeft', fill: muted, fontSize: 11 }} />
              <ZAxis range={[64, 64]} />
              <ReferenceLine segment={[{ x: 0, y: 0 }, { x: max, y: max }]} stroke={muted} strokeDasharray="4 4" strokeWidth={1.5}
                label={{ value: 'On estimate', position: 'insideTopLeft', fill: muted, fontSize: 11 }} ifOverflow="extendDomain" />
              <Tooltip content={<ScatterTip />} cursor={{ strokeDasharray: '3 3', stroke: muted }} />
              <Scatter data={points} fill={ink} stroke={isDark ? '#17263A' : '#FFFFFF'} strokeWidth={2} isAnimationActive={false} />
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card padding="p-5">
        <p className="text-sm font-semibold text-carbon dark:text-white">Accuracy distribution</p>
        <p className="text-xs text-coolslate mb-3">Completed tasks by accuracy band</p>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={bands} layout="vertical" margin={{ top: 4, right: 36, bottom: 4, left: 4 }} barCategoryGap={6}>
              <XAxis type="number" allowDecimals={false} hide />
              <YAxis type="category" dataKey="name" width={104} tick={{ fill: ink, fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip cursor={{ fill: grid }} formatter={(v: number) => [`${v} task${v === 1 ? '' : 's'}`, 'Count']}
                contentStyle={{ background: isDark ? '#101B2C' : '#fff', border: `1px solid ${grid}`, borderRadius: 8, fontSize: 12 }} />
              <Bar dataKey="count" radius={[0, 4, 4, 0]} isAnimationActive={false} maxBarSize={28}>
                {bands.map(b => <Cell key={b.band} fill={b.color} />)}
                <LabelList dataKey="count" position="right" fill={ink} fontSize={12} fontWeight={600} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className={cn('text-[11px] text-coolslate mt-2')}>High ≥ 85% · Fair 70–85% · Low &lt; 70%. Task-level values are in the breakdown table below.</p>
      </Card>
    </div>
  );
}
