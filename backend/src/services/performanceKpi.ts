/**
 * Estimation Performance KPI engine — EFA, ED, EBI, EEI.  Pure functions, no I/O.
 *
 * Every value is derived from eligible estimation records converted to PersonDays (PD):
 *   SP  estimate = approved estimated_hours (falls back to the framework's revised_min_hours, as when actuals
 *                  are recorded) ÷ 8;  actual = actual_hours ÷ 8
 *   PE  estimate = final_estimation (PD);  actual = actual_days (PD)
 * Story Points are never added to PersonDays.
 *
 *   Aggregate ED (%)           = Σ|E − A| / ΣE × 100           (absolute: errors never cancel)
 *   ED (%)                     = (E − A) / E × 100              (signed: + over-estimate, − under-estimate)
 *   EFA (%)                    = 100 − Framework Aggregate ED   (framework-aligned records only)
 *   EEI (%)                    = 100 − Aggregate ED             (every eligible record)
 *   EBI (%)                    = (Historical ED − Current ED) / Historical ED × 100
 *                                Historical ED = governed pre-framework baseline (without framework)
 *                                Current ED    = framework-aligned records on the same scope (with framework)
 *
 * No value is capped: EBI may be negative (deterioration) or > 100 % only if current ED is negative, which
 * cannot happen for absolute ED — but it is not clamped either. Undefined values are null, never 0.
 */

export type Method = 'SP' | 'PE';
export const METHODS: Method[] = ['SP', 'PE'];
export const SP_HOURS_PER_PD = 8;

export interface PerfRecord {
  method: Method;
  id: string;
  title: string;
  department_id: string | null;
  department_name: string | null;
  program_id: string | null;
  program_name: string | null;
  baseline_id: string | null;
  baseline_name: string | null;
  estimated_pd: number;
  actual_pd: number;
  /** Approved estimate equals the framework's calibrated output (see isFrameworkAligned). */
  framework_aligned: boolean;
  completed_at: string;
  source: string;
}

export interface HistoricalBaseline {
  id: string;
  version: number;
  label: string;
  department_id: string;
  department_name?: string | null;
  program_id: string | null;
  program_name?: string | null;
  estimation_method: Method | 'ALL';
  record_count: number;
  total_estimated_pd: number;
  total_actual_pd: number;
  total_abs_error_pd: number;
  period_from?: string | null;
  period_to?: string | null;
}

export interface KpiSettings {
  /** |ED| ≤ tolerance → on target. */
  on_target_tolerance: number;
  /** Upper bounds of the |ED| histogram buckets; a final "> last" bucket is added. */
  distribution_bounds: number[];
  /** Status thresholds. EFA / EEI: higher is better. ED: |ED| lower is better. EBI: higher is better. */
  thresholds: {
    efa: { good: number; warning: number };
    eei: { good: number; warning: number };
    ed:  { good: number; warning: number };
    ebi: { good: number; warning: number };
  };
  default_range_days: number;
}

export const DEFAULT_KPI_SETTINGS: KpiSettings = {
  on_target_tolerance: 5,
  distribution_bounds: [5, 10, 20, 30],
  thresholds: {
    efa: { good: 90, warning: 80 },
    eei: { good: 85, warning: 70 },
    ed:  { good: 10, warning: 20 },
    ebi: { good: 25, warning: 0 },
  },
  default_range_days: 90,
};

export type KpiStatus = 'good' | 'warning' | 'critical' | 'na';

const round = (n: number, dp = 2) => Math.round(n * 10 ** dp) / 10 ** dp;

// ─── Record level ────────────────────────────────────────────────────────────

/**
 * SP: the framework converts story points into a calibrated effort range (revised_min … revised_max hours).
 * An approved estimate inside that range (or none, which falls back to revised_min) is framework-aligned;
 * an estimate the team overrode outside the range is not the framework's estimate.
 * PE: final_estimation is always the engine's output (no manual override exists), so always aligned.
 */
export function isFrameworkAligned(
  method: Method, approved: number | null, rangeMin: number | null, rangeMax: number | null,
): boolean {
  if (method === 'PE') return true;
  if (approved == null) return true;
  if (rangeMin == null || rangeMax == null) return false;
  const eps = 0.005;
  return approved >= rangeMin - eps && approved <= rangeMax + eps;
}

