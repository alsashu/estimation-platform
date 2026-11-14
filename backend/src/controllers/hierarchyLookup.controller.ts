/**
 * Lightweight, permission-filtered lookups that power the header context selector and the cascading
 * Department → Program → Baseline → Component → Subcomponent dropdowns in SP and PE.
 *
 * Only ACTIVE departments / programs / baselines are returned (they are what a task may be created
 * under). Authorisation is enforced here — the UI filtering is a convenience only.
 */
import { Request, Response } from 'express';
import { z } from 'zod';
import { query, queryOne } from '../config/database';
import { canAccessDepartment, canAccessProgram, isGlobalUser } from '../services/hierarchy.service';

const uuid = z.string().uuid();

function searchClause(search: unknown, column: string, extra: string[] = []): { sql: string; value?: string } {
  if (typeof search !== 'string' || !search.trim()) return { sql: '' };
  const cols = [column, ...extra].map(c => `${c} ILIKE $SEARCH`).join(' OR ');
  return { sql: ` AND (${cols})`, value: `%${search.trim()}%` };
}

/** GET /hierarchy/context — everything the header needs in one round-trip. */
export async function getMyContext(req: Request, res: Response): Promise<void> {
  const global = isGlobalUser(req.user);
  const deptIds = Array.isArray(req.user?.departmentIds) ? req.user!.departmentIds : [];
  const programIds = Array.isArray(req.user?.projectIds) ? req.user!.projectIds : [];

  const departments = global
    ? await query(`SELECT id, name, code, is_system FROM departments WHERE status = 'active' ORDER BY is_system, name`)
    : deptIds.length === 0 ? [] : await query(
        `SELECT id, name, code, is_system FROM departments WHERE status = 'active' AND id = ANY($1::uuid[]) ORDER BY is_system, name`,
        [deptIds]
      );

  const programs = global
    ? await query(
        `SELECT p.id, p.name, p.code, p.department_id FROM projects p
           JOIN departments d ON d.id = p.department_id AND d.status = 'active'
          WHERE p.deleted_at IS NULL AND p.status = 'active' ORDER BY p.name`)
    : programIds.length === 0 ? [] : await query(
        `SELECT p.id, p.name, p.code, p.department_id FROM projects p
           JOIN departments d ON d.id = p.department_id AND d.status = 'active'
          WHERE p.deleted_at IS NULL AND p.status = 'active' AND p.id = ANY($1::uuid[]) ORDER BY p.name`,
        [programIds]
      );

  res.json({ success: true, data: { isGlobal: global, departments, programs } });
}

export async function lookupDepartments(req: Request, res: Response): Promise<void> {
  const params: unknown[] = [];
  let where = `WHERE d.status = 'active'`;
  if (!isGlobalUser(req.user)) {
    const ids = Array.isArray(req.user?.departmentIds) ? req.user!.departmentIds : [];
    if (ids.length === 0) { res.json({ success: true, data: [] }); return; }
    params.push(ids);
    where += ` AND d.id = ANY($${params.length}::uuid[])`;
  }
  const s = searchClause(req.query.search, 'd.name', ['d.code']);
  if (s.value) { params.push(s.value); where += s.sql.replace(/\$SEARCH/g, `$${params.length}`); }

  const data = await query(`SELECT d.id, d.name, d.code FROM departments d ${where} ORDER BY d.is_system, d.name LIMIT 200`, params);
  res.json({ success: true, data });
}

export async function lookupPrograms(req: Request, res: Response): Promise<void> {
  const departmentId = uuid.parse(req.query.departmentId ?? req.query.department_id);
  if (!canAccessDepartment(req.user, departmentId)) { res.json({ success: true, data: [] }); return; }

  const params: unknown[] = [departmentId];
  let where = `WHERE p.department_id = $1 AND p.deleted_at IS NULL AND p.status = 'active'`;
  if (!isGlobalUser(req.user)) {
    params.push(req.user!.projectIds as string[]);
    where += ` AND p.id = ANY($${params.length}::uuid[])`;
  }
  const s = searchClause(req.query.search, 'p.name', ['p.code']);
  if (s.value) { params.push(s.value); where += s.sql.replace(/\$SEARCH/g, `$${params.length}`); }

  const data = await query(`SELECT p.id, p.name, p.code, p.department_id FROM projects p ${where} ORDER BY p.name LIMIT 200`, params);
  res.json({ success: true, data });
}

export async function lookupBaselines(req: Request, res: Response): Promise<void> {
  const programId = uuid.parse(req.query.programId ?? req.query.program_id ?? req.query.projectId);
  if (!canAccessProgram(req.user, programId)) { res.json({ success: true, data: [] }); return; }

  const params: unknown[] = [programId];
  let where = `WHERE b.project_id = $1 AND b.status = 'active'`;
  const s = searchClause(req.query.search, 'b.name', ['b.version']);
  if (s.value) { params.push(s.value); where += s.sql.replace(/\$SEARCH/g, `$${params.length}`); }

  const data = await query(
    `SELECT b.id, b.name, b.version, b.project_id, b.is_legacy FROM baselines b ${where}
      ORDER BY b.is_legacy, b.created_at DESC LIMIT 200`,
    params
  );
  res.json({ success: true, data });
}

export async function lookupComponents(req: Request, res: Response): Promise<void> {
  const baselineId = uuid.parse(req.query.baselineId ?? req.query.baseline_id);
  const baseline = await queryOne<{ project_id: string }>(`SELECT project_id FROM baselines WHERE id = $1`, [baselineId]);
  if (!baseline || !canAccessProgram(req.user, baseline.project_id)) { res.json({ success: true, data: [] }); return; }

  const params: unknown[] = [baselineId];
  let where = `WHERE c.baseline_id = $1`;
  const s = searchClause(req.query.search, 'c.name');
  if (s.value) { params.push(s.value); where += s.sql.replace(/\$SEARCH/g, `$${params.length}`); }

  const data = await query(`SELECT c.id, c.name, c.baseline_id FROM components c ${where} ORDER BY c.name LIMIT 200`, params);
  res.json({ success: true, data });
}

export async function lookupSubcomponents(req: Request, res: Response): Promise<void> {
  const componentId = uuid.parse(req.query.componentId ?? req.query.component_id);
  const component = await queryOne<{ project_id: string }>(
    `SELECT b.project_id FROM components c JOIN baselines b ON b.id = c.baseline_id WHERE c.id = $1`, [componentId]
  );
  if (!component || !canAccessProgram(req.user, component.project_id)) { res.json({ success: true, data: [] }); return; }

  const params: unknown[] = [componentId];
  let where = `WHERE s.component_id = $1`;
  const s = searchClause(req.query.search, 's.name');
  if (s.value) { params.push(s.value); where += s.sql.replace(/\$SEARCH/g, `$${params.length}`); }

  const data = await query(`SELECT s.id, s.name, s.component_id FROM subcomponents s ${where} ORDER BY s.name LIMIT 200`, params);
  res.json({ success: true, data });
}
