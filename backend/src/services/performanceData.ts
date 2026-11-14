/**
 * Data access for the Estimation Performance dashboard.
 *
 * Reads the existing Historical Data SP (`estimations`) and Historical Data PE (`parametric_estimations`)
 * tables read-only, converts both to PersonDays and applies the caller's Department / Program access plus
 * the dashboard filters. Each row keeps its method + id, so SP and PE can never collide and nothing is
 * counted twice.
 */
import { z } from 'zod';
import { query } from '../config/database';
import type { JwtPayload } from '../auth/jwt';
import { canAccessDepartment, canAccessProgram, HierarchyError, isGlobalUser } from './hierarchy.service';
import { addDays, resolveActivityRange, type ActivityRange } from './activityRange';
import {
  isFrameworkAligned, localDate, resolveSettings, SP_HOURS_PER_PD,
  type HistoricalBaseline, type KpiSettings, type Method, type PerfRecord,
} from './performanceKpi';

export const KPI_SETTINGS_KEY = 'kpi.performance_settings';
export const SOURCES: Record<Method, string> = { SP: 'Historical Data SP', PE: 'Historical Data PE' };

const UUID = z.string().uuid();

export interface PerfFilters {
  departmentId?: string;
  programIds: string[];
  baselineId?: string;
  methods: Method[];
  range: ActivityRange;
}

/** Methods the caller may read: SP needs estimation.read, PE needs parametric.read (module access is already applied). */
export function allowedMethods(user: JwtPayload | undefined): Method[] {
  const p = user?.permissions ?? [];
  const out: Method[] = [];
  if (p.includes('estimation.read')) out.push('SP');
  if (p.includes('parametric.read')) out.push('PE');
  return out;
}

/** Parses + validates the dashboard filters. Throws HierarchyError (400 / 403). */
export function readFilters(q: Record<string, unknown>, user: JwtPayload | undefined, defaultDays: number): PerfFilters {
  const one = (v: unknown) => (typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined);
  const departmentId = one(q.departmentId ?? q.department_id);
  const baselineId = one(q.baselineId ?? q.baseline_id);
  const rawPrograms = one(q.programIds ?? q.program_ids ?? q.programId ?? q.program_id);
  const programIds = rawPrograms ? [...new Set(rawPrograms.split(',').map(s => s.trim()).filter(Boolean))] : [];
  for (const [v, label] of [[departmentId, 'department'], [baselineId, 'baseline'], ...programIds.map(p => [p, 'program'])] as [string | undefined, string][]) {
    if (v !== undefined && !UUID.safeParse(v).success) throw new HierarchyError(`Invalid ${label} id`, 400);
  }

  const methodRaw = String(q.method ?? 'BOTH').toUpperCase();
  if (!['SP', 'PE', 'BOTH'].includes(methodRaw)) throw new HierarchyError('method must be SP, PE or BOTH', 400);
  const allowed = allowedMethods(user);
  let methods: Method[];
  if (methodRaw === 'BOTH') {
    methods = allowed;
  } else {
    if (!allowed.includes(methodRaw as Method)) throw new HierarchyError(`You do not have access to ${methodRaw} estimation data`, 403);
    methods = [methodRaw as Method];
  }
  if (methods.length === 0) throw new HierarchyError('You do not have access to SP or PE estimation data', 403);

  const r = resolveActivityRange({ ...q, days: q.days ?? defaultDays });
  if (!r.ok) throw new HierarchyError(r.error, 400);
  return { departmentId, programIds, baselineId, methods, range: r.range };
}

/** Department / Program access + filters for a task table aliased `t`. Inaccessible scope → no rows. */
export function scopeSql(user: JwtPayload | undefined, f: PerfFilters, params: unknown[]): string {
  const p = (v: unknown) => { params.push(v); return `$${params.length}`; };
  // Decide access before binding anything: a denied scope must not leave unused parameters behind.
  if (!user) return ' AND 1=0';
  const global = isGlobalUser(user);
  const userPrograms = global ? null : (user.projectIds as string[]);
  if (userPrograms && userPrograms.length === 0) return ' AND 1=0';
  if (!global && f.departmentId && !canAccessDepartment(user, f.departmentId)) return ' AND 1=0';
  const ok = f.programIds.filter(id => canAccessProgram(user, id));
  if (f.programIds.length && ok.length === 0) return ' AND 1=0';

  let w = '';
  if (userPrograms) w += ` AND t.project_id = ANY(${p(userPrograms)}::uuid[])`;
  if (f.departmentId) w += ` AND t.department_id = ${p(f.departmentId)}`;
  if (ok.length) w += ` AND t.project_id = ANY(${p(ok)}::uuid[])`;
  if (f.baselineId) w += ` AND t.baseline_id = ${p(f.baselineId)}`;
  return w;
}

const JOINS = `
  LEFT JOIN departments d ON d.id = t.department_id
  LEFT JOIN projects    p ON p.id = t.project_id
  LEFT JOIN baselines   b ON b.id = t.baseline_id`;