/** Signed task-level ED; null when the estimate is not positive. */
export function signedEd(estimate: number, actual: number): number | null {
  if (!(estimate > 0)) return null;
  return ((estimate - actual) / estimate) * 100;
}

export type Direction = 'under' | 'over' | 'on_target';

export function classify(edPct: number, tolerance: number): Direction {
  if (Math.abs(edPct) <= tolerance + 1e-9) return 'on_target';
  return edPct < 0 ? 'under' : 'over';
}

// ─── Aggregation ─────────────────────────────────────────────────────────────

export interface Aggregate {
  record_count: number;
  total_estimated_pd: number;
  total_actual_pd: number;
  total_abs_error_pd: number;
  /** Σ(E − A): + over-estimated, − under-estimated. */
  total_signed_error_pd: number;
  /** Σ|E−A| / ΣE × 100 — null when ΣE ≤ 0 (no eligible records). */
  aggregate_ed: number | null;
  /** Σ(E−A) / ΣE × 100 — null when ΣE ≤ 0. */
  signed_ed: number | null;
}

export function aggregate(records: Pick<PerfRecord, 'estimated_pd' | 'actual_pd'>[]): Aggregate {
  let est = 0, act = 0, abs = 0;
  for (const r of records) {
    est += r.estimated_pd;
    act += r.actual_pd;
    abs += Math.abs(r.estimated_pd - r.actual_pd);
  }
  return {
    record_count: records.length,
    total_estimated_pd: est,
    total_actual_pd: act,
    total_abs_error_pd: abs,
    total_signed_error_pd: est - act,
    aggregate_ed: est > 0 ? (abs / est) * 100 : null,
    signed_ed: est > 0 ? ((est - act) / est) * 100 : null,
  };
}

export function historicalAggregate(entries: HistoricalBaseline[]) {
  const est = entries.reduce((s, b) => s + b.total_estimated_pd, 0);
  const act = entries.reduce((s, b) => s + b.total_actual_pd, 0);
  const abs = entries.reduce((s, b) => s + b.total_abs_error_pd, 0);
  return {
    entry_count: entries.length,
    record_count: entries.reduce((s, b) => s + b.record_count, 0),
    total_estimated_pd: est,
    total_actual_pd: act,
    total_abs_error_pd: abs,
    aggregate_ed: est > 0 ? (abs / est) * 100 : null,
  };
}

// ─── Historical ↔ current scope matching (EBI) ───────────────────────────────

const keyOf = (dept: string | null, prog: string | null) => `${dept ?? '-'}|${prog ?? '-'}`;

export interface EbiScopeOptions {
  /** A Program or (org) Baseline filter is applied → only program-level historical entries are comparable. */
  programLevelOnly: boolean;
  methods: Method[];
}

export interface EbiScope {
  entries: HistoricalBaseline[];
  /** Current records covered by those entries (same department/program and method). */
  comparable: PerfRecord[];
  /** Programs/departments that have current framework records but no historical baseline. */
  missing: { department_id: string | null; department_name: string | null; program_id: string | null; program_name: string | null; method: Method; record_count: number }[];
  /** Historical entries in scope with no current records to compare against (left out of EBI). */
  unmatched: HistoricalBaseline[];
}

/**
 * Picks the historical entries that match the current scope and the current records they are comparable to.
 *  • Per department: program-level entries when any exist (or when a Program/Baseline filter is applied),
 *    otherwise the department-level entry. Never both → no double counting.
 *  • Per method: an 'ALL' entry covers SP and PE; otherwise the method-specific entry covers only its method.
 *    For one key, 'ALL' wins when every selected method is requested and it exists.
 */
