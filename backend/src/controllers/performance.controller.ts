/**
 * Estimation Performance dashboard — EFA / ED / EBI / EEI.
 *
 *   GET  /api/performance/dashboard   KPI tiles, previous-period comparison, comparisons, trend, distribution
 *   GET  /api/performance/breakdown   drill-down rows (groupBy=department|program|baseline|task)
 *   GET  /api/performance/baselines   governed pre-framework historical baselines (EBI)
 *   POST /api/performance/baselines            create   (performance.baseline.manage)
 *   PUT  /api/performance/baselines/:id        new version (performance.baseline.manage)
 *   PATCH /api/performance/baselines/:id/status deactivate / reactivate (performance.baseline.manage)
 *   GET/PUT /api/performance/settings          thresholds, tolerance, histogram bounds
 *   GET/POST /api/performance/snapshots        reproducible, frozen dashboard reports
 *
 * Filters: departmentId, programIds (comma list), baselineId, from, to (YYYY-MM-DD), tz (IANA),
 * method = SP | PE | BOTH. All data is restricted to the caller's Department / Program access and
 * estimation modules.
 */
import { Request, Response } from 'express';
import { z } from 'zod';
import { query, queryOne } from '../config/database';
import { auditLog } from '../services/audit.service';
import { addDays, activityMeta } from '../services/activityRange';
import { canAccessDepartment, canAccessProgram, HierarchyError, isGlobalUser } from '../services/hierarchy.service';
import {
  allowedMethods, fetchBaselines, fetchCoverage, fetchRecords, KPI_SETTINGS_KEY, loadSettings, readFilters,
  SOURCES, splitByDate, toBaseline, type PerfFilters,
} from '../services/performanceData';
import {
  breakdown, calculateKpis, distribution, resolveSettings, signedEd, trend,
  type GroupBy, type GroupRow, type KpiSettings, type PerfRecord,
} from '../services/performanceKpi';

/** A Program or (org) Baseline filter means only program-level historical baselines are comparable. */
const programLevelOnly = (f: PerfFilters) => f.programIds.length > 0 || !!f.baselineId;

function rank(rows: GroupRow[], key: 'aggregate_ed' | 'ebi', dir: 'asc' | 'desc', n = 5) {
  return rows
    .filter(r => r[key] != null && r.record_count > 0)
    .sort((a, b) => (dir === 'asc' ? (a[key]! - b[key]!) : (b[key]! - a[key]!)))
    .slice(0, n);
}

export async function buildDashboard(req: Request, f: PerfFilters, settings: KpiSettings) {
  const tz = f.range.timezone;
  const prev = { from: addDays(f.range.from, -f.range.days), to: addDays(f.range.from, -1), timezone: tz };

  const [{ records: all, excluded }, baselines, coverage] = await Promise.all([
    fetchRecords(req.user, f, { from: prev.from, to: f.range.to, timezone: tz }),
    fetchBaselines(req.user, f),
    fetchCoverage(req.user, f),
  ]);
  const { before, current } = splitByDate(all, f.range.from, tz);
  const opts = { programLevelOnly: programLevelOnly(f), methods: f.methods };

  const summary = calculateKpis(current, baselines, opts, settings);
  const previous = calculateKpis(before, baselines, opts, settings);

  const byProgram = breakdown(current, baselines, 'program', opts, settings);
  const byDepartment = breakdown(current, baselines, 'department', opts, settings);

  const taskEds = current.map(r => signedEd(r.estimated_pd, r.actual_pd)).filter((v): v is number => v != null);
  const avgDeviation = taskEds.length ? taskEds.reduce((s, v) => s + Math.abs(v), 0) / taskEds.length : null;
  const best = rank(byProgram, 'aggregate_ed', 'asc', 1)[0] ?? null;
  const worst = rank(byProgram, 'aggregate_ed', 'desc', 1)[0] ?? null;
  const bestDept = byDepartment.filter(d => d.eei != null).sort((a, b) => b.eei! - a.eei!)[0] ?? null;

  return {
    meta: {
      ...activityMeta(f.range),
      previous: { from: prev.from, to: prev.to },
      methods: f.methods,
      filters: { departmentId: f.departmentId ?? null, programIds: f.programIds, baselineId: f.baselineId ?? null },
      sources: f.methods.map(m => SOURCES[m]),
      unit: 'person_days',
      sp_hours_per_pd: 8,
      settings,
      excluded_records: excluded,
      generated_at: new Date().toISOString(),
    },
    summary,
    previous: {
      efa: previous.efa.value, ed: previous.ed.value, ebi: previous.ebi.value, eei: previous.eei.value,
      record_count: previous.eligible.record_count,
    },
    indicators: {
      total_estimated_pd: summary.eligible.total_estimated_pd,
      total_actual_pd: summary.eligible.total_actual_pd,
      total_abs_error_pd: summary.eligible.total_abs_error_pd,
      average_deviation: avgDeviation,
      underestimation_rate: summary.ed.under_pct,
      overestimation_rate: summary.ed.over_pct,
      on_target_rate: summary.ed.on_target_pct,
      actuals_coverage: coverage.actuals_coverage,
      data_completeness: coverage.data_completeness,
      framework_adoption_rate: summary.eligible.record_count > 0
        ? (summary.framework.record_count / summary.eligible.record_count) * 100 : null,
      calibration_gap: summary.ebi.reduction,
      best_program: best ? { name: best.name, department_name: best.department_name, aggregate_ed: best.aggregate_ed } : null,
      highest_deviation_program: worst ? { name: worst.name, department_name: worst.department_name, aggregate_ed: worst.aggregate_ed } : null,
      best_department: bestDept ? { name: bestDept.name, eei: bestDept.eei } : null,
      improvement_opportunities: rank(byProgram, 'aggregate_ed', 'desc'),
      top_improving_programs: rank(byProgram, 'ebi', 'desc'),
    },
    coverage,
    by_program: byProgram,
    by_department: byDepartment,
    trend: trend(current, f.range.from, f.range.to, tz, f.range.interval),
    distribution: distribution(current, settings.distribution_bounds),
  };
}

