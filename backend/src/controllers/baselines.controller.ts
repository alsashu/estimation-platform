import { Request, Response } from 'express';
import { z } from 'zod';
import { query, queryOne } from '../config/database';
import { auditLog } from '../services/audit.service';
import { canAccessProgram, isGlobalUser } from '../services/hierarchy.service';

const statusEnum = z.enum(['active', 'inactive']);
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD');

interface BaselineRow {
  id: string; project_id: string; name: string; version: string | null; description: string | null;
  start_date: string | null; end_date: string | null; status: string; is_legacy: boolean;
}

/** Loads a baseline and checks the caller can access its program. Sends 404/403 and returns null on failure. */
async function loadAccessibleBaseline(req: Request, res: Response, id: string): Promise<BaselineRow | null> {
  const row = await queryOne<BaselineRow>(`SELECT * FROM baselines WHERE id = $1`, [id]);
  if (!row) { res.status(404).json({ success: false, error: 'Baseline not found' }); return null; }
  if (!canAccessProgram(req.user, row.project_id)) {
    res.status(403).json({ success: false, error: 'No access to this baseline' }); return null;
  }
  return row;
}

function datesInOrder(start?: string | null, end?: string | null): boolean {
  return !start || !end || end >= start;
}

// ════════════════════════════════════════════════════════════════════════════
// Baselines
// ════════════════════════════════════════════════════════════════════════════

export async function listBaselines(req: Request, res: Response): Promise<void> {
  const { search, status } = req.query;
  const programId = (req.query.programId ?? req.query.program_id ?? req.query.projectId) as string | undefined;
  const departmentId = (req.query.departmentId ?? req.query.department_id) as string | undefined;

  let where = 'WHERE p.deleted_at IS NULL';
  const params: unknown[] = [];
  let i = 1;

  if (!isGlobalUser(req.user)) {
    const ids = (req.user?.projectIds as string[]) ?? [];
    if (ids.length === 0) { res.json({ success: true, data: [], total: 0 }); return; }
    where += ` AND b.project_id = ANY($${i++}::uuid[])`;
    params.push(ids);
  }
  if (programId)    { where += ` AND b.project_id = $${i++}`;    params.push(z.string().uuid().parse(programId)); }
  if (departmentId) { where += ` AND p.department_id = $${i++}`; params.push(z.string().uuid().parse(departmentId)); }
  if (status)       { where += ` AND b.status = $${i++}`;        params.push(statusEnum.parse(status)); }
  if (search)       { where += ` AND (b.name ILIKE $${i} OR b.version ILIKE $${i++})`; params.push(`%${search}%`); }

  const data = await query(
    `SELECT b.*, p.name AS program_name, p.code AS program_code,
            d.id AS department_id, d.name AS department_name,
            (SELECT COUNT(*)::int FROM components c WHERE c.baseline_id = b.id) AS component_count,
            (SELECT COUNT(*)::int FROM estimations e WHERE e.baseline_id = b.id) AS sp_task_count,
            (SELECT COUNT(*)::int FROM parametric_estimations pe WHERE pe.baseline_id = b.id) AS pe_task_count
       FROM baselines b
       JOIN projects p ON p.id = b.project_id
       JOIN departments d ON d.id = p.department_id
       ${where}
      ORDER BY d.name, p.name, b.created_at DESC`,
    params
  );
  res.json({ success: true, data, total: data.length });
}

/** Baseline detail with its Component → Subcomponent tree and task counts per node. */
export async function getBaseline(req: Request, res: Response): Promise<void> {
  const baseline = await loadAccessibleBaseline(req, res, req.params.id);
  if (!baseline) return;

  const meta = await queryOne(
    `SELECT p.name AS program_name, p.code AS program_code, d.id AS department_id, d.name AS department_name
       FROM projects p JOIN departments d ON d.id = p.department_id WHERE p.id = $1`,
    [baseline.project_id]
  );
  const components = await query(
    `SELECT c.id, c.name, c.description, c.created_at,
            (SELECT COUNT(*)::int FROM estimations e WHERE e.component_id = c.id) AS sp_task_count,
            (SELECT COUNT(*)::int FROM parametric_estimations pe WHERE pe.component_id = c.id) AS pe_task_count,
            COALESCE((
              SELECT json_agg(json_build_object(
                       'id', s.id, 'name', s.name, 'description', s.description,
                       'sp_task_count', (SELECT COUNT(*) FROM estimations e WHERE e.subcomponent_id = s.id),
                       'pe_task_count', (SELECT COUNT(*) FROM parametric_estimations pe WHERE pe.subcomponent_id = s.id)
                     ) ORDER BY s.name)
                FROM subcomponents s WHERE s.component_id = c.id
            ), '[]') AS subcomponents
       FROM components c
      WHERE c.baseline_id = $1
      ORDER BY c.name`,
    [baseline.id]
  );
  const counts = await queryOne(
    `SELECT (SELECT COUNT(*)::int FROM estimations WHERE baseline_id = $1) AS sp_task_count,
            (SELECT COUNT(*)::int FROM parametric_estimations WHERE baseline_id = $1) AS pe_task_count,
            (SELECT COUNT(*)::int FROM estimations WHERE baseline_id = $1 AND component_id IS NULL) AS sp_unstructured_count,
            (SELECT COUNT(*)::int FROM parametric_estimations WHERE baseline_id = $1 AND component_id IS NULL) AS pe_unstructured_count`,
    [baseline.id]
  );
  res.json({ success: true, data: { ...baseline, ...(meta ?? {}), ...(counts ?? {}), components } });
}

