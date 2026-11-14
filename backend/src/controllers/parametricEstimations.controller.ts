import { Request, Response } from 'express';
import { z } from 'zod';
import { query, queryOne } from '../config/database';
import {
  calculateParametric, resolveProjectParametricConfig,
  PARAMETRIC_SIZES, TEAM_EFFICIENCY_VALUES,
} from '../services/parametricEngine';
import {
  applyHierarchyScope, assertTaskAccess, createHierarchyValidator, hasHierarchyFields,
  HierarchyError, ResolvedHierarchy, taskHierarchyFields, toHierarchyInput, validateTaskHierarchy,
} from '../services/hierarchy.service';
import { computeActualMetrics } from '../services/parametricActuals';
import { auditLog } from '../services/audit.service';

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

/** Hierarchy display names joined onto every parametric task row. */
const SELECT_WITH_HIERARCHY = `
  SELECT e.*, d.name AS department_name, p.name AS program_name, b.name AS baseline_name,
         c.name AS component_name, s.name AS subcomponent_name,
         NULLIF(TRIM(CONCAT(ar.first_name, ' ', ar.last_name)), '') AS actuals_recorded_by_name,
         NULLIF(TRIM(CONCAT(au.first_name, ' ', au.last_name)), '') AS actuals_updated_by_name
    FROM parametric_estimations e
    LEFT JOIN departments   d ON d.id = e.department_id
    LEFT JOIN projects      p ON p.id = e.project_id
    LEFT JOIN baselines     b ON b.id = e.baseline_id
    LEFT JOIN components    c ON c.id = e.component_id
    LEFT JOIN subcomponents s ON s.id = e.subcomponent_id
    LEFT JOIN users        ar ON ar.id = e.actuals_recorded_by
    LEFT JOIN users        au ON au.id = e.actuals_updated_by`;

// ─── Calculate preview (no persistence) ─────────────────────────────────────────

const calculateSchema = z.object({
  project_id: z.string().uuid().optional(),
  program_id: z.string().uuid().optional(),
  ...inputsShape,
});

export async function calculatePreview(req: Request, res: Response): Promise<void> {
  const body = calculateSchema.parse(req.body);
  // The program's parametric master-data mapping drives the preview (falls back to defaults)
  const { average, expert } = await resolveProjectParametricConfig(body.program_id ?? body.project_id);
  const result = calculateParametric(body, average, expert);
  res.json({ success: true, data: result });
}

// ─── List / Get ──────────────────────────────────────────────────────────────────

export async function getAll(req: Request, res: Response): Promise<void> {
  const { page = 1, limit = 20, search, work_group, source, status } = req.query;
  const offset = (Number(page) - 1) * Number(limit);

  let where = 'WHERE 1=1';
  let params: unknown[] = [];
  let i = 1;

  // Department / Program / Baseline / Component / Subcomponent filters + access scoping.
  // Legacy rows with no program are visible to global users only (same rule as SP).
  [where, params, i] = applyHierarchyScope(req, where, params, i, 'e.');

  if (work_group)  { where += ` AND e.work_group ILIKE $${i++}`; params.push(`%${work_group}%`); }
  if (source)      { where += ` AND e.source = $${i++}`;       params.push(source); }
  if (status)      { where += ` AND e.status = $${i++}`;       params.push(status); }
  if (search) {
    where += ` AND (e.task_title ILIKE $${i} OR e.project_name ILIKE $${i} OR e.description ILIKE $${i})`;
    params.push(`%${search}%`);
    i += 1;
  }

  const data = await query(
    `${SELECT_WITH_HIERARCHY} ${where} ORDER BY e.created_at DESC LIMIT $${i} OFFSET $${i + 1}`,
    [...params, Number(limit), offset]
  );
  const countRows = await query<{ count: string }>(`SELECT COUNT(*) as count FROM parametric_estimations e ${where}`, params);
  const total = parseInt(countRows[0]?.count ?? '0');

  res.json({ success: true, data, total, page: Number(page), limit: Number(limit) });
}