export function matchHistorical(
  current: PerfRecord[], baselines: HistoricalBaseline[], opts: EbiScopeOptions,
): EbiScope {
  const selected = new Set(opts.methods);
  const usable = baselines.filter(b => b.estimation_method === 'ALL' || selected.has(b.estimation_method));

  // Departments whose program-level entries take precedence.
  const deptHasProgramLevel = new Set(usable.filter(b => b.program_id).map(b => b.department_id));

  // key → (method → entry)
  const byKey = new Map<string, HistoricalBaseline[]>();
  for (const b of usable) {
    const programLevel = !!b.program_id;
    if (opts.programLevelOnly && !programLevel) continue;
    if (!programLevel && deptHasProgramLevel.has(b.department_id)) continue;
    const k = keyOf(b.department_id, b.program_id);
    byKey.set(k, [...(byKey.get(k) ?? []), b]);
  }

  // key → which entries are used and the methods each covers
  const plan = new Map<string, { entry: HistoricalBaseline; methods: Method[] }[]>();
  const covered = new Map<string, Set<Method>>();
  for (const [k, list] of byKey) {
    const all = list.find(b => b.estimation_method === 'ALL');
    const specific = list.filter(b => b.estimation_method !== 'ALL');
    const use = new Map<HistoricalBaseline, Method[]>();
    if (all && opts.methods.length === METHODS.length) {
      use.set(all, [...opts.methods]);
    } else {
      for (const m of opts.methods) {
        const s = specific.find(x => x.estimation_method === m) ?? all;
        if (s) use.set(s, [...(use.get(s) ?? []), m]);
      }
    }
    plan.set(k, [...use].map(([entry, methods]) => ({ entry, methods })));
    covered.set(k, new Set([...use.values()].flat()));
  }

  const comparable: PerfRecord[] = [];
  const hit = new Set<string>(); // "key|method" pairs that have comparable current records
  const missingMap = new Map<string, EbiScope['missing'][number]>();
  for (const r of current) {
    const progKey = keyOf(r.department_id, r.program_id);
    const deptKey = keyOf(r.department_id, null);
    const k = covered.has(progKey) ? progKey : deptKey;
    if (covered.get(k)?.has(r.method)) { comparable.push(r); hit.add(`${k}|${r.method}`); continue; }
    const mk = `${progKey}|${r.method}`;
    const m = missingMap.get(mk) ?? {
      department_id: r.department_id, department_name: r.department_name,
      program_id: r.program_id, program_name: r.program_name, method: r.method, record_count: 0,
    };
    m.record_count++;
    missingMap.set(mk, m);
  }

  // Comparable scope: a historical entry counts only when current records exist for its scope + method,
  // so programs that were not delivered in this period do not inflate or deflate the historical side.
  const chosen: HistoricalBaseline[] = [];
  const unmatched: HistoricalBaseline[] = [];
  for (const [k, uses] of plan) {
    for (const u of uses) (u.methods.some(m => hit.has(`${k}|${m}`)) ? chosen : unmatched).push(u.entry);
  }
  return { entries: chosen, comparable, missing: [...missingMap.values()], unmatched };
}

// ─── KPI calculation ─────────────────────────────────────────────────────────

export type EbiNaReason = 'no_historical_baseline' | 'historical_ed_zero' | 'no_current_records';

export interface KpiResult {
  eligible: Aggregate;
  framework: Aggregate & { excluded_overrides: number };
  efa: { value: number | null; framework_aggregate_ed: number | null; status: KpiStatus };
  ed: {
    value: number | null;               // signed aggregate ED
    absolute: number | null;            // aggregate ED (absolute)
    under_count: number; over_count: number; on_target_count: number;
    under_pct: number | null; over_pct: number | null; on_target_pct: number | null;
    under_effort_pd: number;            // Σ(A − E) over under-estimated tasks
    over_effort_pd: number;             // Σ(E − A) over over-estimated tasks
    under_ed: number | null;            // Σ(E−A)/ΣE over under-estimated tasks (negative)
    over_ed: number | null;             // Σ(E−A)/ΣE over over-estimated tasks (positive)
    tolerance: number;
    status: KpiStatus;
  };
  ebi: {
    value: number | null;
    na_reason: EbiNaReason | null;
    historical_ed: number | null;
    current_ed: number | null;
    reduction: number | null;           // historical − current, percentage points
    historical: ReturnType<typeof historicalAggregate>;
    current: Aggregate;
    baselines_used: Pick<HistoricalBaseline, 'id' | 'version' | 'label' | 'department_id' | 'program_id' | 'estimation_method'>[];
    missing_scope: EbiScope['missing'];
    unmatched_baselines: Pick<HistoricalBaseline, 'id' | 'label' | 'department_id' | 'program_id' | 'estimation_method'>[];
    status: KpiStatus;
  };
  eei: { value: number | null; aggregate_ed: number | null; status: KpiStatus };
  by_method: Record<Method, Aggregate>;
}

export function kpiStatus(kind: keyof KpiSettings['thresholds'], value: number | null, s: KpiSettings): KpiStatus {
  if (value == null) return 'na';
  const t = s.thresholds[kind];
  if (kind === 'ed') {
    const a = Math.abs(value);
    return a <= t.good ? 'good' : a <= t.warning ? 'warning' : 'critical';
  }
  return value >= t.good ? 'good' : value >= t.warning ? 'warning' : 'critical';
}