const baselineCreateSchema = z.object({
  program_id:    z.string().uuid().optional(),
  project_id:    z.string().uuid().optional(),
  department_id: z.string().uuid().optional(),
  name:          z.string().trim().min(1).max(255),
  version:       z.string().trim().max(50).optional(),
  description:   z.string().max(2000).optional(),
  start_date:    dateStr.nullable().optional(),
  end_date:      dateStr.nullable().optional(),
  status:        statusEnum.optional(),
}).refine(b => !!(b.program_id ?? b.project_id), { message: 'Program is required', path: ['program_id'] });

export async function createBaseline(req: Request, res: Response): Promise<void> {
  if (!req.user) { res.status(401).json({ success: false, error: 'Not authenticated' }); return; }
  const body = baselineCreateSchema.parse(req.body);
  const programId = (body.program_id ?? body.project_id)!;

  const program = await queryOne<{ id: string; name: string; status: string; department_id: string }>(
    `SELECT id, name, status, department_id FROM projects WHERE id = $1 AND deleted_at IS NULL`, [programId]
  );
  if (!program) { res.status(400).json({ success: false, error: 'Program not found' }); return; }
  if (body.department_id && body.department_id !== program.department_id) {
    res.status(400).json({ success: false, error: 'Program does not belong to the selected Department' }); return;
  }
  if (!canAccessProgram(req.user, program.id)) {
    res.status(403).json({ success: false, error: 'No access to this program' }); return;
  }
  if (program.status !== 'active') {
    res.status(400).json({ success: false, error: `Cannot add a baseline to inactive program "${program.name}"` }); return;
  }
  if (!datesInOrder(body.start_date, body.end_date)) {
    res.status(400).json({ success: false, error: 'End date must be on or after the start date' }); return;
  }
  const dup = await queryOne(`SELECT id FROM baselines WHERE project_id = $1 AND LOWER(name) = LOWER($2)`, [program.id, body.name]);
  if (dup) { res.status(409).json({ success: false, error: 'A baseline with this name already exists in the program' }); return; }

  const [row] = await query<BaselineRow>(
    `INSERT INTO baselines (project_id, name, version, description, start_date, end_date, status, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [program.id, body.name, body.version ?? null, body.description ?? null,
     body.start_date ?? null, body.end_date ?? null, body.status ?? 'active', req.user.userId]
  );
  await auditLog({ entity: 'baseline', entityId: row.id, action: 'created', newValue: body, user: req.user, req });
  res.status(201).json({ success: true, data: row });
}

const baselineUpdateSchema = z.object({
  name:        z.string().trim().min(1).max(255).optional(),
  version:     z.string().trim().max(50).nullable().optional(),
  description: z.string().max(2000).nullable().optional(),
  start_date:  dateStr.nullable().optional(),
  end_date:    dateStr.nullable().optional(),
  status:      statusEnum.optional(),
}).strict();   // program_id is immutable — rejecting it explicitly avoids silent re-parenting

export async function updateBaseline(req: Request, res: Response): Promise<void> {
  if (!req.user) { res.status(401).json({ success: false, error: 'Not authenticated' }); return; }
  const body = baselineUpdateSchema.parse(req.body);
  const existing = await loadAccessibleBaseline(req, res, req.params.id);
  if (!existing) return;

  const start = body.start_date !== undefined ? body.start_date : existing.start_date;
  const end   = body.end_date   !== undefined ? body.end_date   : existing.end_date;
  if (!datesInOrder(start && String(start).slice(0, 10), end && String(end).slice(0, 10))) {
    res.status(400).json({ success: false, error: 'End date must be on or after the start date' }); return;
  }
  if (body.name) {
    const dup = await queryOne(
      `SELECT id FROM baselines WHERE project_id = $1 AND LOWER(name) = LOWER($2) AND id <> $3`,
      [existing.project_id, body.name, existing.id]
    );
    if (dup) { res.status(409).json({ success: false, error: 'A baseline with this name already exists in the program' }); return; }
  }

  // Build SET list so explicit nulls clear optional fields
  const sets: string[] = [];
  const vals: unknown[] = [];
  let i = 1;
  for (const [k, v] of Object.entries(body)) {
    if (v === undefined) continue;
    sets.push(`${k} = $${i++}`);
    vals.push(v);
  }
  if (sets.length === 0) { res.json({ success: true, data: existing }); return; }
  sets.push(`updated_by = $${i++}`); vals.push(req.user.userId);
  vals.push(existing.id);

  const [row] = await query(`UPDATE baselines SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`, vals);
  await auditLog({ entity: 'baseline', entityId: existing.id, action: 'updated', previousValue: existing, newValue: body, user: req.user, req });
  res.json({ success: true, data: row });
}

export async function setBaselineStatus(req: Request, res: Response): Promise<void> {
  if (!req.user) { res.status(401).json({ success: false, error: 'Not authenticated' }); return; }
  const { status } = z.object({ status: statusEnum }).parse(req.body);
  const existing = await loadAccessibleBaseline(req, res, req.params.id);
  if (!existing) return;

  const [row] = await query(`UPDATE baselines SET status = $1, updated_by = $2 WHERE id = $3 RETURNING *`, [status, req.user.userId, existing.id]);
  await auditLog({ entity: 'baseline', entityId: existing.id, action: status === 'active' ? 'activated' : 'deactivated', user: req.user, req });
  res.json({ success: true, data: row });
}

/** Only empty baselines (no SP/PE tasks) may be deleted; components/subcomponents are removed with it. */
export async function deleteBaseline(req: Request, res: Response): Promise<void> {
  if (!req.user) { res.status(401).json({ success: false, error: 'Not authenticated' }); return; }
  const existing = await loadAccessibleBaseline(req, res, req.params.id);
  if (!existing) return;

  const used = await queryOne<{ n: number }>(
    `SELECT ((SELECT COUNT(*) FROM estimations WHERE baseline_id = $1) +
             (SELECT COUNT(*) FROM parametric_estimations WHERE baseline_id = $1))::int AS n`,
    [existing.id]
  );
  if ((used?.n ?? 0) > 0) {
    res.status(409).json({ success: false, error: `Baseline has ${used!.n} task(s) and cannot be deleted — deactivate it instead` }); return;
  }
  await query(`DELETE FROM baselines WHERE id = $1`, [existing.id]);
  await auditLog({ entity: 'baseline', entityId: existing.id, action: 'deleted', previousValue: existing, user: req.user, req });
  res.json({ success: true, message: 'Baseline deleted' });
}

// ════════════════════════════════════════════════════════════════════════════
// Components
// ════════════════════════════════════════════════════════════════════════════

const nodeSchema = z.object({
  name:        z.string().trim().min(1).max(255),
  description: z.string().max(2000).nullable().optional(),
});

export async function listComponents(req: Request, res: Response): Promise<void> {
  const baselineId = z.string().uuid().parse(req.query.baselineId ?? req.query.baseline_id);
  const baseline = await loadAccessibleBaseline(req, res, baselineId);
  if (!baseline) return;
  const data = await query(
    `SELECT c.*,
            (SELECT COUNT(*)::int FROM subcomponents s WHERE s.component_id = c.id) AS subcomponent_count,
            (SELECT COUNT(*)::int FROM estimations e WHERE e.component_id = c.id) AS sp_task_count,
            (SELECT COUNT(*)::int FROM parametric_estimations pe WHERE pe.component_id = c.id) AS pe_task_count
       FROM components c WHERE c.baseline_id = $1 ORDER BY c.name`,
    [baseline.id]
  );
  res.json({ success: true, data });
}

export async function createComponent(req: Request, res: Response): Promise<void> {
  if (!req.user) { res.status(401).json({ success: false, error: 'Not authenticated' }); return; }
  const body = nodeSchema.extend({ baseline_id: z.string().uuid() }).parse(req.body);

  const baseline = await queryOne<BaselineRow>(`SELECT * FROM baselines WHERE id = $1`, [body.baseline_id]);
  if (!baseline) { res.status(400).json({ success: false, error: 'Baseline not found' }); return; }
  if (!canAccessProgram(req.user, baseline.project_id)) {
    res.status(403).json({ success: false, error: 'No access to this baseline' }); return;
  }
  const dup = await queryOne(`SELECT id FROM components WHERE baseline_id = $1 AND LOWER(name) = LOWER($2)`, [baseline.id, body.name]);
  if (dup) { res.status(409).json({ success: false, error: 'A component with this name already exists in the baseline' }); return; }

  const [row] = await query<{ id: string }>(
    `INSERT INTO components (baseline_id, name, description, created_by) VALUES ($1,$2,$3,$4) RETURNING *`,
    [baseline.id, body.name, body.description ?? null, req.user.userId]
  );
  await auditLog({ entity: 'component', entityId: row.id, action: 'created', newValue: body, user: req.user, req });
  res.status(201).json({ success: true, data: row });
}

async function loadAccessibleComponent(req: Request, res: Response, id: string) {
  const row = await queryOne<{ id: string; name: string; baseline_id: string; project_id: string }>(
    `SELECT c.*, b.project_id FROM components c JOIN baselines b ON b.id = c.baseline_id WHERE c.id = $1`, [id]
  );
  if (!row) { res.status(404).json({ success: false, error: 'Component not found' }); return null; }
  if (!canAccessProgram(req.user, row.project_id)) {
    res.status(403).json({ success: false, error: 'No access to this component' }); return null;
  }
  return row;
}

export async function updateComponent(req: Request, res: Response): Promise<void> {
  if (!req.user) { res.status(401).json({ success: false, error: 'Not authenticated' }); return; }
  const body = nodeSchema.partial().strict().parse(req.body);
  const existing = await loadAccessibleComponent(req, res, req.params.id);
  if (!existing) return;

  if (body.name) {
    const dup = await queryOne(
      `SELECT id FROM components WHERE baseline_id = $1 AND LOWER(name) = LOWER($2) AND id <> $3`,
      [existing.baseline_id, body.name, existing.id]
    );
    if (dup) { res.status(409).json({ success: false, error: 'A component with this name already exists in the baseline' }); return; }
  }
  const [row] = await query(
    `UPDATE components SET name = COALESCE($1, name),
            description = CASE WHEN $2::boolean THEN $3 ELSE description END, updated_by = $4
      WHERE id = $5 RETURNING *`,
    [body.name ?? null, body.description !== undefined, body.description ?? null, req.user.userId, existing.id]
  );
  await auditLog({ entity: 'component', entityId: existing.id, action: 'updated', previousValue: existing, newValue: body, user: req.user, req });
  res.json({ success: true, data: row });
}

/** Deletion is permitted only when no task references the component or any of its subcomponents. */
export async function deleteComponent(req: Request, res: Response): Promise<void> {
  if (!req.user) { res.status(401).json({ success: false, error: 'Not authenticated' }); return; }
  const existing = await loadAccessibleComponent(req, res, req.params.id);
  if (!existing) return;

  const used = await queryOne<{ n: number }>(
    `SELECT ((SELECT COUNT(*) FROM estimations WHERE component_id = $1) +
             (SELECT COUNT(*) FROM parametric_estimations WHERE component_id = $1))::int AS n`,
    [existing.id]
  );
  if ((used?.n ?? 0) > 0) {
    res.status(409).json({ success: false, error: `Component is used by ${used!.n} task(s) and cannot be deleted` }); return;
  }
  await query(`DELETE FROM components WHERE id = $1`, [existing.id]);
  await auditLog({ entity: 'component', entityId: existing.id, action: 'deleted', previousValue: existing, user: req.user, req });
  res.json({ success: true, message: 'Component deleted' });
}

// ════════════════════════════════════════════════════════════════════════════
// Subcomponents
// ════════════════════════════════════════════════════════════════════════════

export async function listSubcomponents(req: Request, res: Response): Promise<void> {
  const componentId = z.string().uuid().parse(req.query.componentId ?? req.query.component_id);
  const component = await loadAccessibleComponent(req, res, componentId);
  if (!component) return;
  const data = await query(
    `SELECT s.*,
            (SELECT COUNT(*)::int FROM estimations e WHERE e.subcomponent_id = s.id) AS sp_task_count,
            (SELECT COUNT(*)::int FROM parametric_estimations pe WHERE pe.subcomponent_id = s.id) AS pe_task_count
       FROM subcomponents s WHERE s.component_id = $1 ORDER BY s.name`,
    [component.id]
  );
  res.json({ success: true, data });
}

export async function createSubcomponent(req: Request, res: Response): Promise<void> {
  if (!req.user) { res.status(401).json({ success: false, error: 'Not authenticated' }); return; }
  const body = nodeSchema.extend({ component_id: z.string().uuid() }).parse(req.body);

  const component = await queryOne<{ id: string; project_id: string }>(
    `SELECT c.id, b.project_id FROM components c JOIN baselines b ON b.id = c.baseline_id WHERE c.id = $1`, [body.component_id]
  );
  if (!component) { res.status(400).json({ success: false, error: 'Component not found' }); return; }
  if (!canAccessProgram(req.user, component.project_id)) {
    res.status(403).json({ success: false, error: 'No access to this component' }); return;
  }
  const dup = await queryOne(`SELECT id FROM subcomponents WHERE component_id = $1 AND LOWER(name) = LOWER($2)`, [component.id, body.name]);
  if (dup) { res.status(409).json({ success: false, error: 'A subcomponent with this name already exists in the component' }); return; }

  const [row] = await query<{ id: string }>(
    `INSERT INTO subcomponents (component_id, name, description, created_by) VALUES ($1,$2,$3,$4) RETURNING *`,
    [component.id, body.name, body.description ?? null, req.user.userId]
  );
  await auditLog({ entity: 'subcomponent', entityId: row.id, action: 'created', newValue: body, user: req.user, req });
  res.status(201).json({ success: true, data: row });
}

async function loadAccessibleSubcomponent(req: Request, res: Response, id: string) {
  const row = await queryOne<{ id: string; name: string; component_id: string; project_id: string }>(
    `SELECT s.*, b.project_id FROM subcomponents s
       JOIN components c ON c.id = s.component_id JOIN baselines b ON b.id = c.baseline_id
      WHERE s.id = $1`, [id]
  );
  if (!row) { res.status(404).json({ success: false, error: 'Subcomponent not found' }); return null; }
  if (!canAccessProgram(req.user, row.project_id)) {
    res.status(403).json({ success: false, error: 'No access to this subcomponent' }); return null;
  }
  return row;
}

export async function updateSubcomponent(req: Request, res: Response): Promise<void> {
  if (!req.user) { res.status(401).json({ success: false, error: 'Not authenticated' }); return; }
  const body = nodeSchema.partial().strict().parse(req.body);
  const existing = await loadAccessibleSubcomponent(req, res, req.params.id);
  if (!existing) return;

  if (body.name) {
    const dup = await queryOne(
      `SELECT id FROM subcomponents WHERE component_id = $1 AND LOWER(name) = LOWER($2) AND id <> $3`,
      [existing.component_id, body.name, existing.id]
    );
    if (dup) { res.status(409).json({ success: false, error: 'A subcomponent with this name already exists in the component' }); return; }
  }
  const [row] = await query(
    `UPDATE subcomponents SET name = COALESCE($1, name),
            description = CASE WHEN $2::boolean THEN $3 ELSE description END, updated_by = $4
      WHERE id = $5 RETURNING *`,
    [body.name ?? null, body.description !== undefined, body.description ?? null, req.user.userId, existing.id]
  );
  await auditLog({ entity: 'subcomponent', entityId: existing.id, action: 'updated', previousValue: existing, newValue: body, user: req.user, req });
  res.json({ success: true, data: row });
}

export async function deleteSubcomponent(req: Request, res: Response): Promise<void> {
  if (!req.user) { res.status(401).json({ success: false, error: 'Not authenticated' }); return; }
  const existing = await loadAccessibleSubcomponent(req, res, req.params.id);
  if (!existing) return;

  const used = await queryOne<{ n: number }>(
    `SELECT ((SELECT COUNT(*) FROM estimations WHERE subcomponent_id = $1) +
             (SELECT COUNT(*) FROM parametric_estimations WHERE subcomponent_id = $1))::int AS n`,
    [existing.id]
  );
  if ((used?.n ?? 0) > 0) {
    res.status(409).json({ success: false, error: `Subcomponent is used by ${used!.n} task(s) and cannot be deleted` }); return;
  }
  await query(`DELETE FROM subcomponents WHERE id = $1`, [existing.id]);
  await auditLog({ entity: 'subcomponent', entityId: existing.id, action: 'deleted', previousValue: existing, user: req.user, req });
  res.json({ success: true, message: 'Subcomponent deleted' });
}