const HIER_COLS = `t.department_id, d.name AS department_name, t.project_id AS program_id, p.name AS program_name,
                   t.baseline_id, b.name AS baseline_name`;

/** [from 00:00, to+1 00:00) in the caller's time zone, as SQL fragments. */
function windowSql(range: { from: string; to: string; timezone: string }, params: unknown[]) {
  params.push(range.from, addDays(range.to, 1), range.timezone);
  const n = params.length;
  return {
    start: `($${n - 2}::date)::timestamp AT TIME ZONE $${n}`,
    end: `($${n - 1}::date)::timestamp AT TIME ZONE $${n}`,
  };
}

type Row = Record<string, unknown>;
const num = (v: unknown) => (v == null ? null : Number(v));

/**
 * Eligible records completed between `from` and `to`: approved estimate > 0 and an actual recorded.
 * Records without actual effort are never treated as zero — they are simply not eligible.
 */
export async function fetchRecords(
  user: JwtPayload | undefined, f: PerfFilters, window: { from: string; to: string; timezone: string },
): Promise<{ records: PerfRecord[]; excluded: number }> {
  const records: PerfRecord[] = [];
  let excluded = 0;

  if (f.methods.includes('SP')) {
    const params: unknown[] = [];
    const w = windowSql(window, params);
    const scope = scopeSql(user, f, params);
    const rows = await query<Row>(
      `SELECT t.id, t.title, ${HIER_COLS}, t.estimated_hours, t.revised_min_hours, t.revised_max_hours,
              t.actual_hours, t.completed_at
         FROM estimations t ${JOINS}
        WHERE t.status = 'completed' AND t.completed_at >= ${w.start} AND t.completed_at < ${w.end} ${scope}`,
      params,
    );
    for (const r of rows) {
      const approved = num(r.estimated_hours) ?? num(r.revised_min_hours);
      const actual = num(r.actual_hours);
      if (approved == null || !(approved > 0) || actual == null || actual < 0) { excluded++; continue; }
      records.push({
        method: 'SP', id: String(r.id), title: String(r.title ?? ''),
        department_id: (r.department_id as string) ?? null, department_name: (r.department_name as string) ?? null,
        program_id: (r.program_id as string) ?? null, program_name: (r.program_name as string) ?? null,
        baseline_id: (r.baseline_id as string) ?? null, baseline_name: (r.baseline_name as string) ?? null,
        estimated_pd: approved / SP_HOURS_PER_PD,
        actual_pd: actual / SP_HOURS_PER_PD,
        framework_aligned: isFrameworkAligned('SP', num(r.estimated_hours), num(r.revised_min_hours), num(r.revised_max_hours)),
        completed_at: new Date(r.completed_at as string).toISOString(),
        source: SOURCES.SP,
      });
    }
  }

  if (f.methods.includes('PE')) {
    const params: unknown[] = [];
    const w = windowSql(window, params);
    const scope = scopeSql(user, f, params);
    const rows = await query<Row>(
      `SELECT t.id, t.task_title AS title, ${HIER_COLS}, t.final_estimation, t.actual_days, t.completed_at, t.source
         FROM parametric_estimations t ${JOINS}
        WHERE t.status = 'completed' AND t.completed_at >= ${w.start} AND t.completed_at < ${w.end} ${scope}`,
      params,
    );
    for (const r of rows) {
      const est = num(r.final_estimation);
      const actual = num(r.actual_days);
      if (est == null || !(est > 0) || actual == null || actual < 0) { excluded++; continue; }
      records.push({
        method: 'PE', id: String(r.id), title: String(r.title ?? ''),
        department_id: (r.department_id as string) ?? null, department_name: (r.department_name as string) ?? null,
        program_id: (r.program_id as string) ?? null, program_name: (r.program_name as string) ?? null,
        baseline_id: (r.baseline_id as string) ?? null, baseline_name: (r.baseline_name as string) ?? null,
        estimated_pd: est,
        actual_pd: actual,
        framework_aligned: true,
        completed_at: new Date(r.completed_at as string).toISOString(),
        source: `${SOURCES.PE}${r.source === 'excel_import' ? ' (Excel import)' : ''}`,
      });
    }
  }
  return { records, excluded };
}

export function splitByDate(records: PerfRecord[], from: string, tz: string) {
  const before: PerfRecord[] = [];
  const current: PerfRecord[] = [];
  for (const r of records) (localDate(r.completed_at, tz) < from ? before : current).push(r);
  return { before, current };
}

export interface Coverage {
  total_records: number;
  with_actuals: number;
  completed: number;
  complete_data: number;
  actuals_coverage: number | null;
  data_completeness: number | null;
}