export function calculateKpis(
  records: PerfRecord[], baselines: HistoricalBaseline[], opts: EbiScopeOptions, settings: KpiSettings = DEFAULT_KPI_SETTINGS,
): KpiResult {
  const eligible = aggregate(records);
  const fwRecords = records.filter(r => r.framework_aligned);
  const framework = { ...aggregate(fwRecords), excluded_overrides: records.length - fwRecords.length };

  const efaValue = framework.aggregate_ed == null ? null : 100 - framework.aggregate_ed;
  const eeiValue = eligible.aggregate_ed == null ? null : 100 - eligible.aggregate_ed;

  // ED direction
  const tol = settings.on_target_tolerance;
  const under: PerfRecord[] = [], over: PerfRecord[] = [], on: PerfRecord[] = [];
  for (const r of records) {
    const ed = signedEd(r.estimated_pd, r.actual_pd);
    if (ed == null) continue;
    ({ under, over, on_target: on })[classify(ed, tol)].push(r);
  }
  const n = records.length;
  const pct = (k: number) => (n > 0 ? (k / n) * 100 : null);
  const underAgg = aggregate(under);
  const overAgg = aggregate(over);

  // EBI
  const scope = matchHistorical(fwRecords, baselines, opts);
  const hist = historicalAggregate(scope.entries);
  const cur = aggregate(scope.comparable);
  let ebi: number | null = null;
  let reason: EbiNaReason | null = null;
  if (scope.entries.length === 0 || hist.aggregate_ed == null) reason = scope.unmatched.length ? 'no_current_records' : 'no_historical_baseline';
  else if (cur.aggregate_ed == null) reason = 'no_current_records';
  else if (hist.aggregate_ed === 0) reason = 'historical_ed_zero';
  else ebi = ((hist.aggregate_ed - cur.aggregate_ed) / hist.aggregate_ed) * 100;

  const byMethod = Object.fromEntries(
    METHODS.map(m => [m, aggregate(records.filter(r => r.method === m))]),
  ) as Record<Method, Aggregate>;

  return {
    eligible,
    framework,
    efa: { value: efaValue, framework_aggregate_ed: framework.aggregate_ed, status: kpiStatus('efa', efaValue, settings) },
    ed: {
      value: eligible.signed_ed,
      absolute: eligible.aggregate_ed,
      under_count: under.length, over_count: over.length, on_target_count: on.length,
      under_pct: pct(under.length), over_pct: pct(over.length), on_target_pct: pct(on.length),
      under_effort_pd: -underAgg.total_signed_error_pd,
      over_effort_pd: overAgg.total_signed_error_pd,
      under_ed: underAgg.signed_ed,
      over_ed: overAgg.signed_ed,
      tolerance: tol,
      status: kpiStatus('ed', eligible.signed_ed == null ? null : eligible.aggregate_ed, settings),
    },
    ebi: {
      value: ebi,
      na_reason: reason,
      historical_ed: hist.aggregate_ed,
      current_ed: cur.aggregate_ed,
      reduction: hist.aggregate_ed != null && cur.aggregate_ed != null ? hist.aggregate_ed - cur.aggregate_ed : null,
      historical: hist,
      current: cur,
      baselines_used: scope.entries.map(b => ({
        id: b.id, version: b.version, label: b.label, department_id: b.department_id,
        program_id: b.program_id, estimation_method: b.estimation_method,
      })),
      missing_scope: scope.missing,
      unmatched_baselines: scope.unmatched.map(b => ({
        id: b.id, label: b.label, department_id: b.department_id, program_id: b.program_id, estimation_method: b.estimation_method,
      })),
      status: kpiStatus('ebi', ebi, settings),
    },
    eei: { value: eeiValue, aggregate_ed: eligible.aggregate_ed, status: kpiStatus('eei', eeiValue, settings) },
    by_method: byMethod,
  };
}

// ─── Breakdowns ──────────────────────────────────────────────────────────────

export type GroupBy = 'department' | 'program' | 'baseline' | 'task';