export async function getDashboard(req: Request, res: Response): Promise<void> {
  const settings = await loadSettings();
  const f = readFilters(req.query as Record<string, unknown>, req.user, settings.default_range_days);
  res.json({ success: true, data: await buildDashboard(req, f, settings) });
}

const groupBySchema = z.enum(['department', 'program', 'baseline', 'task']);

export async function getBreakdown(req: Request, res: Response): Promise<void> {
  const settings = await loadSettings();
  const f = readFilters(req.query as Record<string, unknown>, req.user, settings.default_range_days);
  const groupBy: GroupBy = groupBySchema.parse(req.query.groupBy ?? 'program');
  const [{ records, excluded }, baselines] = await Promise.all([
    fetchRecords(req.user, f, f.range),
    fetchBaselines(req.user, f),
  ]);
  const rows = breakdown(records, baselines, groupBy, { programLevelOnly: programLevelOnly(f), methods: f.methods }, settings);
  // Task rows carry their traceability back to the source record.
  const byKey = new Map<string, PerfRecord>(records.map(r => [`${r.method}:${r.id}`, r]));
  const data = groupBy === 'task'
    ? rows.map(r => {
        const src = byKey.get(`${r.method}:${r.id}`)!;
        return {
          ...r,
          baseline_name: src.baseline_name,
          framework_aligned: src.framework_aligned,
          source: src.source,
          completed_at: src.completed_at,
          direction: r.ed == null ? null : Math.abs(r.ed) <= settings.on_target_tolerance ? 'on_target' : r.ed < 0 ? 'under' : 'over',
        };
      }).sort((a, b) => (b.completed_at > a.completed_at ? 1 : -1))
    : rows;
  res.json({ success: true, groupBy, meta: { ...activityMeta(f.range), methods: f.methods, excluded_records: excluded }, data });
}

// ─── Historical baselines (pre-framework reference for EBI) ───────────────────

const baselineSchema = z.object({
  department_id: z.string().uuid(),
  program_id: z.string().uuid().nullable().optional(),
  estimation_method: z.enum(['SP', 'PE', 'ALL']).default('ALL'),
  label: z.string().trim().min(1).max(150),
  period_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  period_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  record_count: z.number().int().positive(),
  total_estimated_pd: z.number().positive(),
  total_actual_pd: z.number().min(0),
  total_abs_error_pd: z.number().min(0),
  source_note: z.string().max(2000).nullable().optional(),
}).superRefine((b, ctx) => {
  if (b.total_abs_error_pd + 0.05 < Math.abs(b.total_estimated_pd - b.total_actual_pd)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom, path: ['total_abs_error_pd'],
      message: 'Total absolute error cannot be smaller than |Total estimated − Total actual|',
    });
  }
  if (b.period_from && b.period_to && b.period_from > b.period_to) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['period_to'], message: 'Period end must not be before period start' });
  }
});

async function assertBaselineScope(req: Request, b: { department_id: string; program_id?: string | null }) {
  const program = b.program_id
    ? await queryOne<{ department_id: string }>(`SELECT department_id FROM projects WHERE id = $1 AND deleted_at IS NULL`, [b.program_id])
    : null;
  if (b.program_id && !program) throw new HierarchyError('Program not found', 400);
  if (program && program.department_id !== b.department_id) throw new HierarchyError('The Program does not belong to the selected Department', 400);
  const dept = await queryOne(`SELECT id FROM departments WHERE id = $1`, [b.department_id]);
  if (!dept) throw new HierarchyError('Department not found', 400);
  if (!isGlobalUser(req.user)) {
    const ok = b.program_id ? canAccessProgram(req.user, b.program_id) : canAccessDepartment(req.user, b.department_id);
    if (!ok) throw new HierarchyError('You do not have access to this Department / Program', 403);
  }
}

