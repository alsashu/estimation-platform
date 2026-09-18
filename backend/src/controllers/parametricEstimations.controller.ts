import { Request, Response } from 'express';
import { z } from 'zod';
import { query, queryOne } from '../config/database';
import {
  calculateParametric, resolveProjectParametricConfig,
  PARAMETRIC_SIZES, TEAM_EFFICIENCY_VALUES,
} from '../services/parametricEngine';

const sizeSchema = z.enum(PARAMETRIC_SIZES);
const teamEfficiencySchema = z.number().refine(
  (v) => (TEAM_EFFICIENCY_VALUES as readonly number[]).includes(v),
  { message: `Team Efficiency must be one of ${TEAM_EFFICIENCY_VALUES.join(', ')}` }
);

const inputsShape = {
  middleware_inputs: sizeSchema,
  application: sizeSchema,
  system_configuration: sizeSchema,
  data_and_control_flow: sizeSchema,
  use_case: sizeSchema,
  team_efficiency: teamEfficiencySchema,
};

// ─── Calculate preview (no persistence) ─────────────────────────────────────────

const calculateSchema = z.object({ project_id: z.string().uuid().optional(), ...inputsShape });

export async function calculatePreview(req: Request, res: Response): Promise<void> {
  const body = calculateSchema.parse(req.body);
  const { average, expert } = await resolveProjectParametricConfig(body.project_id);
  const result = calculateParametric(body, average, expert);
  res.json({ success: true, data: result });
}

// ─── List / Get ──────────────────────────────────────────────────────────────────

export async function getAll(req: Request, res: Response): Promise<void> {
  const { page = 1, limit = 20, search, project_id, work_group, source } = req.query;
  const offset = (Number(page) - 1) * Number(limit);

  let where = 'WHERE 1=1';
  const params: unknown[] = [];
  let i = 1;

  if (req.user && req.user.projectIds !== '*') {
    const ids = req.user.projectIds as string[];
    if (ids.length === 0) {
      res.json({ success: true, data: [], total: 0, page: Number(page), limit: Number(limit) });
      return;
    }
    where += ` AND (project_id = ANY($${i++}::uuid[]) OR project_id IS NULL)`;
    params.push(ids);
  }

  if (project_id)  { where += ` AND project_id = $${i++}`;   params.push(project_id); }
  if (work_group)  { where += ` AND work_group ILIKE $${i++}`; params.push(`%${work_group}%`); }
  if (source)      { where += ` AND source = $${i++}`;       params.push(source); }
  if (search) {
    where += ` AND (task_title ILIKE $${i} OR project_name ILIKE $${i + 1} OR description ILIKE $${i + 2})`;
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    i += 3;
  }

  const data = await query(
    `SELECT * FROM parametric_estimations ${where} ORDER BY created_at DESC LIMIT $${i} OFFSET $${i + 1}`,
    [...params, Number(limit), offset]
  );
  const countRows = await query<{ count: string }>(`SELECT COUNT(*) as count FROM parametric_estimations ${where}`, params);
  const total = parseInt(countRows[0]?.count ?? '0');

  res.json({ success: true, data, total, page: Number(page), limit: Number(limit) });
}

export async function getById(req: Request, res: Response): Promise<void> {
  const row = await queryOne(`SELECT * FROM parametric_estimations WHERE id = $1`, [req.params.id]);
  if (!row) { res.status(404).json({ success: false, error: 'Parametric estimation not found' }); return; }
  res.json({ success: true, data: row });
}

// ─── Create ──────────────────────────────────────────────────────────────────────

const createSchema = z.object({
  task_title: z.string().min(1).max(255),
  project_id: z.string().uuid().optional(),
  project_name: z.string().max(255).optional(),
  description: z.string().optional(),
  work_group: z.string().max(100).optional(),
  ...inputsShape,
});

type CreateInput = z.infer<typeof createSchema>;

async function persistEstimation(
  body: CreateInput,
  source: 'manual' | 'excel_import',
  userId: string | null
): Promise<Record<string, unknown>> {
  const { average, expert } = await resolveProjectParametricConfig(body.project_id);
  const result = calculateParametric(body, average, expert);

  let projectName = body.project_name ?? null;
  if (body.project_id && !projectName) {
    const proj = await queryOne<{ name: string }>(`SELECT name FROM projects WHERE id = $1`, [body.project_id]);
    projectName = proj?.name ?? null;
  }

  const [row] = await query(
    `INSERT INTO parametric_estimations
       (task_title, project_id, project_name, description, work_group,
        middleware_inputs, application, system_configuration, data_and_control_flow, use_case,
        team_efficiency, multiplier, detailed_estimation, average_estimation, final_estimation,
        expert_config_id, expert_config_name, expert_config_snapshot,
        average_config_id, average_config_name, average_config_snapshot,
        breakdown, source, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)
     RETURNING *`,
    [
      body.task_title, body.project_id ?? null, projectName, body.description ?? null, body.work_group ?? null,
      body.middleware_inputs, body.application, body.system_configuration, body.data_and_control_flow, body.use_case,
      body.team_efficiency, result.multiplier, result.detailed_estimation, result.average_estimation, result.final_estimation,
      result.expert_config.id, result.expert_config.name, JSON.stringify(result.expert_config.values),
      result.average_config.id, result.average_config.name, JSON.stringify(result.average_config),
      JSON.stringify(result.breakdown), source, userId,
    ]
  );

  return row as Record<string, unknown>;
}

export async function create(req: Request, res: Response): Promise<void> {
  const body = createSchema.parse(req.body);
  const row = await persistEstimation(body, 'manual', req.user?.userId ?? null);

  await query(
    `INSERT INTO notifications (type, title, message) VALUES ('success', $1, $2)`,
    ['Parametric Estimation Created', `"${body.task_title}" — Final Estimation: ${(row as { final_estimation: number }).final_estimation} PersonDays`]
  ).catch(() => {});

  res.status(201).json({ success: true, data: row });
}

// ─── Batch import (Excel upload) ─────────────────────────────────────────────────

const importRowSchema = z.object({
  task_title: z.string().min(1).max(255),
  project_id: z.string().uuid().optional(),
  project_name: z.string().max(255).optional(),
  description: z.string().optional(),
  work_group: z.string().max(100).optional(),
  ...inputsShape,
});

const batchImportSchema = z.object({ rows: z.array(importRowSchema).min(1).max(1000) });

export async function batchImport(req: Request, res: Response): Promise<void> {
  const { rows } = batchImportSchema.parse(req.body);
  let created = 0;
  const errors: { row: number; error: string }[] = [];

  for (let idx = 0; idx < rows.length; idx++) {
    try {
      await persistEstimation(rows[idx], 'excel_import', req.user?.userId ?? null);
      created++;
    } catch (e) {
      errors.push({ row: idx + 1, error: e instanceof Error ? e.message : 'Import failed' });
    }
  }

  if (created > 0) {
    await query(
      `INSERT INTO notifications (type, title, message) VALUES ('info', $1, $2)`,
      ['Bulk Parametric Import', `${created} parametric estimation${created !== 1 ? 's' : ''} imported via Excel`]
    ).catch(() => {});
  }

  res.json({ success: true, created, errors });
}
