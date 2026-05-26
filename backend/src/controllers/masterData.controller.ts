import { Request, Response } from 'express';
import { query, queryOne } from '../config/database';
import { z } from 'zod';

// ─── Story Points ───────────────────────────────────────────────────────────

export async function getAllStoryPoints(req: Request, res: Response): Promise<void> {
  const data = await query(
    `SELECT * FROM story_point_configs ORDER BY
       CASE complexity WHEN 'Low' THEN 1 WHEN 'Medium' THEN 2 WHEN 'High' THEN 3
         WHEN 'Very High' THEN 4 WHEN 'Unmanageable' THEN 5 ELSE 6 END,
       CASE risk WHEN 'Low' THEN 1 WHEN 'Medium' THEN 2 WHEN 'High' THEN 3
         WHEN 'Very High' THEN 4 WHEN 'Unknown' THEN 5 ELSE 6 END`
  );
  res.json({ success: true, data });
}

export async function createStoryPoint(req: Request, res: Response): Promise<void> {
  const schema = z.object({
    complexity: z.enum(['Low', 'Medium', 'High', 'Very High', 'Unmanageable']),
    risk: z.enum(['Low', 'Medium', 'High', 'Very High', 'Unknown']),
    story_points: z.number().positive(),
    color_hex: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  });
  const body = schema.parse(req.body);
  const [row] = await query(
    `INSERT INTO story_point_configs (complexity, risk, story_points, color_hex)
     VALUES ($1,$2,$3,$4) RETURNING *`,
    [body.complexity, body.risk, body.story_points, body.color_hex || '#1E3246']
  );
  res.status(201).json({ success: true, data: row });
}

export async function updateStoryPoint(req: Request, res: Response): Promise<void> {
  const { story_points, color_hex } = req.body;
  const row = await queryOne(
    `UPDATE story_point_configs SET story_points=$1, color_hex=COALESCE($2, color_hex)
     WHERE id=$3 RETURNING *`,
    [story_points, color_hex, req.params.id]
  );
  if (!row) { res.status(404).json({ success: false, error: 'Not found' }); return; }
  res.json({ success: true, data: row });
}

export async function deleteStoryPoint(req: Request, res: Response): Promise<void> {
  const row = await queryOne(`DELETE FROM story_point_configs WHERE id=$1 RETURNING id`, [req.params.id]);
  if (!row) { res.status(404).json({ success: false, error: 'Not found' }); return; }
  res.json({ success: true, message: 'Deleted' });
}

// ─── Effort Estimates ────────────────────────────────────────────────────────

export async function getAllEffortEstimates(req: Request, res: Response): Promise<void> {
  const data = await query(`SELECT * FROM effort_estimate_configs ORDER BY story_points`);
  res.json({ success: true, data });
}

export async function createEffortEstimate(req: Request, res: Response): Promise<void> {
  const schema = z.object({
    story_points: z.number().positive(),
    min_days: z.number().positive(),
    max_days: z.number().positive(),
  }).refine(d => d.max_days > d.min_days, { message: 'max_days must be greater than min_days' });
  const body = schema.parse(req.body);
  const [row] = await query(
    `INSERT INTO effort_estimate_configs (story_points, min_days, max_days)
     VALUES ($1,$2,$3) RETURNING *`,
    [body.story_points, body.min_days, body.max_days]
  );
  res.status(201).json({ success: true, data: row });
}

export async function updateEffortEstimate(req: Request, res: Response): Promise<void> {
  const { min_days, max_days } = req.body;
  if (max_days <= min_days) {
    res.status(400).json({ success: false, error: 'max_days must be greater than min_days' });
    return;
  }
  const row = await queryOne(
    `UPDATE effort_estimate_configs SET min_days=$1, max_days=$2 WHERE id=$3 RETURNING *`,
    [min_days, max_days, req.params.id]
  );
  if (!row) { res.status(404).json({ success: false, error: 'Not found' }); return; }
  res.json({ success: true, data: row });
}