/** Records in scope that exist by the end of the period — the denominator for coverage / completeness. */
export async function fetchCoverage(user: JwtPayload | undefined, f: PerfFilters): Promise<Coverage> {
  const totals = { total_records: 0, with_actuals: 0, completed: 0, complete_data: 0 };
  const tables: { m: Method; table: string; est: string; act: string }[] = [
    { m: 'SP', table: 'estimations', est: 'COALESCE(t.estimated_hours, t.revised_min_hours)', act: 't.actual_hours' },
    { m: 'PE', table: 'parametric_estimations', est: 't.final_estimation', act: 't.actual_days' },
  ];
  for (const tb of tables.filter(x => f.methods.includes(x.m))) {
    const params: unknown[] = [addDays(f.range.to, 1), f.range.timezone];
    const end = '($1::date)::timestamp AT TIME ZONE $2';
    const scope = scopeSql(user, f, params);
    const [r] = await query<Row>(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE ${tb.act} IS NOT NULL)::int AS with_actuals,
              COUNT(*) FILTER (WHERE t.status = 'completed')::int AS completed,
              COUNT(*) FILTER (WHERE t.department_id IS NOT NULL AND t.project_id IS NOT NULL AND t.baseline_id IS NOT NULL
                                 AND ${tb.est} > 0 AND ${tb.act} IS NOT NULL)::int AS complete_data
         FROM ${tb.table} t
        WHERE t.created_at < ${end} ${scope}`,
      params,
    );
    totals.total_records += Number(r?.total ?? 0);
    totals.with_actuals += Number(r?.with_actuals ?? 0);
    totals.completed += Number(r?.completed ?? 0);
    totals.complete_data += Number(r?.complete_data ?? 0);
  }
  const pct = (a: number) => (totals.total_records > 0 ? (a / totals.total_records) * 100 : null);
  return { ...totals, actuals_coverage: pct(totals.with_actuals), data_completeness: pct(totals.complete_data) };
}

const BASELINE_COLS = `h.id, h.version, h.label, h.department_id, d.name AS department_name, h.program_id,
  p.name AS program_name, h.estimation_method, h.record_count, h.total_estimated_pd, h.total_actual_pd,
  h.total_abs_error_pd, h.period_from, h.period_to, h.source_note, h.is_active, h.supersedes_id,
  h.created_at, h.updated_at, cu.username AS created_by_username`;

export function toBaseline(r: Row): HistoricalBaseline & Row {
  return {
    ...r,
    id: String(r.id),
    version: Number(r.version),
    label: String(r.label),
    department_id: String(r.department_id),
    program_id: (r.program_id as string) ?? null,
    estimation_method: r.estimation_method as HistoricalBaseline['estimation_method'],
    record_count: Number(r.record_count),
    total_estimated_pd: Number(r.total_estimated_pd),
    total_actual_pd: Number(r.total_actual_pd),
    total_abs_error_pd: Number(r.total_abs_error_pd),
    period_from: r.period_from ? String(localIso(r.period_from)) : null,
    period_to: r.period_to ? String(localIso(r.period_to)) : null,
  };
}

function localIso(v: unknown): string {
  if (v instanceof Date) {
    return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}`;
  }
  return String(v).slice(0, 10);
}

/**
 * Active historical baselines visible to the caller within the filter scope. Non-global users see
 * department-level entries of departments they belong to and program-level entries of their programs.
 */
export async function fetchBaselines(
  user: JwtPayload | undefined, f: Pick<PerfFilters, 'departmentId' | 'programIds'> & { includeInactive?: boolean },
): Promise<(HistoricalBaseline & Row)[]> {
  const params: unknown[] = [];
  let where = f.includeInactive ? 'WHERE 1=1' : 'WHERE h.is_active';
  if (f.departmentId) { params.push(f.departmentId); where += ` AND h.department_id = $${params.length}`; }
  if (f.programIds.length) {
    params.push(f.programIds);
    // Program filter: that program's entries + its department's department-level entry (needed for listing).
    where += ` AND (h.program_id = ANY($${params.length}::uuid[]) OR (h.program_id IS NULL AND h.department_id IN
               (SELECT department_id FROM projects WHERE id = ANY($${params.length}::uuid[]))))`;
  }
  const rows = await query<Row>(
    `SELECT ${BASELINE_COLS}
       FROM kpi_historical_baselines h
       JOIN departments d ON d.id = h.department_id
       LEFT JOIN projects p ON p.id = h.program_id
       LEFT JOIN users cu ON cu.id = h.created_by
      ${where}
      ORDER BY d.name, p.name NULLS FIRST, h.estimation_method, h.version DESC`,
    params,
  );
  return rows
    .filter(r => isGlobalUser(user) || (r.program_id
      ? canAccessProgram(user, String(r.program_id))
      : canAccessDepartment(user, String(r.department_id))))
    .map(toBaseline);
}

export async function loadSettings(): Promise<KpiSettings> {
  const rows = await query<{ value: string }>(`SELECT value FROM app_settings WHERE key = $1`, [KPI_SETTINGS_KEY]);
  let stored: unknown = null;
  try { stored = rows[0] ? JSON.parse(rows[0].value) : null; } catch { stored = null; }
  return resolveSettings(stored);
}
