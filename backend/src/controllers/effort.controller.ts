/**
 * Estimated vs Actual effort aggregated along the organisational hierarchy.
 *
 *   GET /api/hierarchy/effort?module=sp|pe&groupBy=department|program|baseline|component|subcomponent|task
 *       [&departmentId][&programId][&baselineId][&componentId][&subcomponentId][&from][&to]
 *
 * SP and PE stay independent: each module reads its own table and its own units —
 *   SP  estimated = estimated_hours (falls back to revised_min_hours, as in recordActuals), actual = actual_hours  [hours]
 *   PE  estimated = final_estimation, actual = actual_days                                                         [person-days]
 * Tasks without a Component / Subcomponent aggregate under "(No component)" / "(No subcomponent)" so
 * totals at every level are always complete.
 */
import { Request, Response } from 'express';
import { z } from 'zod';
import { query } from '../config/database';
import { applyHierarchyScope } from '../services/hierarchy.service';

export const EFFORT_MODULES = {
  sp: {
    table: 'estimations',
    estimated: 'COALESCE(t.estimated_hours, t.revised_min_hours)',
    actual: 't.actual_hours',
    title: 't.title',
    unit: 'hours',
    variance: 'actual_minus_estimated',
  },
  pe: {
    table: 'parametric_estimations',
    estimated: 't.final_estimation',
    actual: 't.actual_days',
    title: 't.task_title',
    unit: 'person_days',
    // PE spec: Variance = Estimated − Actual (positive = finished under estimate)
    variance: 'estimated_minus_actual',
  },
} as const;

const LEVELS = {
  department:   { key: 't.department_id',   name: 'd.name',  fallback: 'Unassigned (pre-hierarchy)' },
  program:      { key: 't.project_id',      name: 'p.name',  fallback: 'Unassigned (pre-hierarchy)' },
  baseline:     { key: 't.baseline_id',     name: 'b.name',  fallback: '(No baseline)' },
  component:    { key: 't.component_id',    name: 'c.name',  fallback: '(No component)' },
  subcomponent: { key: 't.subcomponent_id', name: 's.name',  fallback: '(No subcomponent)' },
} as const;

const querySchema = z.object({
  module:  z.enum(['sp', 'pe']),
  groupBy: z.enum(['department', 'program', 'baseline', 'component', 'subcomponent', 'task']).default('program'),
  from:    z.string().optional(),
  to:      z.string().optional(),
});

export interface EffortRow {
  id: string | null;
  name: string;
  department_name: string | null;
  program_name: string | null;
  baseline_name: string | null;
  component_name: string | null;
  task_count: number;
  completed_count: number;
  estimated_total: number;
  estimated_completed: number;
  actual_total: number;
  variance: number;
  accuracy_percent: number | null;
  deviation_percent: number | null;
}

export type VarianceConvention = 'actual_minus_estimated' | 'estimated_minus_actual';

/**
 * Variance / accuracy / deviation are computed only over tasks that have actuals, so open tasks don't
 * skew them. The variance sign follows the module's convention (SP: Actual − Estimated, PE: Estimated − Actual).
 */
export function deriveMetrics(
  estimatedCompleted: number, actualTotal: number, completed: number,
  convention: VarianceConvention = 'actual_minus_estimated',
) {
  const diff = actualTotal - estimatedCompleted;
  const variance = convention === 'estimated_minus_actual' ? -diff : diff;
  const deviation = completed > 0 && estimatedCompleted > 0 ? (Math.abs(diff) / estimatedCompleted) * 100 : null;
  return {
    variance,
    accuracy_percent: deviation == null ? null : Math.max(0, 100 - deviation),
    deviation_percent: deviation,
  };
}

const JOINS = `
  LEFT JOIN departments   d ON d.id = t.department_id
  LEFT JOIN projects      p ON p.id = t.project_id
  LEFT JOIN baselines     b ON b.id = t.baseline_id
  LEFT JOIN components    c ON c.id = t.component_id
  LEFT JOIN subcomponents s ON s.id = t.subcomponent_id`;

