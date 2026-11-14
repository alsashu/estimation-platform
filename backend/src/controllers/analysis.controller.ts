import { Request, Response } from 'express';
import { query } from '../config/database';
import { applyHierarchyScope } from '../services/hierarchy.service';
import { resolveActivityRange, activitySql, activityMeta } from '../services/activityRange';

/**
 * Department / Program / Baseline / Component / Subcomponent filters + access scoping.
 * Shared with every SP and PE report so dashboards, history and analytics filter identically.
 */
function addProjectFilter(req: Request, where: string, params: unknown[], i: number): [string, unknown[], number] {
  return applyHierarchyScope(req, where, params, i);
}

export async function getSummary(req: Request, res: Response): Promise<void> {
  const { from, to, complexity, risk, competency } = req.query;

  let where = `WHERE status = 'completed' AND actual_hours IS NOT NULL`;
  let params: unknown[] = [];
  let i = 1;

  [where, params, i] = addProjectFilter(req, where, params, i);
  if (from)       { where += ` AND created_at >= $${i++}`; params.push(from); }
  if (to)         { where += ` AND created_at <= $${i++}`; params.push(to); }
  if (complexity) { where += ` AND complexity = $${i++}`; params.push(complexity); }
  if (risk)       { where += ` AND risk = $${i++}`; params.push(risk); }
  if (competency) { where += ` AND competency = $${i++}`; params.push(competency); }

  const [summary] = await query<{
    total_estimations: string;
    completed: string;
    avg_accuracy: string;
    avg_variance: string;
    std_dev: string;
  }>(
    `SELECT
       COUNT(*) AS total_estimations,
       COUNT(*) FILTER (WHERE status='completed') AS completed,
       COALESCE(AVG(accuracy_percent), 0) AS avg_accuracy,
       COALESCE(AVG(variance_hours), 0) AS avg_variance,
       COALESCE(STDDEV(accuracy_percent), 0) AS std_dev
     FROM estimations ${where}`,
    params
  );

  // Total estimation count (project-scoped)
  let totalWhere = 'WHERE 1=1';
  let totalParams: unknown[] = [];
  let ti = 1;
  [totalWhere, totalParams, ti] = addProjectFilter(req, totalWhere, totalParams, ti);
  const totalAll = await query<{ count: string }>(`SELECT COUNT(*) as count FROM estimations ${totalWhere}`, totalParams);

  res.json({
    success: true,
    data: {
      total_estimations: parseInt(totalAll[0]?.count ?? '0'),
      completed_estimations: parseInt(summary?.completed ?? '0'),
      avg_accuracy: parseFloat(summary?.avg_accuracy ?? '0'),
      avg_variance: parseFloat(summary?.avg_variance ?? '0'),
      std_deviation: parseFloat(summary?.std_dev ?? '0'),
      bias: parseFloat(summary?.avg_variance ?? '0') > 1 ? 'under-estimate'
          : parseFloat(summary?.avg_variance ?? '0') < -1 ? 'over-estimate'
          : 'accurate',
    },
  });
}

export async function getByComplexity(req: Request, res: Response): Promise<void> {
  const { from, to } = req.query;
  let params: unknown[] = [];
  let where = `WHERE status = 'completed' AND actual_hours IS NOT NULL`;
  let i = 1;
  [where, params, i] = addProjectFilter(req, where, params, i);
  if (from) { where += ` AND created_at >= $${i++}`; params.push(from); }
  if (to)   { where += ` AND created_at <= $${i++}`; params.push(to); }

  const data = await query(
    `SELECT complexity,
            COUNT(*) as count,
            COALESCE(AVG(accuracy_percent), 0) as avg_accuracy,
            COALESCE(AVG(variance_hours), 0) as avg_variance,
            COALESCE(MIN(accuracy_percent), 0) as min_accuracy,
            COALESCE(MAX(accuracy_percent), 0) as max_accuracy
     FROM estimations ${where}
     GROUP BY complexity
     ORDER BY CASE complexity
       WHEN 'Low' THEN 1 WHEN 'Medium' THEN 2 WHEN 'High' THEN 3
       WHEN 'Very High' THEN 4 WHEN 'Unmanageable' THEN 5 ELSE 6 END`,
    params
  );
  res.json({ success: true, data });
}

