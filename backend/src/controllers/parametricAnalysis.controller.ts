import { Request, Response } from 'express';
import { query } from '../config/database';
import { PARAMETRIC_FIELDS } from '../services/parametricEngine';

function addProjectFilter(req: Request, where: string, params: unknown[], i: number): [string, unknown[], number] {
  const selectedProjectId = req.query.projectId as string | undefined;

  if (selectedProjectId) {
    if (req.user && req.user.projectIds !== '*') {
      const ids = req.user.projectIds as string[];
      if (!ids.includes(selectedProjectId)) {
        where += ` AND 1=0`;
        return [where, params, i];
      }
    }
    where += ` AND project_id = $${i++}`;
    params.push(selectedProjectId);
  } else if (req.user && req.user.projectIds !== '*') {
    const ids = req.user.projectIds as string[];
    if (ids.length > 0) {
      where += ` AND (project_id = ANY($${i++}::uuid[]) OR project_id IS NULL)`;
      params.push(ids);
    }
  }
  return [where, params, i];
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
  }>(
    `SELECT
       COUNT(*) AS total,
       COALESCE(AVG(detailed_estimation), 0) AS avg_detailed,
       COALESCE(AVG(average_estimation), 0) AS avg_average,
       COALESCE(AVG(final_estimation), 0) AS avg_final,
       COALESCE(AVG(team_efficiency), 0) AS avg_team_efficiency,
       COUNT(*) FILTER (WHERE final_estimation = detailed_estimation) AS detailed_wins,
       COUNT(*) FILTER (WHERE source = 'excel_import') AS import_count
     FROM parametric_estimations ${where}`,
    params
  );

  const total = parseInt(summary?.total ?? '0');
  const detailedWins = parseInt(summary?.detailed_wins ?? '0');

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

export async function getTrend(req: Request, res: Response): Promise<void> {
  const { days = 30 } = req.query;
  let params: unknown[] = [];
  let where = `WHERE created_at >= NOW() - INTERVAL '${parseInt(String(days))} days'`;
  let i = 1;
  [where, params, i] = addProjectFilter(req, where, params, i);

  const data = await query(
    `SELECT DATE_TRUNC('day', created_at) as date,
            COUNT(*) as total,
            COALESCE(AVG(final_estimation), 0) as avg_final_estimation
     FROM parametric_estimations
     ${where}
     GROUP BY DATE_TRUNC('day', created_at)
     ORDER BY date`,
    params
  );
  res.json({ success: true, data });
}
