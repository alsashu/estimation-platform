import { Request, Response } from 'express';
import { query, queryOne } from '../config/database';
import { runFullEstimation } from '../services/estimationEngine';
import {
  applyHierarchyScope, assertTaskAccess, createHierarchyValidator, hasHierarchyFields,
  HierarchyError, taskHierarchyFields, toHierarchyInput, validateTaskHierarchy,
} from '../services/hierarchy.service';
import { z } from 'zod';

const createSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  project_name: z.string().optional(),
  ...taskHierarchyFields,
  complexity: z.enum(['Low', 'Medium', 'High', 'Very High', 'Unmanageable']),
  risk: z.enum(['Low', 'Medium', 'High', 'Very High', 'Unknown']),
  competency: z.enum(['Emerging', 'Competent', 'Expert']),
  work_group: z.enum(['DEVELOPMENT', 'VALIDATION', 'SPECIFICATION']),
  notes: z.string().optional(),
});

const actualsSchema = z.object({
  estimated_hours: z.number().positive().optional(),
  actual_hours: z.number().positive().optional(),
  completed_at: z.string().optional(),
  notes: z.string().optional(),
}).refine(d => d.estimated_hours != null || d.actual_hours != null, {
  message: 'Either estimated_hours or actual_hours must be provided',
});

/** Hierarchy display names joined onto every task row. */
const SELECT_WITH_HIERARCHY = `
  SELECT e.*, d.name AS department_name, p.name AS program_name, b.name AS baseline_name,
         c.name AS component_name, s.name AS subcomponent_name
    FROM estimations e
    LEFT JOIN departments   d ON d.id = e.department_id
    LEFT JOIN projects      p ON p.id = e.project_id
    LEFT JOIN baselines     b ON b.id = e.baseline_id
    LEFT JOIN components    c ON c.id = e.component_id
    LEFT JOIN subcomponents s ON s.id = e.subcomponent_id`;

export async function getAll(req: Request, res: Response): Promise<void> {
  const { page = 1, limit = 20, status, complexity, risk, work_group, project_name, search } = req.query;
  const offset = (Number(page) - 1) * Number(limit);

  let where = 'WHERE 1=1';
  let params: unknown[] = [];
  let i = 1;

  // Department / Program / Baseline / Component / Subcomponent filters + access scoping
  [where, params, i] = applyHierarchyScope(req, where, params, i, 'e.');

  if (status)       { where += ` AND e.status = $${i++}`;        params.push(status); }
  if (complexity)   { where += ` AND e.complexity = $${i++}`;    params.push(complexity); }
  if (risk)         { where += ` AND e.risk = $${i++}`;          params.push(risk); }
  if (work_group)   { where += ` AND e.work_group = $${i++}`;    params.push(work_group); }
  if (project_name) { where += ` AND e.project_name ILIKE $${i++}`; params.push(`%${project_name}%`); }
  if (search) {
    where += ` AND (e.title ILIKE $${i} OR e.project_name ILIKE $${i} OR e.description ILIKE $${i} OR e.work_group ILIKE $${i})`;
    params.push(`%${search}%`);
    i += 1;
  }

  const data = await query(
    `${SELECT_WITH_HIERARCHY} ${where} ORDER BY e.created_at DESC LIMIT $${i} OFFSET $${i + 1}`,
    [...params, Number(limit), offset]
  );
  const countRows = await query<{ count: string }>(
    `SELECT COUNT(*) as count FROM estimations e ${where}`, params
  );
  const total = parseInt(countRows[0]?.count ?? '0');

  res.json({ success: true, data, total, page: Number(page), limit: Number(limit) });
}

export async function getById(req: Request, res: Response): Promise<void> {
  const row = await queryOne<{ project_id: string | null }>(`${SELECT_WITH_HIERARCHY} WHERE e.id = $1`, [req.params.id]);
  if (!row) { res.status(404).json({ success: false, error: 'Estimation not found' }); return; }
  assertTaskAccess(req.user, row);
  res.json({ success: true, data: row });
}

export async function calculate(req: Request, res: Response): Promise<void> {
  const { complexity, risk, competency } = req.query;
  if (!complexity || !risk || !competency) {
    res.status(400).json({ success: false, error: 'complexity, risk and competency are required' });
    return;
  }
  const result = await runFullEstimation(String(complexity), String(risk), String(competency));
  if (!result) {
    res.status(404).json({ success: false, error: 'No configuration found for this combination' });
    return;
  }
  res.json({ success: true, data: result });
}