export async function getEffort(req: Request, res: Response): Promise<void> {
  const q = querySchema.parse(req.query);
  const m = EFFORT_MODULES[q.module];

  let where = 'WHERE 1=1';
  let params: unknown[] = [];
  let i = 1;
  [where, params, i] = applyHierarchyScope(req, where, params, i, 't.');
  if (q.from) { where += ` AND t.created_at >= $${i++}`; params.push(q.from); }
  if (q.to)   { where += ` AND t.created_at <= $${i++}`; params.push(q.to); }

  let rows: Record<string, unknown>[];
  if (q.groupBy === 'task') {
    rows = await query(
      `SELECT t.id, ${m.title} AS name, t.status,
              d.name AS department_name, p.name AS program_name, b.name AS baseline_name,
              c.name AS component_name, s.name AS subcomponent_name,
              1 AS task_count,
              CASE WHEN t.status = 'completed' THEN 1 ELSE 0 END AS completed_count,
              COALESCE(${m.estimated}, 0) AS estimated_total,
              CASE WHEN ${m.actual} IS NOT NULL THEN COALESCE(${m.estimated}, 0) ELSE 0 END AS estimated_completed,
              COALESCE(${m.actual}, 0) AS actual_total
         FROM ${m.table} t ${JOINS}
         ${where}
        ORDER BY t.created_at DESC
        LIMIT 500`,
      params
    );
  } else {
    const lvl = LEVELS[q.groupBy];
    rows = await query(
      `SELECT ${lvl.key} AS id, COALESCE(MAX(${lvl.name}), '${lvl.fallback}') AS name,
              MAX(d.name) AS department_name, MAX(p.name) AS program_name,
              MAX(b.name) AS baseline_name, MAX(c.name) AS component_name,
              COUNT(*)::int AS task_count,
              COUNT(*) FILTER (WHERE t.status = 'completed')::int AS completed_count,
              COALESCE(SUM(${m.estimated}), 0) AS estimated_total,
              COALESCE(SUM(${m.estimated}) FILTER (WHERE ${m.actual} IS NOT NULL), 0) AS estimated_completed,
              COALESCE(SUM(${m.actual}), 0) AS actual_total
         FROM ${m.table} t ${JOINS}
         ${where}
        GROUP BY ${lvl.key}
        ORDER BY name`,
      params
    );
  }

  const data: EffortRow[] = rows.map((r) => {
    const estimatedTotal = Number(r.estimated_total ?? 0);
    const estimatedCompleted = Number(r.estimated_completed ?? 0);
    const actualTotal = Number(r.actual_total ?? 0);
    const completed = Number(r.completed_count ?? 0);
    return {
      ...(r as object),
      id: (r.id as string | null) ?? null,
      name: String(r.name ?? ''),
      task_count: Number(r.task_count ?? 0),
      completed_count: completed,
      estimated_total: estimatedTotal,
      estimated_completed: estimatedCompleted,
      actual_total: actualTotal,
      ...deriveMetrics(estimatedCompleted, actualTotal, completed, m.variance),
    } as EffortRow;
  });

  const totals = data.reduce(
    (acc, r) => ({
      task_count: acc.task_count + r.task_count,
      completed_count: acc.completed_count + r.completed_count,
      estimated_total: acc.estimated_total + r.estimated_total,
      estimated_completed: acc.estimated_completed + r.estimated_completed,
      actual_total: acc.actual_total + r.actual_total,
    }),
    { task_count: 0, completed_count: 0, estimated_total: 0, estimated_completed: 0, actual_total: 0 }
  );

  res.json({
    success: true,
    unit: m.unit,
    variance_convention: m.variance,
    groupBy: q.groupBy,
    data,
    totals: { ...totals, ...deriveMetrics(totals.estimated_completed, totals.actual_total, totals.completed_count, m.variance) },
  });
}