export async function listBaselines(req: Request, res: Response): Promise<void> {
  if (allowedMethods(req.user).length === 0) throw new HierarchyError('Insufficient permissions', 403);
  const one = (v: unknown) => (typeof v === 'string' && v ? v : undefined);
  const programIds = one(req.query.programIds)?.split(',').filter(Boolean) ?? [];
  const data = await fetchBaselines(req.user, {
    departmentId: one(req.query.departmentId),
    programIds,
    includeInactive: req.query.includeInactive === 'true',
  });
  const withEd = data.map(b => ({ ...b, aggregate_ed: (b.total_abs_error_pd / b.total_estimated_pd) * 100 }));
  res.json({ success: true, data: withEd });
}

const INSERT_COLS = `department_id, program_id, estimation_method, label, period_from, period_to, record_count,
  total_estimated_pd, total_actual_pd, total_abs_error_pd, source_note`;
const insertValues = (b: z.infer<typeof baselineSchema>) => [
  b.department_id, b.program_id ?? null, b.estimation_method, b.label, b.period_from ?? null, b.period_to ?? null,
  b.record_count, b.total_estimated_pd, b.total_actual_pd, b.total_abs_error_pd, b.source_note ?? null,
];

export async function createBaseline(req: Request, res: Response): Promise<void> {
  const body = baselineSchema.parse(req.body);
  await assertBaselineScope(req, body);
  const row = await queryOne<Record<string, unknown>>(
    `INSERT INTO kpi_historical_baselines (${INSERT_COLS}, created_by, updated_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12) RETURNING *`,
    [...insertValues(body), req.user!.userId],
  );
  await auditLog({ entity: 'kpi_historical_baseline', entityId: String(row!.id), action: 'historical_baseline_created', newValue: row, user: req.user, req });
  res.status(201).json({ success: true, data: toBaseline(row as Record<string, unknown>) });
}

/** Edits never overwrite: the active row is retired and a new version inserted (supersedes_id → old row). */
export async function updateBaseline(req: Request, res: Response): Promise<void> {
  const body = baselineSchema.parse(req.body);
  const old = await queryOne<Record<string, unknown>>(`SELECT * FROM kpi_historical_baselines WHERE id = $1`, [req.params.id]);
  if (!old) { res.status(404).json({ success: false, error: 'Historical baseline not found' }); return; }
  if (!old.is_active) { res.status(409).json({ success: false, error: 'Only the active version can be edited' }); return; }
  await assertBaselineScope(req, { department_id: String(old.department_id), program_id: old.program_id as string | null });
  await assertBaselineScope(req, body);

  await query(`UPDATE kpi_historical_baselines SET is_active = false, updated_by = $2, updated_at = NOW() WHERE id = $1`, [old.id, req.user!.userId]);
  try {
    const row = await queryOne<Record<string, unknown>>(
      `INSERT INTO kpi_historical_baselines (${INSERT_COLS}, created_by, updated_by, version, supersedes_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12,$13,$14) RETURNING *`,
      [...insertValues(body), req.user!.userId, Number(old.version) + 1, old.id],
    );
    await auditLog({ entity: 'kpi_historical_baseline', entityId: String(row!.id), action: 'historical_baseline_updated', previousValue: old, newValue: row, user: req.user, req });
    res.json({ success: true, data: toBaseline(row as Record<string, unknown>) });
  } catch (err) {
    await query(`UPDATE kpi_historical_baselines SET is_active = true WHERE id = $1`, [old.id]);
    throw err;
  }
}

export async function setBaselineStatus(req: Request, res: Response): Promise<void> {
  const { is_active } = z.object({ is_active: z.boolean() }).parse(req.body);
  const old = await queryOne<Record<string, unknown>>(`SELECT * FROM kpi_historical_baselines WHERE id = $1`, [req.params.id]);
  if (!old) { res.status(404).json({ success: false, error: 'Historical baseline not found' }); return; }
  await assertBaselineScope(req, { department_id: String(old.department_id), program_id: old.program_id as string | null });
  if (is_active) {
    const superseded = await queryOne(`SELECT id FROM kpi_historical_baselines WHERE supersedes_id = $1`, [old.id]);
    if (superseded) { res.status(409).json({ success: false, error: 'This version was superseded by a newer version' }); return; }
  }
  const row = await queryOne<Record<string, unknown>>(
    `UPDATE kpi_historical_baselines SET is_active = $2, updated_by = $3, updated_at = NOW() WHERE id = $1 RETURNING *`,
    [old.id, is_active, req.user!.userId],
  );
  await auditLog({
    entity: 'kpi_historical_baseline', entityId: String(old.id),
    action: is_active ? 'historical_baseline_activated' : 'historical_baseline_deactivated',
    previousValue: { is_active: old.is_active }, newValue: { is_active }, user: req.user, req,
  });
  res.json({ success: true, data: toBaseline(row as Record<string, unknown>) });
}

