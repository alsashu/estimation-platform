import { Request, Response } from 'express';
import { query } from '../config/database';

export async function listAuditLogs(req: Request, res: Response): Promise<void> {
  const { page = 1, limit = 50, entity, action, userId, from, to } = req.query;
  const offset = (Number(page) - 1) * Number(limit);

  let where = 'WHERE 1=1';
  const params: unknown[] = [];
  let i = 1;

  if (entity) { where += ` AND entity = $${i++}`;  params.push(entity); }
  if (action) { where += ` AND action = $${i++}`;  params.push(action); }
  if (userId) { where += ` AND user_id = $${i++}`; params.push(userId); }
  if (from)   { where += ` AND timestamp >= $${i++}`; params.push(from); }
  if (to)     { where += ` AND timestamp <= $${i++}`; params.push(to); }

  const data = await query(
    `SELECT * FROM audit_logs ${where} ORDER BY timestamp DESC LIMIT $${i} OFFSET $${i + 1}`,
    [...params, Number(limit), offset]
  );
  const countRows = await query<{ count: string }>(
    `SELECT COUNT(*) as count FROM audit_logs ${where}`, params
  );

  res.json({
    success: true, data,
    total: parseInt(countRows[0]?.count ?? '0'),
    page: Number(page), limit: Number(limit),
  });
}