const INSERT_SQL = `INSERT INTO estimations
   (title, description, project_name, project_id, department_id, baseline_id, component_id, subcomponent_id,
    complexity, risk, competency, work_group,
    story_points, initial_min_days, initial_max_days, initial_min_hours, initial_max_hours,
    overhead_percent, revised_min_days, revised_max_days, revised_min_hours, revised_max_hours, notes, created_by)
 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)
 RETURNING *`;

export async function create(req: Request, res: Response): Promise<void> {
  const body = createSchema.parse(req.body);
  const h = await validateTaskHierarchy(toHierarchyInput(body), req.user);

  const calc = await runFullEstimation(body.complexity, body.risk, body.competency);
  if (!calc) {
    res.status(404).json({ success: false, error: 'No story point configuration for this Complexity + Risk combination' });
    return;
  }

  const createdBy = req.user?.userId ?? null;

  const [row] = await query(INSERT_SQL, [
    body.title, body.description, h.program_name, h.program_id, h.department_id,
    h.baseline_id, h.component_id, h.subcomponent_id,
    body.complexity, body.risk, body.competency, body.work_group,
    calc.story_points,
    calc.initial_min_days, calc.initial_max_days,
    calc.initial_min_hours, calc.initial_max_hours,
    calc.overhead_percent,
    calc.revised_min_days, calc.revised_max_days,
    calc.revised_min_hours, calc.revised_max_hours,
    body.notes, createdBy,
  ]);

  // Create notification
  await query(
    `INSERT INTO notifications (type, title, message) VALUES ('success', $1, $2)`,
    ['New Estimation Created', `"${body.title}" — ${calc.story_points} SP, ${calc.revised_min_hours.toFixed(1)}–${calc.revised_max_hours.toFixed(1)} hrs revised`]
  );

  res.status(201).json({ success: true, data: { ...(row as object), ...h } });
}

const updateSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  ...taskHierarchyFields,
});

/**
 * Updates task details and/or moves the task within the hierarchy. When any hierarchy field is sent,
 * the full Department/Program/Baseline (+ optional Component/Subcomponent) selection is re-validated.
 * This is also how legacy "Unassigned" tasks are re-homed into the hierarchy.
 */
export async function update(req: Request, res: Response): Promise<void> {
  const body = updateSchema.parse(req.body);
  const existing = await queryOne<{ project_id: string | null }>(`SELECT project_id FROM estimations WHERE id = $1`, [req.params.id]);
  if (!existing) { res.status(404).json({ success: false, error: 'Estimation not found' }); return; }
  assertTaskAccess(req.user, existing);

  const sets: string[] = [];
  const vals: unknown[] = [];
  let i = 1;
  if (body.title !== undefined)       { sets.push(`title=$${i++}`);       vals.push(body.title); }
  if (body.description !== undefined) { sets.push(`description=$${i++}`); vals.push(body.description); }
  if (body.notes !== undefined)       { sets.push(`notes=$${i++}`);       vals.push(body.notes); }

  if (hasHierarchyFields(body)) {
    const h = await validateTaskHierarchy(toHierarchyInput(body), req.user);
    sets.push(`department_id=$${i++}`, `project_id=$${i++}`, `project_name=$${i++}`, `baseline_id=$${i++}`, `component_id=$${i++}`, `subcomponent_id=$${i++}`);
    vals.push(h.department_id, h.program_id, h.program_name, h.baseline_id, h.component_id, h.subcomponent_id);
  }
  if (sets.length === 0) throw new HierarchyError('Nothing to update');

  vals.push(req.params.id);
  await query(`UPDATE estimations SET ${sets.join(', ')} WHERE id=$${i}`, vals);
  const row = await queryOne(`${SELECT_WITH_HIERARCHY} WHERE e.id = $1`, [req.params.id]);
  res.json({ success: true, data: row });
}