export interface GroupRow {
  id: string | null;
  name: string;
  department_id: string | null;
  department_name: string | null;
  program_id: string | null;
  program_name: string | null;
  method?: Method;
  record_count: number;
  framework_record_count: number;
  total_estimated_pd: number;
  total_actual_pd: number;
  total_abs_error_pd: number;
  ed: number | null;
  aggregate_ed: number | null;
  efa: number | null;
  eei: number | null;
  ebi: number | null;
  ebi_na_reason: EbiNaReason | 'not_tracked_at_level' | null;
  historical_ed: number | null;
  current_ed: number | null;
  under_count: number;
  over_count: number;
  on_target_count: number;
}

const FALLBACK: Record<Exclude<GroupBy, 'task'>, string> = {
  department: 'Unassigned (pre-hierarchy)',
  program: 'Unassigned (pre-hierarchy)',
  baseline: '(No baseline)',
};

export function breakdown(
  records: PerfRecord[], baselines: HistoricalBaseline[], groupBy: GroupBy, opts: EbiScopeOptions, settings: KpiSettings = DEFAULT_KPI_SETTINGS,
): GroupRow[] {
  const groups = new Map<string, PerfRecord[]>();
  const idOf = (r: PerfRecord) =>
    groupBy === 'department' ? r.department_id
      : groupBy === 'program' ? r.program_id
      : groupBy === 'baseline' ? r.baseline_id
      : `${r.method}:${r.id}`;
  for (const r of records) {
    const k = idOf(r) ?? '∅';
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }

  const rows: GroupRow[] = [];
  for (const [k, list] of groups) {
    const first = list[0];
    let groupBaselines: HistoricalBaseline[] = [];
    let programLevelOnly = opts.programLevelOnly;
    if (groupBy === 'department') {
      groupBaselines = baselines.filter(b => b.department_id === first.department_id);
    } else if (groupBy === 'program') {
      groupBaselines = baselines.filter(b => b.program_id && b.program_id === first.program_id);
      programLevelOnly = true;
    }
    const kpi = calculateKpis(list, groupBaselines, { programLevelOnly, methods: opts.methods }, settings);
    const name =
      groupBy === 'department' ? first.department_name
        : groupBy === 'program' ? first.program_name
        : groupBy === 'baseline' ? first.baseline_name
        : first.title;
    const notTracked = groupBy === 'baseline' || groupBy === 'task';
    rows.push({
      id: k === '∅' ? null : (groupBy === 'task' ? first.id : k),
      name: name ?? (groupBy === 'task' ? '(untitled)' : FALLBACK[groupBy as Exclude<GroupBy, 'task'>]),
      department_id: first.department_id,
      department_name: first.department_name,
      program_id: groupBy === 'department' ? null : first.program_id,
      program_name: groupBy === 'department' ? null : first.program_name,
      ...(groupBy === 'task' ? { method: first.method } : {}),
      record_count: kpi.eligible.record_count,
      framework_record_count: kpi.framework.record_count,
      total_estimated_pd: round(kpi.eligible.total_estimated_pd, 4),
      total_actual_pd: round(kpi.eligible.total_actual_pd, 4),
      total_abs_error_pd: round(kpi.eligible.total_abs_error_pd, 4),
      ed: kpi.ed.value,
      aggregate_ed: kpi.eligible.aggregate_ed,
      efa: kpi.efa.value,
      eei: kpi.eei.value,
      ebi: notTracked ? null : kpi.ebi.value,
      ebi_na_reason: notTracked ? 'not_tracked_at_level' : kpi.ebi.na_reason,
      historical_ed: notTracked ? null : kpi.ebi.historical_ed,
      current_ed: notTracked ? null : kpi.ebi.current_ed,
      under_count: kpi.ed.under_count,
      over_count: kpi.ed.over_count,
      on_target_count: kpi.ed.on_target_count,
    });
  }
  return rows.sort((a, b) => a.name.localeCompare(b.name));
}

// ─── Distribution & trend ────────────────────────────────────────────────────

export interface DistributionBucket { label: string; min: number; max: number | null; count: number; pct: number | null }

