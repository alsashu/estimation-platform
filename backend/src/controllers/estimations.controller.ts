import { Request, Response } from 'express';
import { query, queryOne } from '../config/database';
import { runFullEstimation } from '../services/estimationEngine';
import { z } from 'zod';

const createSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  project_name: z.string().optional(),
  complexity: z.enum(['Low', 'Medium', 'High', 'Very High', 'Unmanageable']),
  risk: z.enum(['Low', 'Medium', 'High', 'Very High', 'Unknown']),
  competency: z.enum(['Emerging', 'Competent', 'Expert']),
  notes: z.string().optional(),
});

const actualsSchema = z.object({
  actual_hours: z.number().positive(),
  completed_at: z.string().optional(),
  notes: z.string().optional(),
});

export async function getAll(req: Request, res: Response): Promise<void> {
  const { page = 1, limit = 20, status, complexity, risk, project_name, search } = req.query;
  const offset = (Number(page) - 1) * Number(limit);

  let where = 'WHERE 1=1';
  const params: unknown[] = [];
  let i = 1;

  if (status)       { where += ` AND status = $${i++}`;        params.push(status); }
  if (complexity)   { where += ` AND complexity = $${i++}`;    params.push(complexity); }
  if (risk)         { where += ` AND risk = $${i++}`;          params.push(risk); }
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

  const [row] = await query(
    `INSERT INTO estimations
       (title, description, project_name, complexity, risk, competency,
        story_points, initial_min_days, initial_max_days, initial_min_hours, initial_max_hours,
        overhead_percent, revised_min_days, revised_max_days, revised_min_hours, revised_max_hours, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
     RETURNING *`,
    [
      body.title, body.description, body.project_name,
      body.complexity, body.risk, body.competency,
      calc.story_points,
      calc.initial_min_days, calc.initial_max_days,
      calc.initial_min_hours, calc.initial_max_hours,
      calc.overhead_percent,
      calc.revised_min_days, calc.revised_max_days,
      calc.revised_min_hours, calc.revised_max_hours,
      body.notes,
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
  const est = await queryOne<{ revised_min_hours: number; title: string }>(
    `SELECT revised_min_hours, title FROM estimations WHERE id = $1`, [req.params.id]
  );
  if (!est) { res.status(404).json({ success: false, error: 'Estimation not found' }); return; }

  const minHours = Number(est.revised_min_hours);
  const variance = body.actual_hours - minHours;
  const accuracy = minHours > 0 ? Math.max(0, (1 - Math.abs(variance) / minHours) * 100) : 0;
  const actualDays = body.actual_hours / 8;

  const row = await queryOne(
    `UPDATE estimations
     SET actual_hours=$1, actual_days=$2, completed_at=$3, variance_hours=$4,
         accuracy_percent=$5, notes=COALESCE($6, notes), status='completed'
     WHERE id=$7 RETURNING *`,
    [body.actual_hours, actualDays, body.completed_at || new Date().toISOString(), variance, accuracy, body.notes, req.params.id]
  );

  await query(
    `INSERT INTO notifications (type, title, message) VALUES ($1, $2, $3)`,
    [
      accuracy >= 85 ? 'success' : accuracy >= 70 ? 'warning' : 'error',
      'Estimate Submitted',
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