export async function getById(req: Request, res: Response): Promise<void> {
  const row = await queryOne<{ project_id: string | null }>(`${SELECT_WITH_HIERARCHY} WHERE e.id = $1`, [req.params.id]);
  if (!row) { res.status(404).json({ success: false, error: 'Parametric estimation not found' }); return; }
  assertTaskAccess(req.user, row);
  res.json({ success: true, data: row });
}

// ─── Create ──────────────────────────────────────────────────────────────────────

const createSchema = z.object({
  task_title: z.string().min(1).max(255),
  ...taskHierarchyFields,
  project_name: z.string().max(255).optional(),
  description: z.string().optional(),
  work_group: z.string().max(100).optional(),
  ...inputsShape,
});

type CreateInput = z.infer<typeof createSchema>;

async function persistEstimation(
  body: CreateInput,
  h: ResolvedHierarchy,
  source: 'manual' | 'excel_import',
  userId: string | null
): Promise<Record<string, unknown>> {
  // Calculation engine is untouched — it only receives the program to resolve master data
  const { average, expert } = await resolveProjectParametricConfig(h.program_id);
  const result = calculateParametric(body, average, expert);

  const [row] = await query(
    `INSERT INTO parametric_estimations
       (task_title, project_id, project_name, department_id, baseline_id, component_id, subcomponent_id,
        description, work_group,
        middleware_inputs, application, system_configuration, data_and_control_flow, use_case,
        team_efficiency, multiplier, detailed_estimation, average_estimation, final_estimation,
        expert_config_id, expert_config_name, expert_config_snapshot,
        average_config_id, average_config_name, average_config_snapshot,
        breakdown, source, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28)
     RETURNING *`,
    [
      body.task_title, h.program_id, h.program_name, h.department_id, h.baseline_id, h.component_id, h.subcomponent_id,
      body.description ?? null, body.work_group ?? null,
      body.middleware_inputs, body.application, body.system_configuration, body.data_and_control_flow, body.use_case,
      body.team_efficiency, result.multiplier, result.detailed_estimation, result.average_estimation, result.final_estimation,
      result.expert_config.id, result.expert_config.name, JSON.stringify(result.expert_config.values),
      result.average_config.id, result.average_config.name, JSON.stringify(result.average_config),
      JSON.stringify(result.breakdown), source, userId,
    ]
  );

  return { ...(row as Record<string, unknown>), ...h };
}

export async function create(req: Request, res: Response): Promise<void> {
  const body = createSchema.parse(req.body);
  const h = await validateTaskHierarchy(toHierarchyInput(body), req.user);
  const row = await persistEstimation(body, h, 'manual', req.user?.userId ?? null);

  await query(
    `INSERT INTO notifications (type, title, message) VALUES ('success', $1, $2)`,
    ['Parametric Estimation Created', `"${body.task_title}" — Final Estimation: ${(row as { final_estimation: number }).final_estimation} PersonDays`]
  ).catch(() => {});

  res.status(201).json({ success: true, data: row });
}

// ─── Update (details and/or hierarchy re-assignment) ─────────────────────────────

const updateSchema = z.object({
  task_title: z.string().min(1).max(255).optional(),
  description: z.string().nullable().optional(),
  work_group: z.string().max(100).nullable().optional(),
  ...taskHierarchyFields,
});

/**
 * Edits task details or moves it within the hierarchy (re-validated in full). The stored estimation
 * values are NOT recalculated — the snapshot taken at creation remains the historical record.
 */
