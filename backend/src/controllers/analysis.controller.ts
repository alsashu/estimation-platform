import { Request, Response } from 'express';
import { query } from '../config/database';

function addProjectFilter(req: Request, where: string, params: unknown[], i: number): [string, unknown[], number] {
  const selectedProjectId = req.query.projectId as string | undefined;

  if (selectedProjectId) {
    // Validate user has access to the requested project
    if (req.user && req.user.projectIds !== '*') {
      const ids = req.user.projectIds as string[];
      if (!ids.includes(selectedProjectId)) {
        where += ` AND 1=0`; // no access
        return [where, params, i];
      }
    }
    where += ` AND project_id = $${i++}`;
    params.push(selectedProjectId);
  } else if (req.user && req.user.projectIds !== '*') {
    const ids = req.user.projectIds as string[];
    if (ids.length > 0) {
      where += ` AND project_id = ANY($${i++}::uuid[])`;
      params.push(ids);
    } else {
      where += ` AND 1=0`;
    }
  }
  return [where, params, i];
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

export async function getTrend(req: Request, res: Response): Promise<void> {
  const { days = 30 } = req.query;
  let params: unknown[] = [];
  let where = `WHERE COALESCE(completed_at, created_at) >= NOW() - INTERVAL '${parseInt(String(days))} days'`;
  let i = 1;
  [where, params, i] = addProjectFilter(req, where, params, i);

  const data = await query(
    `SELECT DATE_TRUNC('day', COALESCE(completed_at, created_at)) as date,
            COUNT(*) as total,
            COUNT(*) FILTER (WHERE status='completed') as completed,
            COALESCE(AVG(accuracy_percent) FILTER (WHERE status='completed'), 0) as avg_accuracy
     FROM estimations
     ${where}
     GROUP BY DATE_TRUNC('day', COALESCE(completed_at, created_at))
     ORDER BY date`,
    params
  );
  res.json({ success: true, data });
}