// ─── Settings ─────────────────────────────────────────────────────────────────

const pairSchema = z.object({ good: z.number(), warning: z.number() });
const settingsSchema = z.object({
  on_target_tolerance: z.number().min(0).max(100),
  distribution_bounds: z.array(z.number().positive().max(1000)).min(1).max(10),
  thresholds: z.object({ efa: pairSchema, eei: pairSchema, ed: pairSchema, ebi: pairSchema }),
  default_range_days: z.number().int().min(1).max(3660),
}).superRefine((s, ctx) => {
  for (const k of ['efa', 'eei', 'ebi'] as const) {
    if (s.thresholds[k].good < s.thresholds[k].warning) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['thresholds', k], message: `${k.toUpperCase()}: "good" must be ≥ "warning"` });
    }
  }
  if (s.thresholds.ed.good > s.thresholds.ed.warning) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['thresholds', 'ed'], message: 'ED: "good" must be ≤ "warning" (lower deviation is better)' });
  }
  if (new Set(s.distribution_bounds).size !== s.distribution_bounds.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['distribution_bounds'], message: 'Histogram bounds must be unique' });
  }
});

export async function getSettings(_req: Request, res: Response): Promise<void> {
  res.json({ success: true, data: await loadSettings() });
}

export async function updateSettings(req: Request, res: Response): Promise<void> {
  const body = settingsSchema.parse(req.body);
  const before = await loadSettings();
  const next = resolveSettings(body);
  await query(
    `INSERT INTO app_settings (key, value, updated_at) VALUES ($1, $2, NOW())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [KPI_SETTINGS_KEY, JSON.stringify(next)],
  );
  await auditLog({ entity: 'kpi_settings', action: 'kpi_settings_updated', previousValue: before, newValue: next, user: req.user, req });
  res.json({ success: true, data: next });
}

// ─── Snapshots ────────────────────────────────────────────────────────────────

/** The server recalculates from the filters — a snapshot never stores client-supplied numbers. */
export async function createSnapshot(req: Request, res: Response): Promise<void> {
  const { label, filters } = z.object({
    label: z.string().trim().min(1).max(150),
    filters: z.record(z.unknown()),
  }).parse(req.body);
  const settings = await loadSettings();
  const f = readFilters(filters, req.user, settings.default_range_days);
  const result = await buildDashboard(req, f, settings);
  const row = await queryOne<{ id: string; created_at: string }>(
    `INSERT INTO kpi_snapshots (label, filters, result, created_by) VALUES ($1, $2, $3, $4) RETURNING id, created_at`,
    [label, JSON.stringify({ ...filters, ...result.meta.filters, from: f.range.from, to: f.range.to, tz: f.range.timezone, methods: f.methods }), JSON.stringify(result), req.user!.userId],
  );
  await auditLog({ entity: 'kpi_snapshot', entityId: row!.id, action: 'kpi_snapshot_created', newValue: { label, filters }, user: req.user, req });
  res.status(201).json({ success: true, data: { id: row!.id, label, created_at: row!.created_at } });
}

/** Snapshots are visible to their author; global users see all. */
export async function listSnapshots(req: Request, res: Response): Promise<void> {
  const global = isGlobalUser(req.user);
  const rows = await query(
    `SELECT s.id, s.label, s.filters, s.created_at, u.username AS created_by_username,
            s.result->'summary'->'efa'->>'value' AS efa, s.result->'summary'->'ed'->>'value' AS ed,
            s.result->'summary'->'ebi'->>'value' AS ebi, s.result->'summary'->'eei'->>'value' AS eei
       FROM kpi_snapshots s LEFT JOIN users u ON u.id = s.created_by
      ${global ? '' : 'WHERE s.created_by = $1'}
      ORDER BY s.created_at DESC LIMIT 100`,
    global ? [] : [req.user!.userId],
  );
  res.json({ success: true, data: rows });
}

export async function getSnapshot(req: Request, res: Response): Promise<void> {
  const row = await queryOne<{ created_by: string }>(
    `SELECT s.*, u.username AS created_by_username FROM kpi_snapshots s LEFT JOIN users u ON u.id = s.created_by WHERE s.id = $1`,
    [req.params.id],
  );
  if (!row || (!isGlobalUser(req.user) && row.created_by !== req.user!.userId)) {
    res.status(404).json({ success: false, error: 'Snapshot not found' });
    return;
  }
  res.json({ success: true, data: row });
}
