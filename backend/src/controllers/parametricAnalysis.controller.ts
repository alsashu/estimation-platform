import { Request, Response } from 'express';
import { query } from '../config/database';
import { applyHierarchyScope } from '../services/hierarchy.service';
import { resolveActivityRange, activitySql, activityMeta } from '../services/activityRange';
import { PARAMETRIC_FIELDS } from '../services/parametricEngine';

/**
 * Department / Program / Baseline / Component / Subcomponent filters + access scoping.
 * Shared with every SP and PE report so dashboards, history and analytics filter identically.
 */
function addProjectFilter(req: Request, where: string, params: unknown[], i: number): [string, unknown[], number] {
  return applyHierarchyScope(req, where, params, i);
}

export async function getSummary(req: Request, res: Response): Promise<void> {
  const { from, to } = req.query;
  let where = 'WHERE 1=1';
  let params: unknown[] = [];
  let i = 1;
  [where, params, i] = addProjectFilter(req, where, params, i);
  if (from) { where += ` AND created_at >= $${i++}`; params.push(from); }
  if (to)   { where += ` AND created_at <= $${i++}`; params.push(to); }

  const [summary] = await query<{
    total: string; avg_detailed: string; avg_average: string; avg_final: string;
    avg_team_efficiency: string; detailed_wins: string; import_count: string;
    completed: string; estimated_completed: string; actual_total: string;
    avg_accuracy: string | null; avg_deviation: string | null;
    under_count: string; over_count: string; on_target_count: string;
  }>(
    `SELECT
       COUNT(*) AS total,
       COALESCE(AVG(detailed_estimation), 0) AS avg_detailed,
       COALESCE(AVG(average_estimation), 0) AS avg_average,
       COALESCE(AVG(final_estimation), 0) AS avg_final,
       COALESCE(AVG(team_efficiency), 0) AS avg_team_efficiency,
       COUNT(*) FILTER (WHERE final_estimation = detailed_estimation) AS detailed_wins,
       COUNT(*) FILTER (WHERE source = 'excel_import') AS import_count,
       -- Estimated vs Actual (PersonDays) — only tasks with recorded actuals
       COUNT(*) FILTER (WHERE actual_days IS NOT NULL) AS completed,
       COALESCE(SUM(final_estimation) FILTER (WHERE actual_days IS NOT NULL), 0) AS estimated_completed,
       COALESCE(SUM(actual_days), 0) AS actual_total,
       AVG(accuracy_percent)  FILTER (WHERE actual_days IS NOT NULL) AS avg_accuracy,
       AVG(deviation_percent) FILTER (WHERE actual_days IS NOT NULL) AS avg_deviation,
       COUNT(*) FILTER (WHERE actual_days IS NOT NULL AND actual_days < final_estimation) AS under_count,
       COUNT(*) FILTER (WHERE actual_days IS NOT NULL AND actual_days > final_estimation) AS over_count,
       COUNT(*) FILTER (WHERE actual_days IS NOT NULL AND actual_days = final_estimation) AS on_target_count
     FROM parametric_estimations ${where}`,
    params
  );

  const total = parseInt(summary?.total ?? '0');
  const detailedWins = parseInt(summary?.detailed_wins ?? '0');
  const estimatedCompleted = parseFloat(summary?.estimated_completed ?? '0');
  const actualTotal = parseFloat(summary?.actual_total ?? '0');

  res.json({
    success: true,
    data: {
      total_estimations: total,
      avg_detailed_estimation: parseFloat(summary?.avg_detailed ?? '0'),
      avg_average_estimation: parseFloat(summary?.avg_average ?? '0'),
      avg_final_estimation: parseFloat(summary?.avg_final ?? '0'),
      avg_team_efficiency: parseFloat(summary?.avg_team_efficiency ?? '0'),
      detailed_basis_pct: total > 0 ? (detailedWins / total) * 100 : 0,
      average_basis_pct: total > 0 ? ((total - detailedWins) / total) * 100 : 0,
      import_count: parseInt(summary?.import_count ?? '0'),
      completed_count: parseInt(summary?.completed ?? '0'),
      open_count: total - parseInt(summary?.completed ?? '0'),
      estimated_completed_days: estimatedCompleted,
      actual_total_days: actualTotal,
      /** PE convention: Estimated − Actual (positive = under estimate). */
      total_variance_days: estimatedCompleted - actualTotal,
      avg_accuracy_percent: summary?.avg_accuracy == null ? null : parseFloat(summary.avg_accuracy),
      avg_deviation_percent: summary?.avg_deviation == null ? null : parseFloat(summary.avg_deviation),
      under_estimate_count: parseInt(summary?.under_count ?? '0'),
      over_estimate_count: parseInt(summary?.over_count ?? '0'),
      on_target_count: parseInt(summary?.on_target_count ?? '0'),
    },
  });
}

/**
 * Estimated vs Actual for completed tasks: scatter points (latest 200) and accuracy bands.
 * Accuracy bands match the notification thresholds: ≥85 % high, 70–85 % medium, <70 % low.
 */