export async function update(req: Request, res: Response): Promise<void> {
  const body = updateSchema.parse(req.body);
  const existing = await queryOne<{ project_id: string | null }>(`SELECT project_id FROM parametric_estimations WHERE id = $1`, [req.params.id]);
  if (!existing) { res.status(404).json({ success: false, error: 'Parametric estimation not found' }); return; }
  assertTaskAccess(req.user, existing);

  const sets: string[] = [];
  const vals: unknown[] = [];
  let i = 1;
  if (body.task_title !== undefined)  { sets.push(`task_title=$${i++}`);  vals.push(body.task_title); }
  if (body.description !== undefined) { sets.push(`description=$${i++}`); vals.push(body.description); }
  if (body.work_group !== undefined)  { sets.push(`work_group=$${i++}`);  vals.push(body.work_group); }

  if (hasHierarchyFields(body)) {
    const h = await validateTaskHierarchy(toHierarchyInput(body), req.user);
    sets.push(`department_id=$${i++}`, `project_id=$${i++}`, `project_name=$${i++}`, `baseline_id=$${i++}`, `component_id=$${i++}`, `subcomponent_id=$${i++}`);
    vals.push(h.department_id, h.program_id, h.program_name, h.baseline_id, h.component_id, h.subcomponent_id);
  }
  if (sets.length === 0) throw new HierarchyError('Nothing to update');
  if (req.user) { sets.push(`updated_by=$${i++}`); vals.push(req.user.userId); }

  vals.push(req.params.id);
  await query(`UPDATE parametric_estimations SET ${sets.join(', ')} WHERE id=$${i}`, vals);
  const row = await queryOne(`${SELECT_WITH_HIERARCHY} WHERE e.id = $1`, [req.params.id]);
  res.json({ success: true, data: row });
}

// ─── Actual effort (PersonDays) ──────────────────────────────────────────────────

/** Permission needed to change actuals that someone else recorded. */
export const CORRECT_ACTUALS_PERMISSION = 'parametric.actuals.correct';
/** Clock-skew allowance when rejecting completion dates in the future. */
const FUTURE_SKEW_MS = 5 * 60 * 1000;

export const actualsSchema = z.object({
  actual_days: z.number({ invalid_type_error: 'Actual effort must be a number' })
    .positive('Actual effort must be greater than 0')
    .max(100000, 'Actual effort cannot exceed 100,000 PersonDays')
    .refine(v => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6, 'Actual effort can have at most 2 decimal places'),
  notes: z.string().trim().max(2000, 'Notes cannot exceed 2,000 characters').nullable().optional(),
  completed_at: z.string().datetime({ offset: true, message: 'completed_at must be an ISO-8601 date-time' })
    .or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'completed_at must be an ISO-8601 date'))
    .optional(),
});

/**
 * Records — or corrects — the actual effort (PersonDays) of a parametric task.
 *
 * The estimate (`final_estimation` and its calculation breakdown) is never modified. Variance, accuracy
 * and deviation are derived server-side by `computeActualMetrics`. The first recording needs the
 * route's `parametric.create`; changing actuals that are already recorded is allowed for the original
 * recorder or for holders of `parametric.actuals.correct`. Every change is written to audit_logs.
 */