export async function deleteEffortEstimate(req: Request, res: Response): Promise<void> {
  const row = await queryOne(`DELETE FROM effort_estimate_configs WHERE id=$1 RETURNING id`, [req.params.id]);
  if (!row) { res.status(404).json({ success: false, error: 'Not found' }); return; }
  res.json({ success: true, message: 'Deleted' });
}

// ─── Competency ───────────────────────────────────────────────────────────────

export async function getAllOverheads(req: Request, res: Response): Promise<void> {
  const data = await query(
    `SELECT * FROM competency_overhead_configs
     ORDER BY CASE competency WHEN 'Emerging' THEN 1 WHEN 'Competent' THEN 2 WHEN 'Expert' THEN 3 ELSE 4 END,
              CASE complexity WHEN 'Low' THEN 1 WHEN 'Medium' THEN 2 WHEN 'High' THEN 3
                WHEN 'Very High' THEN 4 WHEN 'Unmanageable' THEN 5 ELSE 6 END`
  );
  res.json({ success: true, data });
}

export async function updateOverhead(req: Request, res: Response): Promise<void> {
  const { overhead_percent } = req.body;
  if (overhead_percent < 0 || overhead_percent > 1) {
    res.status(400).json({ success: false, error: 'overhead_percent must be between 0 and 1' });
    return;
  }
  const row = await queryOne(
    `UPDATE competency_overhead_configs SET overhead_percent=$1 WHERE id=$2 RETURNING *`,
    [overhead_percent, req.params.id]
  );
  if (!row) { res.status(404).json({ success: false, error: 'Not found' }); return; }
  res.json({ success: true, data: row });
}

export async function getAllCompetencyDefs(req: Request, res: Response): Promise<void> {
  const data = await query(`SELECT * FROM competency_level_definitions ORDER BY sort_order`);
  res.json({ success: true, data });
}

export async function updateCompetencyDef(req: Request, res: Response): Promise<void> {
  const { description, knowledge_depth, independence, problem_solving, communication, mentorship } = req.body;
  const row = await queryOne(
    `UPDATE competency_level_definitions
     SET description=$1, knowledge_depth=$2, independence=$3, problem_solving=$4, communication=$5, mentorship=$6
     WHERE id=$7 RETURNING *`,
    [description, knowledge_depth, independence, problem_solving, communication, mentorship, req.params.id]
  );
  if (!row) { res.status(404).json({ success: false, error: 'Not found' }); return; }
  res.json({ success: true, data: row });
}

// ─── Definitions ──────────────────────────────────────────────────────────────

export async function getComplexityDefs(req: Request, res: Response): Promise<void> {
  const data = await query(`SELECT * FROM complexity_definitions ORDER BY sort_order`);
  res.json({ success: true, data });
}

export async function getRiskDefs(req: Request, res: Response): Promise<void> {
  const data = await query(`SELECT * FROM risk_definitions ORDER BY sort_order`);
  res.json({ success: true, data });
}

// ─── Notifications ────────────────────────────────────────────────────────────

export async function getNotifications(req: Request, res: Response): Promise<void> {
  const data = await query(`SELECT * FROM notifications ORDER BY created_at DESC LIMIT 50`);
  const unread = await query<{ count: string }>(`SELECT COUNT(*) as count FROM notifications WHERE read = false`);
  res.json({ success: true, data, unread_count: parseInt(unread[0]?.count ?? '0') });
}

export async function markNotificationRead(req: Request, res: Response): Promise<void> {
  await query(`UPDATE notifications SET read=true WHERE id=$1`, [req.params.id]);
  res.json({ success: true, message: 'Marked as read' });
}

export async function markAllNotificationsRead(req: Request, res: Response): Promise<void> {
  await query(`UPDATE notifications SET read=true`);
  res.json({ success: true, message: 'All marked as read' });
}
