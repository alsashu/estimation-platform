import { Request, Response } from 'express';
import { query, queryOne } from '../config/database';
import { runFullEstimation } from '../services/estimationEngine';
import { z } from 'zod';

const createSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  project_name: z.string().optional(),
  project_id: z.string().uuid().optional(),
  complexity: z.enum(['Low', 'Medium', 'High', 'Very High', 'Unmanageable']),
  risk: z.enum(['Low', 'Medium', 'High', 'Very High', 'Unknown']),
  competency: z.enum(['Emerging', 'Competent', 'Expert']),
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

export async function getAll(req: Request, res: Response): Promise<void> {
  const { page = 1, limit = 20, status, complexity, risk, project_name, search, project_id } = req.query;
  const offset = (Number(page) - 1) * Number(limit);

  let where = 'WHERE 1=1';
  const params: unknown[] = [];
  let i = 1;

  // Project-based access scoping
  if (req.user && req.user.projectIds !== '*') {
    const ids = req.user.projectIds as string[];
    if (ids.length === 0) {
      res.json({ success: true, data: [], total: 0, page: Number(page), limit: Number(limit) });
      return;
    }
    where += ` AND project_id = ANY($${i++}::uuid[])`;
    params.push(ids);
  }

  if (status)       { where += ` AND status = $${i++}`;        params.push(status); }
  if (complexity)   { where += ` AND complexity = $${i++}`;    params.push(complexity); }
  if (risk)         { where += ` AND risk = $${i++}`;          params.push(risk); }
  if (project_id)   { where += ` AND project_id = $${i++}`;   params.push(project_id); }
  if (project_name) { where += ` AND project_name ILIKE $${i++}`; params.push(`%${project_name}%`); }
  if (search)       { where += ` AND (title ILIKE $${i++} OR project_name ILIKE $${i} OR description ILIKE $${i++})`; params.push(`%${search}%`, `%${search}%`, `%${search}%`); }

  const data = await query(
    `SELECT * FROM estimations ${where} ORDER BY created_at DESC LIMIT $${i} OFFSET $${i + 1}`,
    [...params, Number(limit), offset]
  );
  const countRows = await query<{ count: string }>(
    `SELECT COUNT(*) as count FROM estimations ${where}`, params
  );
  const total = parseInt(countRows[0]?.count ?? '0');

  res.json({ success: true, data, total, page: Number(page), limit: Number(limit) });
}

export async function getById(req: Request, res: Response): Promise<void> {
  const row = await queryOne(`SELECT * FROM estimations WHERE id = $1`, [req.params.id]);
  if (!row) { res.status(404).json({ success: false, error: 'Estimation not found' }); return; }
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

export async function create(req: Request, res: Response): Promise<void> {
  const body = createSchema.parse(req.body);
  const calc = await runFullEstimation(body.complexity, body.risk, body.competency);
  if (!calc) {
    res.status(404).json({ success: false, error: 'No story point configuration for this Complexity + Risk combination' });
    return;
  }

  const createdBy = req.user?.userId ?? null;

  const [row] = await query(
    `INSERT INTO estimations
       (title, description, project_name, project_id, complexity, risk, competency,
        story_points, initial_min_days, initial_max_days, initial_min_hours, initial_max_hours,
        overhead_percent, revised_min_days, revised_max_days, revised_min_hours, revised_max_hours, notes, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
     RETURNING *`,
    [
      body.title, body.description, body.project_name, body.project_id ?? null,
      body.complexity, body.risk, body.competency,
      calc.story_points,
      calc.initial_min_days, calc.initial_max_days,
      calc.initial_min_hours, calc.initial_max_hours,
      calc.overhead_percent,
      calc.revised_min_days, calc.revised_max_days,
      calc.revised_min_hours, calc.revised_max_hours,
      body.notes, createdBy,
    ]
  );

  // Create notification
  await query(
    `INSERT INTO notifications (type, title, message) VALUES ('success', $1, $2)`,
    ['New Estimation Created', `"${body.title}" — ${calc.story_points} SP, ${calc.revised_min_hours.toFixed(1)}–${calc.revised_max_hours.toFixed(1)} hrs revised`]
  );

  res.status(201).json({ success: true, data: row });
}

export async function update(req: Request, res: Response): Promise<void> {
  const { title, description, project_name, notes } = req.body;
  const row = await queryOne(
    `UPDATE estimations SET title=$1, description=$2, project_name=$3, notes=$4 WHERE id=$5 RETURNING *`,
    [title, description, project_name, notes, req.params.id]
  );
  if (!row) { res.status(404).json({ success: false, error: 'Estimation not found' }); return; }
  res.json({ success: true, data: row });
}

export async function recordActuals(req: Request, res: Response): Promise<void> {
  const body = actualsSchema.parse(req.body);
  const est = await queryOne<{ estimated_hours: number | null; revised_min_hours: number; title: string }>(
    `SELECT estimated_hours, revised_min_hours, title FROM estimations WHERE id = $1`, [req.params.id]
  );
  if (!est) { res.status(404).json({ success: false, error: 'Estimation not found' }); return; }

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
  const row = await queryOne(`DELETE FROM estimations WHERE id=$1 RETURNING id`, [req.params.id]);
  if (!row) { res.status(404).json({ success: false, error: 'Estimation not found' }); return; }
  res.json({ success: true, message: 'Estimation deleted' });
}

const importRowSchema = z.object({
  title: z.string().min(1).max(255),
  project_name: z.string().optional(),
  project_id: z.string().uuid().optional(),
  description: z.string().optional(),
  complexity: z.enum(['Low', 'Medium', 'High', 'Very High', 'Unmanageable']),
  risk: z.enum(['Low', 'Medium', 'High', 'Very High', 'Unknown']),
  competency: z.enum(['Emerging', 'Competent', 'Expert']),
  notes: z.string().optional(),
});

const batchImportSchema = z.object({
  rows: z.array(importRowSchema).min(1).max(500),
});

export async function batchImport(req: Request, res: Response): Promise<void> {
  const { rows } = batchImportSchema.parse(req.body);
  let created = 0;
  const errors: { row: number; error: string }[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    try {
      const calc = await runFullEstimation(row.complexity, row.risk, row.competency);
      if (!calc) {
        errors.push({ row: i + 1, error: 'No story point configuration for this Complexity + Risk combination' });
        continue;
      }
      await query(
        `INSERT INTO estimations
           (title, description, project_name, project_id, complexity, risk, competency,
            story_points, initial_min_days, initial_max_days, initial_min_hours, initial_max_hours,
            overhead_percent, revised_min_days, revised_max_days, revised_min_hours, revised_max_hours, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
        [
          row.title, row.description ?? null, row.project_name ?? null, row.project_id ?? null,
          row.complexity, row.risk, row.competency,
          calc.story_points,
          calc.initial_min_days, calc.initial_max_days,
          calc.initial_min_hours, calc.initial_max_hours,
          calc.overhead_percent,
          calc.revised_min_days, calc.revised_max_days,
          calc.revised_min_hours, calc.revised_max_hours,
          row.notes ?? null,
        ]
      );
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