export async function getActuals(req: Request, res: Response): Promise<void> {
  let where = 'WHERE actual_days IS NOT NULL';
  let params: unknown[] = [];
  let i = 1;
  [where, params, i] = addProjectFilter(req, where, params, i);

  const points = await query(
    `SELECT id, task_title, final_estimation::float AS estimated_days, actual_days::float AS actual_days,
            variance_days::float AS variance_days, accuracy_percent::float AS accuracy_percent,
            deviation_percent::float AS deviation_percent, completed_at
       FROM parametric_estimations ${where}
      ORDER BY completed_at DESC NULLS LAST
      LIMIT 200`,
    params
  );
  const [bands] = await query<{ high: string; medium: string; low: string; na: string }>(
    `SELECT COUNT(*) FILTER (WHERE accuracy_percent >= 85) AS high,
            COUNT(*) FILTER (WHERE accuracy_percent >= 70 AND accuracy_percent < 85) AS medium,
            COUNT(*) FILTER (WHERE accuracy_percent < 70) AS low,
            COUNT(*) FILTER (WHERE accuracy_percent IS NULL) AS na
       FROM parametric_estimations ${where}`,
    params
  );
  res.json({
    success: true,
    data: {
      points,
      accuracy_bands: [
        { band: '≥ 85%', count: parseInt(bands?.high ?? '0') },
        { band: '70–85%', count: parseInt(bands?.medium ?? '0') },
        { band: '< 70%', count: parseInt(bands?.low ?? '0') },
      ],
    },
  });
}

export async function getSizeDistribution(req: Request, res: Response): Promise<void> {
  const { from, to } = req.query;
  let where = 'WHERE 1=1';
  let params: unknown[] = [];
  let i = 1;
  [where, params, i] = addProjectFilter(req, where, params, i);
  if (from) { where += ` AND created_at >= $${i++}`; params.push(from); }
  if (to)   { where += ` AND created_at <= $${i++}`; params.push(to); }

  const selects = PARAMETRIC_FIELDS.map(f =>
    `COUNT(*) FILTER (WHERE ${f} = 'Small') AS "${f}_small",
     COUNT(*) FILTER (WHERE ${f} = 'Medium') AS "${f}_medium",
     COUNT(*) FILTER (WHERE ${f} = 'Large') AS "${f}_large",
     COUNT(*) FILTER (WHERE ${f} = 'NA') AS "${f}_na"`
  ).join(',\n');

  const [row] = await query<Record<string, string>>(`SELECT ${selects} FROM parametric_estimations ${where}`, params);

  const data = PARAMETRIC_FIELDS.map((f) => ({
    field: f,
    Small: parseInt(row?.[`${f}_small`] ?? '0'),
    Medium: parseInt(row?.[`${f}_medium`] ?? '0'),
    Large: parseInt(row?.[`${f}_large`] ?? '0'),
    NA: parseInt(row?.[`${f}_na`] ?? '0'),
  }));

  res.json({ success: true, data });
}

export async function getByWorkGroup(req: Request, res: Response): Promise<void> {
  const { from, to } = req.query;
  let where = 'WHERE 1=1';
  let params: unknown[] = [];
  let i = 1;
  [where, params, i] = addProjectFilter(req, where, params, i);
  if (from) { where += ` AND created_at >= $${i++}`; params.push(from); }
  if (to)   { where += ` AND created_at <= $${i++}`; params.push(to); }

  const data = await query(
    `SELECT COALESCE(NULLIF(work_group, ''), 'Unspecified') as work_group,
            COUNT(*) as count,
            COALESCE(AVG(final_estimation), 0) as avg_final_estimation
     FROM parametric_estimations ${where}
     GROUP BY COALESCE(NULLIF(work_group, ''), 'Unspecified')
     ORDER BY count DESC`,
    params
  );
  res.json({ success: true, data });
}

export async function getByConfig(req: Request, res: Response): Promise<void> {
  const { from, to } = req.query;
  let where = 'WHERE 1=1';
  let params: unknown[] = [];
  let i = 1;
  [where, params, i] = addProjectFilter(req, where, params, i);
  if (from) { where += ` AND created_at >= $${i++}`; params.push(from); }
  if (to)   { where += ` AND created_at <= $${i++}`; params.push(to); }

  const data = await query(
    `SELECT COALESCE(expert_config_name, 'Unknown') as expert_config_name,
            COUNT(*) as count,
            COALESCE(AVG(final_estimation), 0) as avg_final_estimation
     FROM parametric_estimations ${where}
     GROUP BY expert_config_name
     ORDER BY count DESC`,
    params
  );
  res.json({ success: true, data });
}

/**
 * Estimation Activity (Dashboard PE). Counts manual and Excel-imported estimations by creation date
 * over a From/To range in the caller's time zone; filtering happens in SQL.
 */
export async function getTrend(req: Request, res: Response): Promise<void> {
  const r = resolveActivityRange(req.query as Record<string, unknown>);
  if (!r.ok) { res.status(400).json({ success: false, error: r.error }); return; }

  let where = 'WHERE 1=1';
  let params: unknown[] = [];
  let i = 1;
  [where, params, i] = applyHierarchyScope(req, where, params, i, 'p.');
  const s = activitySql(r.range, params, i);

  const data = await query(
    `WITH ${s.ctes},
      created AS (
        SELECT ${s.bucketOf('p.created_at')} AS bucket,
               COUNT(*) AS total,
               COUNT(*) FILTER (WHERE p.source = 'manual') AS manual,
               COUNT(*) FILTER (WHERE p.source = 'excel_import') AS excel_import,
               AVG(p.final_estimation) AS avg_final_estimation
        FROM parametric_estimations p CROSS JOIN bounds b
        ${where} AND ${s.inRange('p.created_at')}
        GROUP BY 1
      )
     SELECT ${s.periodCols},
            COALESCE(c.total, 0)::int AS total,
            COALESCE(c.manual, 0)::int AS manual,
            COALESCE(c.excel_import, 0)::int AS excel_import,
            COALESCE(ROUND(c.avg_final_estimation::numeric, 2), 0)::float AS avg_final_estimation
     FROM buckets k
     CROSS JOIN bounds b
     LEFT JOIN created c ON c.bucket = k.bucket
     ORDER BY k.bucket`,
    params
  );
  res.json({ success: true, data, meta: activityMeta(r.range) });
}