/** Histogram of task-level |ED|. Bounds [5,10,20,30] → 0–5, 5–10, 10–20, 20–30, >30 (lower bound exclusive except the first). */
export function distribution(records: PerfRecord[], bounds: number[]): DistributionBucket[] {
  const sorted = [...bounds].sort((a, b) => a - b);
  const buckets: DistributionBucket[] = [];
  let lo = 0;
  for (const hi of sorted) { buckets.push({ label: `${lo}–${hi}%`, min: lo, max: hi, count: 0, pct: null }); lo = hi; }
  buckets.push({ label: `> ${lo}%`, min: lo, max: null, count: 0, pct: null });
  let n = 0;
  for (const r of records) {
    const ed = signedEd(r.estimated_pd, r.actual_pd);
    if (ed == null) continue;
    n++;
    const a = Math.abs(ed);
    const b = buckets.find(x => x.max == null || a <= x.max + 1e-9)!;
    b.count++;
  }
  return buckets.map(b => ({ ...b, pct: n > 0 ? (b.count / n) * 100 : null }));
}

export type Interval = 'day' | 'week' | 'month';

/** Calendar date (YYYY-MM-DD) of an instant in an IANA time zone. */
export function localDate(iso: string, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
}

export function bucketStart(date: string, interval: Interval): string {
  if (interval === 'day') return date;
  if (interval === 'month') return `${date.slice(0, 7)}-01`;
  const d = new Date(`${date}T00:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7; // ISO week, Monday start
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}

function nextBucket(start: string, interval: Interval): string {
  const d = new Date(`${start}T00:00:00Z`);
  if (interval === 'day') d.setUTCDate(d.getUTCDate() + 1);
  else if (interval === 'week') d.setUTCDate(d.getUTCDate() + 7);
  else d.setUTCMonth(d.getUTCMonth() + 1);
  return d.toISOString().slice(0, 10);
}

export interface TrendPoint {
  period: string;
  record_count: number;
  framework_record_count: number;
  efa: number | null;
  eei: number | null;
  ed: number | null;
  total_estimated_pd: number;
  total_actual_pd: number;
}

/** EFA / EEI / ED per period between from..to (inclusive, local calendar days). Empty periods → nulls (not 0). */
export function trend(records: PerfRecord[], from: string, to: string, tz: string, interval: Interval): TrendPoint[] {
  const by = new Map<string, PerfRecord[]>();
  for (const r of records) {
    const k = bucketStart(localDate(r.completed_at, tz), interval);
    by.set(k, [...(by.get(k) ?? []), r]);
  }
  const out: TrendPoint[] = [];
  for (let p = bucketStart(from, interval); p <= to; p = nextBucket(p, interval)) {
    const list = by.get(p) ?? [];
    const all = aggregate(list);
    const fw = aggregate(list.filter(r => r.framework_aligned));
    out.push({
      period: p,
      record_count: all.record_count,
      framework_record_count: fw.record_count,
      efa: fw.aggregate_ed == null ? null : 100 - fw.aggregate_ed,
      eei: all.aggregate_ed == null ? null : 100 - all.aggregate_ed,
      ed: all.signed_ed,
      total_estimated_pd: round(all.total_estimated_pd, 4),
      total_actual_pd: round(all.total_actual_pd, 4),
    });
  }
  return out;
}

// ─── Settings ────────────────────────────────────────────────────────────────

/** Merges a stored settings object over the defaults, ignoring anything malformed. */
export function resolveSettings(stored: unknown): KpiSettings {
  const s = (stored && typeof stored === 'object' ? stored : {}) as Partial<KpiSettings>;
  const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
  const pair = (v: unknown, d: { good: number; warning: number }) => {
    const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
    return { good: num(o.good, d.good), warning: num(o.warning, d.warning) };
  };
  const t = (s.thresholds ?? {}) as Partial<KpiSettings['thresholds']>;
  const bounds = Array.isArray(s.distribution_bounds) && s.distribution_bounds.length > 0
    && s.distribution_bounds.every(b => typeof b === 'number' && b > 0)
    ? [...s.distribution_bounds].sort((a, b) => a - b) : DEFAULT_KPI_SETTINGS.distribution_bounds;
  return {
    on_target_tolerance: num(s.on_target_tolerance, DEFAULT_KPI_SETTINGS.on_target_tolerance),
    distribution_bounds: bounds,
    thresholds: {
      efa: pair(t.efa, DEFAULT_KPI_SETTINGS.thresholds.efa),
      eei: pair(t.eei, DEFAULT_KPI_SETTINGS.thresholds.eei),
      ed: pair(t.ed, DEFAULT_KPI_SETTINGS.thresholds.ed),
      ebi: pair(t.ebi, DEFAULT_KPI_SETTINGS.thresholds.ebi),
    },
    default_range_days: num(s.default_range_days, DEFAULT_KPI_SETTINGS.default_range_days),
  };
}
