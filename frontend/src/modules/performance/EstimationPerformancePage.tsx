import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Gauge, CalendarRange, RotateCcw, AlertCircle, Download, Database, SlidersHorizontal, Camera, Info, X, TrendingUp, Target,
} from 'lucide-react';
import { Button, Card, MultiSelect, Skeleton } from '../../components/ui';
import { SearchableSelect } from '../../components/ui/SearchableSelect';
import { performanceApi, hierarchyApi } from '../../services/api';
import { useAuthStore } from '../../store/authStore';
import { programsForDepartment, useHierarchyStore } from '../../store/hierarchyStore';
import { cn } from '../../utils/formatters';
import {
  addDaysISO, browserTimeZone, formatDisplayDate, hasErrors, toISODate, validateActivityRange, type DateRange,
} from '../../components/dashboard/activityRange';
import { KpiTile } from './KpiTile';
import {
  ChartCard, DepartmentChart, DirectionChart, DistributionChart, EdDeviationChart, EfaEeiTrendChart,
  HistoricalVsCurrentChart, ProgramPerformanceChart, Segmented,
} from './PerformanceCharts';
import { BreakdownPanel, drillParams, type DrillStep } from './BreakdownPanel';
import { KpiDetailDrawer } from './KpiDetailDrawer';
import { HistoricalBaselinesModal, KpiSettingsModal, SnapshotsModal } from './PerformanceAdmin';
import { csvNum, downloadCsv, fmtNum, fmtPct, fmtPd, fmtPp, KPI_DEFS, KPI_ORDER, sourceLabel, toCsv } from './kpiFormat';
import type { GroupRow, KpiKey, MethodFilter, PerformanceDashboard, PerfGroupBy } from './types';

const DEFAULT_DAYS = 90;

const inputCls = (err?: string) => cn(
  'w-full rounded-lg border text-sm px-3 py-1.5 bg-white dark:bg-carbon-800 text-carbon dark:text-white focus:outline-none focus:ring-2 [color-scheme:light] dark:[color-scheme:dark]',
  err ? 'border-vibrant focus:ring-vibrant/30' : 'border-lgrayblue dark:border-slate-600 focus:ring-carbon/20',
);

export function rangeForDays(days: number, today: string = toISODate(new Date())): DateRange {
  return { from: addDaysISO(today, -(days - 1)), to: today };
}

/** Breakdown starting level for the current filters. */
export function rootLevelFor(f: { departmentId: string | null; programIds: string[]; baselineId: string | null }): PerfGroupBy {
  if (f.baselineId) return 'task';
  if (f.programIds.length === 1) return 'baseline';
  if (f.departmentId || f.programIds.length > 1) return 'program';
  return 'department';
}

function errorMessage(err: unknown): string {
  const e = err as { response?: { data?: { error?: string } }; message?: string };
  return e?.response?.data?.error || e?.message || 'Could not load the Estimation Performance dashboard';
}

function Indicator({ label, value, hint, testId }: { label: string; value: string; hint?: string; testId?: string }) {
  return (
    <div className="rounded-xl border border-lgrayblue/40 dark:border-slate-700 bg-white dark:bg-carbon-700 px-3.5 py-3" data-testid={testId}>
      <p className="text-[11px] text-coolslate">{label}</p>
      <p className="text-base font-display font-semibold tabular-nums text-carbon dark:text-white mt-0.5 truncate" title={value}>{value}</p>
      {hint && <p className="text-[10.5px] text-coolslate mt-0.5 truncate" title={hint}>{hint}</p>}
    </div>
  );
}

function RankList({ title, icon, rows, metric, empty }: { title: string; icon: React.ReactNode; rows: GroupRow[]; metric: 'aggregate_ed' | 'ebi'; empty: string }) {
  return (
    <ChartCard title={title} subtitle={metric === 'aggregate_ed' ? 'Highest aggregate absolute deviation' : 'Largest EBI vs historical baseline'}>
      {rows.length === 0 ? <p className="text-xs text-coolslate py-6 text-center">{empty}</p> : (
        <ol className="space-y-2">
          {rows.map((r, i) => (
            <li key={`${r.id}-${i}`} className="flex items-center gap-3 text-xs">
              <span className="w-5 h-5 rounded-full bg-lgrayblue/40 dark:bg-slate-700 flex items-center justify-center text-[10px] font-semibold text-carbon dark:text-white">{i + 1}</span>
              <span className="flex-1 min-w-0">
                <span className="block font-medium text-carbon dark:text-white truncate">{r.name}</span>
                <span className="block text-[10.5px] text-coolslate truncate">{r.department_name ?? 'Unassigned'} · {r.record_count} records</span>
              </span>
              <span className="inline-flex items-center gap-1 tabular-nums font-semibold text-carbon dark:text-white">
                {icon}{metric === 'aggregate_ed' ? fmtPct(r.aggregate_ed, 1) : fmtPct(r.ebi, 1)}
              </span>
            </li>
          ))}
        </ol>
      )}
    </ChartCard>
  );
}