export async function getSPBandSummary(req: Request, res: Response): Promise<void> {
  const { from, to } = req.query;
  let params: unknown[] = [];
  let where = `WHERE status = 'completed' AND actual_hours IS NOT NULL`;
  let i = 1;
  [where, params, i] = addProjectFilter(req, where, params, i);
  if (from) { where += ` AND created_at >= $${i++}`; params.push(from); }
  if (to)   { where += ` AND created_at <= $${i++}`; params.push(to); }

  const data = await query(
    `SELECT story_points,
            COUNT(*) as count,
            COALESCE(AVG(actual_hours), 0) as avg_actual_hours,
            COALESCE(AVG(revised_min_hours), 0) as avg_revised_min_hours,
            COALESCE(AVG(variance_hours), 0) as avg_variance
     FROM estimations ${where}
     GROUP BY story_points
     ORDER BY story_points`,
    params
  );
  res.json({ success: true, data });
}

export async function getScatterData(req: Request, res: Response): Promise<void> {
  const { from, to } = req.query;
  let params: unknown[] = [];
  let where = `WHERE status = 'completed' AND actual_hours IS NOT NULL`;
  let i = 1;
  [where, params, i] = addProjectFilter(req, where, params, i);
  if (from) { where += ` AND created_at >= $${i++}`; params.push(from); }
  if (to)   { where += ` AND created_at <= $${i++}`; params.push(to); }

  const data = await query(
    `SELECT id, title, revised_min_hours, actual_hours, complexity, story_points, accuracy_percent
     FROM estimations ${where}
     ORDER BY created_at DESC LIMIT 200`,
    params
  );
  res.json({ success: true, data });
}

/**
 * Estimation Activity (Dashboard SP). Buckets by creation date ("total") and by completion date
 * ("completed") over a From/To range in the caller's time zone; filtering happens in SQL.
 */
export async function getTrend(req: Request, res: Response): Promise<void> {
  const r = resolveActivityRange(req.query as Record<string, unknown>);
  if (!r.ok) { res.status(400).json({ success: false, error: r.error }); return; }

  let where = 'WHERE 1=1';
  let params: unknown[] = [];
  let i = 1;
  [where, params, i] = applyHierarchyScope(req, where, params, i, 'e.');
  const s = activitySql(r.range, params, i);

  const data = await query(
    `WITH ${s.ctes},
      created AS (
        SELECT ${s.bucketOf('e.created_at')} AS bucket, COUNT(*) AS total
        FROM estimations e CROSS JOIN bounds b
        ${where} AND ${s.inRange('e.created_at')}
        GROUP BY 1
      ),
      completed AS (
        SELECT ${s.bucketOf('e.completed_at')} AS bucket, COUNT(*) AS completed,
               AVG(e.accuracy_percent) AS avg_accuracy
        FROM estimations e CROSS JOIN bounds b
        ${where} AND e.status = 'completed' AND e.completed_at IS NOT NULL AND ${s.inRange('e.completed_at')}
        GROUP BY 1
      )
     SELECT ${s.periodCols},
            COALESCE(c.total, 0)::int AS total,
            COALESCE(d.completed, 0)::int AS completed,
            COALESCE(ROUND(d.avg_accuracy::numeric, 2), 0)::float AS avg_accuracy
     FROM buckets k
     CROSS JOIN bounds b
     LEFT JOIN created c ON c.bucket = k.bucket
     LEFT JOIN completed d ON d.bucket = k.bucket
     ORDER BY k.bucket`,
    params
  );
  res.json({ success: true, data, meta: activityMeta(r.range) });
}