export async function recordActuals(req: Request, res: Response): Promise<void> {
  const body = actualsSchema.parse(req.body);
  const est = await queryOne<{
    final_estimation: number; task_title: string; project_id: string | null; created_at: string;
    actual_days: number | null; actual_notes: string | null; completed_at: string | null;
    actuals_recorded_by: string | null;
  }>(
    `SELECT final_estimation, task_title, project_id, created_at, actual_days, actual_notes, completed_at, actuals_recorded_by
       FROM parametric_estimations WHERE id = $1`, [req.params.id]
  );
  if (!est) { res.status(404).json({ success: false, error: 'Parametric estimation not found' }); return; }
  assertTaskAccess(req.user, est);

  const userId = req.user?.userId ?? null;
  const isCorrection = est.actual_days != null;
  if (isCorrection) {
    const isRecorder = !!userId && est.actuals_recorded_by === userId;
    if (!isRecorder && !req.user?.permissions.includes(CORRECT_ACTUALS_PERMISSION)) {
      res.status(403).json({
        success: false,
        error: 'Actual effort is already recorded. Only the user who recorded it or a user with the "Correct parametric actuals" permission can change it.',
      });
      return;
    }
  }

  const completedAt = body.completed_at ? new Date(body.completed_at) : (est.completed_at ? new Date(est.completed_at) : new Date());
  if (Number.isNaN(completedAt.getTime())) {
    res.status(400).json({ success: false, error: 'completed_at is not a valid date' }); return;
  }
  if (completedAt.getTime() > Date.now() + FUTURE_SKEW_MS) {
    res.status(400).json({ success: false, error: 'Completion date cannot be in the future' }); return;
  }
  const createdDay = new Date(est.created_at); createdDay.setUTCHours(0, 0, 0, 0);
  if (completedAt.getTime() < createdDay.getTime()) {
    res.status(400).json({ success: false, error: 'Completion date cannot be before the estimate was created' }); return;
  }

  const metrics = computeActualMetrics(est.final_estimation, body.actual_days);
  // `undefined` notes keep what is stored; `null` / empty string clears them.
  const notes = body.notes === undefined ? est.actual_notes : (body.notes || null);

  await query(
    `UPDATE parametric_estimations
        SET actual_days=$1, variance_days=$2, accuracy_percent=$3, deviation_percent=$4, actual_notes=$5,
            completed_at=$6, status='completed', updated_by=$7, updated_at=NOW(),
            actuals_recorded_by = CASE WHEN $8 THEN actuals_recorded_by ELSE $7 END,
            actuals_recorded_at = CASE WHEN $8 THEN actuals_recorded_at ELSE NOW() END,
            actuals_updated_by  = CASE WHEN $8 THEN $7 ELSE actuals_updated_by END,
            actuals_updated_at  = CASE WHEN $8 THEN NOW() ELSE actuals_updated_at END
      WHERE id=$9`,
    [body.actual_days, metrics.variance_days, metrics.accuracy_percent, metrics.deviation_percent, notes,
     completedAt.toISOString(), userId, isCorrection, req.params.id]
  );

  await auditLog({
    entity: 'parametric_estimation', entityId: req.params.id,
    action: isCorrection ? 'actuals_corrected' : 'actuals_recorded',
    previousValue: isCorrection ? { actual_days: Number(est.actual_days), notes: est.actual_notes, completed_at: est.completed_at } : undefined,
    newValue: { actual_days: body.actual_days, notes, completed_at: completedAt.toISOString(), estimated_days: Number(est.final_estimation), ...metrics },
    user: req.user, req,
  });

  const acc = metrics.accuracy_percent;
  await query(
    `INSERT INTO notifications (type, title, message) VALUES ($1, $2, $3)`,
    [
      acc == null ? 'info' : acc >= 85 ? 'success' : acc >= 70 ? 'warning' : 'error',
      isCorrection ? 'Parametric Actuals Corrected' : 'Parametric Actuals Recorded',
      `"${est.task_title}": ${body.actual_days} PD actual vs ${Number(est.final_estimation)} PD estimated`
        + (acc == null ? '' : ` — ${acc.toFixed(1)}% accuracy (${metrics.variance_days >= 0 ? '+' : ''}${metrics.variance_days.toFixed(2)} PD variance)`),
    ]
  ).catch(() => {});

  const row = await queryOne(`${SELECT_WITH_HIERARCHY} WHERE e.id = $1`, [req.params.id]);
  res.json({ success: true, data: row });
}

// ─── Batch import (Excel upload) ─────────────────────────────────────────────────

const importRowSchema = z.object({
  task_title: z.string().min(1).max(255),
  ...taskHierarchyFields,
  project_name: z.string().max(255).optional(),
  description: z.string().optional(),
  work_group: z.string().max(100).optional(),
  ...inputsShape,
});

const batchImportSchema = z.object({
  /** Default hierarchy applied to every row that does not carry its own (the upload screen's selection). */
  hierarchy: z.object(taskHierarchyFields).optional(),
  rows: z.array(importRowSchema).min(1).max(1000),
});

export async function batchImport(req: Request, res: Response): Promise<void> {
  const { rows, hierarchy } = batchImportSchema.parse(req.body);
  const validate = createHierarchyValidator(req.user);
  let created = 0;
  const errors: { row: number; error: string }[] = [];

  for (let idx = 0; idx < rows.length; idx++) {
    try {
      const row = rows[idx];
      const h = await validate(toHierarchyInput(hasHierarchyFields(row) ? row : (hierarchy ?? {})));
      await persistEstimation(row, h, 'excel_import', req.user?.userId ?? null);
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