export async function recordActuals(req: Request, res: Response): Promise<void> {
  const body = actualsSchema.parse(req.body);
  const est = await queryOne<{ estimated_hours: number | null; revised_min_hours: number; title: string; project_id: string | null }>(
    `SELECT estimated_hours, revised_min_hours, title, project_id FROM estimations WHERE id = $1`, [req.params.id]
  );
  if (!est) { res.status(404).json({ success: false, error: 'Estimation not found' }); return; }
  assertTaskAccess(req.user, est);

  // Phase 1: Save estimated_hours only — do not change status or compute metrics
  if (body.actual_hours == null) {
    const row = await queryOne(
      `UPDATE estimations SET estimated_hours=$1, notes=COALESCE($2, notes) WHERE id=$3 RETURNING *`,
      [body.estimated_hours!, body.notes ?? null, req.params.id]
    );
    res.json({ success: true, data: row });
    return;
  }

  // Phase 2: Record actual hours and compute metrics
  // Use estimated_hours from body → DB → fall back to revised_min_hours
  const estimatedHours =
    body.estimated_hours != null ? body.estimated_hours :
    est.estimated_hours != null ? Number(est.estimated_hours) :
    Number(est.revised_min_hours);

  const actualHours = body.actual_hours;
  const variance = actualHours - estimatedHours;
  const accuracy = estimatedHours > 0 ? Math.max(0, (1 - Math.abs(variance) / estimatedHours) * 100) : 0;
  const actualDays = actualHours / 8;

  const row = await queryOne(
    `UPDATE estimations
     SET actual_hours=$1, actual_days=$2, completed_at=$3, variance_hours=$4,
         accuracy_percent=$5, estimated_hours=COALESCE($6, estimated_hours),
         notes=COALESCE($7, notes), status='completed'
     WHERE id=$8 RETURNING *`,
    [actualHours, actualDays, body.completed_at || new Date().toISOString(), variance, accuracy,
     body.estimated_hours ?? null, body.notes ?? null, req.params.id]
  );

  await query(
    `INSERT INTO notifications (type, title, message) VALUES ($1, $2, $3)`,
    [
      accuracy >= 85 ? 'success' : accuracy >= 70 ? 'warning' : 'error',
      'Actuals Recorded',
      `"${est.title}" completed with ${accuracy.toFixed(1)}% accuracy (${variance >= 0 ? '+' : ''}${variance.toFixed(1)} hrs variance)`,
    ]
  );

  res.json({ success: true, data: row });
}

export async function remove(req: Request, res: Response): Promise<void> {
  const existing = await queryOne<{ project_id: string | null }>(`SELECT project_id FROM estimations WHERE id = $1`, [req.params.id]);
  if (!existing) { res.status(404).json({ success: false, error: 'Estimation not found' }); return; }
  assertTaskAccess(req.user, existing);
  await query(`DELETE FROM estimations WHERE id=$1`, [req.params.id]);
  res.json({ success: true, message: 'Estimation deleted' });
}

const importRowSchema = z.object({
  title: z.string().min(1).max(255),
  project_name: z.string().optional(),
  ...taskHierarchyFields,
  description: z.string().optional(),
  complexity: z.enum(['Low', 'Medium', 'High', 'Very High', 'Unmanageable']),
  risk: z.enum(['Low', 'Medium', 'High', 'Very High', 'Unknown']),
  competency: z.enum(['Emerging', 'Competent', 'Expert']),
  work_group: z.enum(['DEVELOPMENT', 'VALIDATION', 'SPECIFICATION']),
  notes: z.string().optional(),
});

const batchImportSchema = z.object({
  /** Default hierarchy applied to every row that does not carry its own (the import dialog's selection). */
  hierarchy: z.object(taskHierarchyFields).optional(),
  rows: z.array(importRowSchema).min(1).max(500),
});

export async function batchImport(req: Request, res: Response): Promise<void> {
  const { rows, hierarchy } = batchImportSchema.parse(req.body);
  const validate = createHierarchyValidator(req.user);
  let created = 0;
  const errors: { row: number; error: string }[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    try {
      const h = await validate(toHierarchyInput(hasHierarchyFields(row) ? row : (hierarchy ?? {})));
      const calc = await runFullEstimation(row.complexity, row.risk, row.competency);
      if (!calc) {
        errors.push({ row: i + 1, error: 'No story point configuration for this Complexity + Risk combination' });
        continue;
      }
      await query(INSERT_SQL, [
        row.title, row.description ?? null, h.program_name, h.program_id, h.department_id,
        h.baseline_id, h.component_id, h.subcomponent_id,
        row.complexity, row.risk, row.competency, row.work_group,
        calc.story_points,
        calc.initial_min_days, calc.initial_max_days,
        calc.initial_min_hours, calc.initial_max_hours,
        calc.overhead_percent,
        calc.revised_min_days, calc.revised_max_days,
        calc.revised_min_hours, calc.revised_max_hours,
        row.notes ?? null, req.user?.userId ?? null,
      ]);
      created++;
    } catch (e) {
      errors.push({ row: i + 1, error: e instanceof Error ? e.message : 'Import failed' });
    }
  }

  if (created > 0) {
    await query(
      `INSERT INTO notifications (type, title, message) VALUES ('info', $1, $2)`,
      ['Bulk Import', `${created} estimation${created !== 1 ? 's' : ''} imported via Excel`]
    ).catch(() => {});
  }

  res.json({ success: true, created, errors });
}