export default function EstimationPerformancePage() {
  const hasPermission = useAuthStore(s => s.hasPermission);
  const hasModule = useAuthStore(s => s.hasModule);
  const canSp = hasModule('SP') && hasPermission('estimation.read');
  const canPe = hasModule('PE') && hasPermission('parametric.read');
  const canManage = hasPermission('performance.baseline.manage');

  // ── Global Department / Program context (header) ──
  const departments = useHierarchyStore(s => s.departments);
  const allPrograms = useHierarchyStore(s => s.programs);
  const departmentId = useHierarchyStore(s => s.selectedDepartmentId);
  const headerProgramId = useHierarchyStore(s => s.selectedProgramId);
  const setDepartment = useHierarchyStore(s => s.setSelectedDepartment);
  const programOptions = useMemo(() => programsForDepartment(allPrograms, departmentId), [allPrograms, departmentId]);

  const [programIds, setProgramIds] = useState<string[]>(headerProgramId ? [headerProgramId] : []);
  const [baselineId, setBaselineId] = useState<string | null>(null);
  useEffect(() => { setProgramIds(headerProgramId ? [headerProgramId] : []); }, [headerProgramId, departmentId]);
  useEffect(() => { setBaselineId(null); }, [programIds.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  const singleProgram = programIds.length === 1 ? programIds[0] : null;
  const baselines = useQuery({
    queryKey: ['lookup', 'baselines', singleProgram],
    queryFn: () => hierarchyApi.baselines(singleProgram!),
    enabled: !!singleProgram,
  });

  const [method, setMethod] = useState<MethodFilter>(canSp && canPe ? 'BOTH' : canSp ? 'SP' : 'PE');

  // ── Date range ──
  const settings = useQuery({ queryKey: ['performance', 'settings'], queryFn: performanceApi.settings });
  const defaultDays = settings.data?.default_range_days ?? DEFAULT_DAYS;
  const today = toISODate(new Date());
  const tz = useMemo(browserTimeZone, []);
  const [draft, setDraft] = useState<DateRange>(() => rangeForDays(DEFAULT_DAYS, today));
  const [applied, setApplied] = useState<DateRange>(() => rangeForDays(DEFAULT_DAYS, today));
  const [rangeTouched, setRangeTouched] = useState(false);
  const userChangedRange = useRef(false);
  useEffect(() => {
    if (settings.data && !userChangedRange.current) {
      const r = rangeForDays(settings.data.default_range_days, toISODate(new Date()));
      setDraft(r); setApplied(r);
    }
  }, [settings.data]);
  const rangeErrors = validateActivityRange(draft, today);
  const rangeInvalid = hasErrors(rangeErrors);
  const rangeDirty = draft.from !== applied.from || draft.to !== applied.to;
  const rangeMsg = (rangeTouched || rangeDirty) ? (rangeErrors.from || rangeErrors.to) : undefined;
  const applyRange = (e?: FormEvent) => {
    e?.preventDefault(); setRangeTouched(true);
    if (rangeInvalid) return;
    userChangedRange.current = true; setApplied(draft);
  };
  const resetRange = () => {
    const r = rangeForDays(defaultDays, toISODate(new Date()));
    userChangedRange.current = false; setDraft(r); setApplied(r); setRangeTouched(false);
  };

  const scope = useMemo(() => ({
    ...(departmentId ? { departmentId } : {}),
    ...(programIds.length ? { programIds: programIds.join(',') } : {}),
    ...(baselineId ? { baselineId } : {}),
    from: applied.from, to: applied.to, tz, method,
  }), [departmentId, programIds, baselineId, applied, tz, method]);

  const live = useQuery({
    queryKey: ['performance', 'dashboard', JSON.stringify(scope)],
    queryFn: () => performanceApi.dashboard(scope),
    retry: false,
    placeholderData: (prev) => prev,
  });

  // ── Snapshot viewing ──
  const [snapshotId, setSnapshotId] = useState<string | null>(null);
  const snapshot = useQuery({
    queryKey: ['performance', 'snapshot', snapshotId],
    queryFn: () => performanceApi.snapshot(snapshotId!),
    enabled: !!snapshotId,
  });
  const viewingSnapshot = !!snapshotId && !!snapshot.data;
  const data: PerformanceDashboard | undefined = viewingSnapshot ? snapshot.data!.result : live.data;

  // ── UI state ──
  const [detail, setDetail] = useState<KpiKey | null>(null);
  const [path, setPath] = useState<DrillStep[]>([]);
  const [showBaselines, setShowBaselines] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showSnapshots, setShowSnapshots] = useState(false);
  const breakdownRef = useRef<HTMLDivElement>(null);
  useEffect(() => { setPath([]); }, [JSON.stringify(scope)]); // eslint-disable-line react-hooks/exhaustive-deps

  const rootLevel = rootLevelFor({ departmentId, programIds, baselineId });
  const drillFromProgram = (row: GroupRow) => {
    const p = drillParams('program', row);
    if (!p) return;
    // The ED chart is per program; continue the drill-down from that program's baselines.
    const prefix: DrillStep[] = rootLevel === 'department' && row.department_id
      ? [{ level: 'department', label: row.department_name ?? 'Department', params: { departmentId: row.department_id } }] : [];
    if (rootLevel === 'department' || rootLevel === 'program') {
      setPath([...prefix, { level: 'program', label: row.name, params: p }]);
      breakdownRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const exportSummary = () => {
    if (!data) return;
    const s = data.summary;
    const lines: { metric: string; value: string; detail: string }[] = [
      { metric: 'EFA %', value: csvNum(s.efa.value), detail: `Framework Aggregate ED ${csvNum(s.efa.framework_aggregate_ed)}%; ${s.framework.record_count} framework records` },
      { metric: 'ED %', value: csvNum(s.ed.value), detail: `Absolute ${csvNum(s.ed.absolute)}%; ${s.ed.under_count} under / ${s.ed.on_target_count} on target / ${s.ed.over_count} over` },
      { metric: 'EBI %', value: csvNum(s.ebi.value), detail: s.ebi.value == null ? `N/A: ${s.ebi.na_reason}` : `Historical ${csvNum(s.ebi.historical_ed)}% → Current ${csvNum(s.ebi.current_ed)}%` },
      { metric: 'EEI %', value: csvNum(s.eei.value), detail: `Aggregate ED ${csvNum(s.eei.aggregate_ed)}%; ${s.eligible.record_count} eligible records` },
      { metric: 'Total Estimated PD', value: csvNum(data.indicators.total_estimated_pd), detail: '' },
      { metric: 'Total Actual PD', value: csvNum(data.indicators.total_actual_pd), detail: '' },
      { metric: 'Total Absolute Error PD', value: csvNum(data.indicators.total_abs_error_pd), detail: '' },
      { metric: 'Average Deviation %', value: csvNum(data.indicators.average_deviation), detail: 'mean task-level |ED|' },
      { metric: 'Underestimation Rate %', value: csvNum(data.indicators.underestimation_rate), detail: '' },
      { metric: 'Overestimation Rate %', value: csvNum(data.indicators.overestimation_rate), detail: '' },
      { metric: 'On-Target Rate %', value: csvNum(data.indicators.on_target_rate), detail: `±${data.meta.settings.on_target_tolerance}%` },
      { metric: 'Actuals Coverage %', value: csvNum(data.indicators.actuals_coverage), detail: `${data.coverage.with_actuals} of ${data.coverage.total_records} records` },
      { metric: 'Data Completeness %', value: csvNum(data.indicators.data_completeness), detail: '' },
      { metric: 'Framework Adoption Rate %', value: csvNum(data.indicators.framework_adoption_rate), detail: '' },
      { metric: 'Calibration Gap (pp)', value: csvNum(data.indicators.calibration_gap), detail: 'Historical ED − Current ED' },
      { metric: 'Period', value: `${data.meta.from} to ${data.meta.to}`, detail: data.meta.timezone },
      { metric: 'Methods', value: data.meta.methods.join(' + '), detail: sourceLabel(data.meta.methods) },
    ];
    downloadCsv(`estimation-performance-${data.meta.from}-${data.meta.to}.csv`,
      toCsv(lines, [{ header: 'Metric', value: r => r.metric }, { header: 'Value', value: r => r.value }, { header: 'Detail', value: r => r.detail }]));
  };

  const methodOptions: { id: MethodFilter; label: string; disabled?: boolean; title?: string }[] = [
    { id: 'BOTH', label: 'Both', disabled: !(canSp && canPe), title: !(canSp && canPe) ? 'Requires access to both SP and PE' : undefined },
    { id: 'SP', label: 'Story Point', disabled: !canSp },
    { id: 'PE', label: 'Parametric', disabled: !canPe },
  ];

  return (
    <div className="space-y-5" data-testid="estimation-performance">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Gauge size={20} className="text-carbon dark:text-white" />
            <h1 className="text-xl font-display font-bold text-carbon dark:text-white">Estimation Performance Dashboard</h1>
          </div>
          <p className="text-sm text-coolslate mt-1 max-w-3xl">
            Accuracy, deviation, improvement and effectiveness of estimation (EFA · ED · EBI · EEI) from Historical Data SP and PE,
            on a common PersonDay basis.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" icon={<Database size={14} />} onClick={() => setShowBaselines(true)}>Historical Baselines</Button>
          <Button size="sm" variant="outline" icon={<SlidersHorizontal size={14} />} onClick={() => setShowSettings(true)} disabled={!settings.data}>Thresholds</Button>
          <Button size="sm" variant="outline" icon={<Camera size={14} />} onClick={() => setShowSnapshots(true)}>Snapshots</Button>
          <Button size="sm" icon={<Download size={14} />} onClick={exportSummary} disabled={!data}>Export</Button>
        </div>
      </div>

      {/* Filters */}
      <Card padding="p-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[1fr_1.4fr_1fr_auto]" data-testid="performance-filters">
          <SearchableSelect label="Department" options={departments.map(d => ({ id: d.id, label: d.name }))} value={departmentId}
            onChange={setDepartment} allOptionLabel="All departments" size="sm" testId="perf-department" disabled={viewingSnapshot} />
          <div>
            <span className="block text-sm font-medium text-carbon dark:text-lgrayblue mb-1.5">Programs</span>
            <MultiSelect options={programOptions.map(p => ({ id: p.id, label: p.name }))} selected={programIds} onChange={setProgramIds}
              placeholder={departmentId ? 'All programs in department' : 'All programs'} emptyMessage="No programs" />
          </div>
          <SearchableSelect label="Baseline" options={(baselines.data ?? []).map(b => ({ id: b.id, label: b.name }))} value={baselineId}
            onChange={setBaselineId} allOptionLabel="All baselines" size="sm" loading={baselines.isLoading && !!singleProgram}
            disabled={!singleProgram || viewingSnapshot} disabledHint="Select exactly one program" testId="perf-baseline" />
          <div>
            <span className="block text-sm font-medium text-carbon dark:text-lgrayblue mb-1.5">Estimation method</span>
            <Segmented value={method} onChange={setMethod} options={methodOptions} ariaLabel="Estimation method" />
          </div>
        </div>
        <form onSubmit={applyRange} noValidate className="flex flex-wrap items-end gap-2 mt-3" aria-label="Reporting period">
          <label className="flex flex-col gap-1 text-[11px] font-medium text-coolslate w-full sm:w-40">
            From Date
            <input type="date" aria-label="From Date" value={draft.from} max={draft.to && draft.to < today ? draft.to : today}
              aria-invalid={Boolean(rangeErrors.from && rangeMsg)} className={inputCls(rangeMsg && rangeErrors.from)}
              onChange={e => setDraft(d => ({ ...d, from: e.target.value }))} />
          </label>
          <label className="flex flex-col gap-1 text-[11px] font-medium text-coolslate w-full sm:w-40">
            To Date
            <input type="date" aria-label="To Date" value={draft.to} min={draft.from || undefined} max={today}
              aria-invalid={Boolean(rangeErrors.to && rangeMsg)} className={inputCls(rangeMsg && rangeErrors.to)}
              onChange={e => setDraft(d => ({ ...d, to: e.target.value }))} />
          </label>
          <Button type="submit" size="xs" icon={<CalendarRange size={13} />} disabled={rangeInvalid || !rangeDirty} loading={live.isFetching && !live.isLoading}>Apply</Button>
          <Button type="button" size="xs" variant="outline" icon={<RotateCcw size={13} />} onClick={resetRange}>Reset</Button>
          {rangeMsg && <p role="alert" className="text-xs text-vibrant flex items-center gap-1 w-full"><AlertCircle size={12} />{rangeMsg}</p>}
        </form>
      </Card>

      {viewingSnapshot && (
        <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-gold/40 bg-gold/10 px-4 py-2.5 text-sm text-carbon dark:text-white">
          <span>Viewing snapshot <strong>{snapshot.data!.label}</strong> · saved {new Date(snapshot.data!.created_at).toLocaleString()} · {snapshot.data!.result.meta.from} → {snapshot.data!.result.meta.to}</span>
          <Button size="xs" variant="outline" icon={<X size={12} />} onClick={() => setSnapshotId(null)}>Back to live</Button>
        </div>
      )}

      {live.isError && !viewingSnapshot ? (
        <Card><div className="flex items-center gap-2 text-sm text-vibrant" role="alert"><AlertCircle size={16} />{errorMessage(live.error)}</div></Card>
      ) : !data ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{KPI_ORDER.map(k => <Skeleton key={k} className="h-40 rounded-2xl" />)}</div>
      ) : (
        <>
          {/* Scope line */}
          <p className="text-xs text-coolslate flex flex-wrap items-center gap-x-2 gap-y-1" data-testid="perf-scope">
            <Info size={12} />
            <span><strong className="text-carbon dark:text-white">{data.summary.eligible.record_count}</strong> eligible records
              {data.meta.methods.length > 1 && <> (SP {data.summary.by_method.SP.record_count} · PE {data.summary.by_method.PE.record_count})</>}
              {' '}completed {formatDisplayDate(data.meta.from)} – {formatDisplayDate(data.meta.to)} · {sourceLabel(data.meta.methods)} · PersonDays (SP hours ÷ {data.meta.sp_hours_per_pd})
              {data.meta.excluded_records > 0 && <> · {data.meta.excluded_records} excluded (no estimate / actual)</>}
            </span>
          </p>

          {/* KPI tiles */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" data-testid="kpi-tiles">
            {KPI_ORDER.map(k => <KpiTile key={k} kpi={k} data={data} onOpen={setDetail} />)}
          </div>

          {data.summary.eligible.record_count === 0 && (
            <Card><p className="text-sm text-coolslate text-center" data-testid="perf-no-records">
              No eligible records for the selected filters — every KPI shows N/A. Eligible records need an approved estimate and recorded actual effort,
              completed between {formatDisplayDate(data.meta.from)} and {formatDisplayDate(data.meta.to)}.
            </p></Card>
          )}

          {/* Additional indicators */}
          <div className="grid gap-3 grid-cols-2 md:grid-cols-4 xl:grid-cols-7" data-testid="perf-indicators">
            <Indicator label="Total Estimated PD" value={fmtNum(data.indicators.total_estimated_pd)} />
            <Indicator label="Total Actual PD" value={fmtNum(data.indicators.total_actual_pd)} />
            <Indicator label="Total Absolute Error" value={fmtPd(data.indicators.total_abs_error_pd)} />
            <Indicator label="Average Deviation" value={fmtPct(data.indicators.average_deviation)} hint="Mean task-level |ED|" />
            <Indicator label="Underestimation Rate" value={fmtPct(data.indicators.underestimation_rate, 1)} hint={`${data.summary.ed.under_count} task(s)`} />
            <Indicator label="Overestimation Rate" value={fmtPct(data.indicators.overestimation_rate, 1)} hint={`${data.summary.ed.over_count} task(s)`} />
            <Indicator label="On-Target Rate" value={fmtPct(data.indicators.on_target_rate, 1)} hint={`within ±${data.meta.settings.on_target_tolerance}%`} />
            <Indicator label="Actuals Coverage" value={fmtPct(data.indicators.actuals_coverage, 1)} hint={`${data.coverage.with_actuals} of ${data.coverage.total_records} records`} testId="ind-coverage" />
            <Indicator label="Data Completeness" value={fmtPct(data.indicators.data_completeness, 1)} hint="Hierarchy + estimate + actual" />
            <Indicator label="Framework Adoption" value={fmtPct(data.indicators.framework_adoption_rate, 1)} hint={`${data.summary.framework.record_count} of ${data.summary.eligible.record_count} eligible`} />
            <Indicator label="Calibration Gap" value={fmtPp(data.indicators.calibration_gap)} hint="Historical ED − Current ED" />
            <Indicator label="Best Program" value={data.indicators.best_program?.name ?? 'N/A'} hint={data.indicators.best_program ? `Aggregate ED ${fmtPct(data.indicators.best_program.aggregate_ed, 1)}` : undefined} />
            <Indicator label="Highest Deviation" value={data.indicators.highest_deviation_program?.name ?? 'N/A'} hint={data.indicators.highest_deviation_program ? `Aggregate ED ${fmtPct(data.indicators.highest_deviation_program.aggregate_ed, 1)}` : undefined} />
            <Indicator label="Best Department" value={data.indicators.best_department?.name ?? 'N/A'} hint={data.indicators.best_department ? `EEI ${fmtPct(data.indicators.best_department.eei, 1)}` : undefined} />
          </div>

          {/* ED deviation */}
          <ChartCard title="ED Deviation by Program" testId="ed-deviation-card"
            subtitle={`Signed ED = (Estimate − Actual) / Estimate · ${formatDisplayDate(data.meta.from)} – ${formatDisplayDate(data.meta.to)}${viewingSnapshot ? '' : ' · click a bar to drill down'}`}>
            <EdDeviationChart rows={data.by_program} tolerance={data.meta.settings.on_target_tolerance} onDrill={viewingSnapshot ? undefined : drillFromProgram} />
          </ChartCard>

          <div className="grid gap-4 xl:grid-cols-2">
            <HistoricalVsCurrentChart byProgram={data.by_program} byDepartment={data.by_department} />
            <ChartCard title="EFA and EEI Trend" subtitle={`${data.meta.interval === 'day' ? 'Daily' : data.meta.interval === 'week' ? 'Weekly' : 'Monthly'} framework accuracy and overall effectiveness`}>
              <EfaEeiTrendChart points={data.trend} interval={data.meta.interval} />
            </ChartCard>
            <ProgramPerformanceChart rows={data.by_program} />
            <ChartCard title="Underestimation vs Overestimation" subtitle="Task count and effort deviation by direction">
              <DirectionChart ed={data.summary.ed} />
            </ChartCard>
            <ChartCard title="Estimation Accuracy Distribution" subtitle="Completed tasks by |ED| range">
              <DistributionChart buckets={data.distribution} />
            </ChartCard>
            <ChartCard title="Department-wise Performance" subtitle={`${KPI_DEFS.efa.short}, ${KPI_DEFS.ebi.short} and ${KPI_DEFS.eei.short} by department`}>
              <DepartmentChart rows={data.by_department} />
            </ChartCard>
            <RankList title="Top 5 Programs Requiring Calibration" icon={<Target size={12} className="text-coolslate" />} metric="aggregate_ed"
              rows={data.indicators.improvement_opportunities} empty="No programs with eligible records." />
            <RankList title="Top 5 Programs Showing Improvement" icon={<TrendingUp size={12} className="text-coolslate" />} metric="ebi"
              rows={data.indicators.top_improving_programs} empty="EBI needs a historical baseline for at least one program." />
          </div>

          <div ref={breakdownRef} className="scroll-mt-4">
            <BreakdownPanel scope={scope} path={path} onPathChange={setPath} rootLevel={rootLevel} disabled={viewingSnapshot} />
          </div>
        </>
      )}

      {data && <KpiDetailDrawer kpi={detail} data={data} scope={scope} live={!viewingSnapshot} onClose={() => setDetail(null)} />}
      <HistoricalBaselinesModal isOpen={showBaselines} onClose={() => setShowBaselines(false)} canManage={canManage} />
      {settings.data && <KpiSettingsModal isOpen={showSettings} onClose={() => setShowSettings(false)} settings={settings.data} canManage={canManage} />}
      <SnapshotsModal isOpen={showSnapshots} onClose={() => setShowSnapshots(false)} filters={scope}
        onView={(id) => { setSnapshotId(id); setShowSnapshots(false); }} />
    </div>
  );
}
