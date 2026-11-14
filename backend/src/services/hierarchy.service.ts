/**
 * Organisational hierarchy — shared access, scoping and validation logic.
 *
 * Used identically by Storypoint (SP) and Parametric (PE) estimation so the two modules share one
 * permission model while their calculation engines stay independent.
 */
import { Request } from 'express';
import { z } from 'zod';
import { query, queryOne } from '../config/database';
import type { JwtPayload } from '../auth/jwt';

// ─── Errors ───────────────────────────────────────────────────────────────────

export class HierarchyError extends Error {
  constructor(message: string, public statusCode: number = 400) {
    super(message);
    this.name = 'HierarchyError';
  }
}

// ─── Access context ──────────────────────────────────────────────────────────

/** Global users (GSA) bypass department/program scoping. */
export function isGlobalUser(user?: Pick<JwtPayload, 'projectIds'> | null): boolean {
  return !!user && user.projectIds === '*';
}

export function canAccessProgram(user: JwtPayload | undefined, programId: string): boolean {
  if (!user) return false;
  if (user.projectIds === '*') return true;
  return (user.projectIds as string[]).includes(programId);
}

export function canAccessDepartment(user: JwtPayload | undefined, departmentId: string): boolean {
  if (!user) return false;
  if (user.projectIds === '*' || user.departmentIds === '*') return true;
  // Tokens issued before departments existed have no departmentIds — fall back to "no access".
  return Array.isArray(user.departmentIds) && user.departmentIds.includes(departmentId);
}

/**
 * Computes the department and program ids a user may access.
 *
 *  • A user sees a department when they have a user_departments row for it.
 *  • A user sees a program when
 *      – they are assigned to it (project_users) AND are a member of its department, or
 *      – they have access_scope = 'all' on its department (department-level access).
 *  Program access therefore always respects the parent department relationship.
 */
export async function computeAccess(
  userId: string,
  isGlobal: boolean
): Promise<{ departmentIds: string[] | '*'; projectIds: string[] | '*' }> {
  if (isGlobal) return { departmentIds: '*', projectIds: '*' };

  const depts = await query<{ department_id: string }>(
    `SELECT department_id FROM user_departments WHERE user_id = $1`,
    [userId]
  );
  const programs = await query<{ id: string }>(
    `SELECT p.id FROM projects p
      WHERE p.deleted_at IS NULL AND (
        EXISTS (SELECT 1 FROM project_users pu
                  JOIN user_departments ud ON ud.user_id = pu.user_id AND ud.department_id = p.department_id
                 WHERE pu.project_id = p.id AND pu.user_id = $1)
        OR EXISTS (SELECT 1 FROM user_departments ud
                    WHERE ud.user_id = $1 AND ud.department_id = p.department_id AND ud.access_scope = 'all')
      )`,
    [userId]
  );
  return {
    departmentIds: depts.map(d => d.department_id),
    projectIds: programs.map(p => p.id),
  };
}

// ─── Query-string filters ────────────────────────────────────────────────────

export interface HierarchyFilter {
  departmentId?: string;
  programId?: string;
  baselineId?: string;
  componentId?: string;
  subcomponentId?: string;
  /** true → only tasks with no program (legacy, pre-hierarchy rows). Global users only. */
  unassigned?: boolean;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function pick(q: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const k of keys) {
    const v = q[k];
    if (typeof v === 'string' && v.trim() !== '') return v.trim();
  }
  return undefined;
}

function uuidOrThrow(value: string | undefined, label: string): string | undefined {
  if (value === undefined) return undefined;
  if (!UUID_RE.test(value)) throw new HierarchyError(`Invalid ${label} id`, 400);
  return value;
}

/** Reads hierarchy filters from a query string. Accepts camelCase, snake_case and legacy project* names. */
export function readHierarchyFilter(q: Record<string, unknown>): HierarchyFilter {
  return {
    departmentId:   uuidOrThrow(pick(q, 'departmentId', 'department_id'), 'department'),
    programId:      uuidOrThrow(pick(q, 'programId', 'program_id', 'projectId', 'project_id'), 'program'),
    baselineId:     uuidOrThrow(pick(q, 'baselineId', 'baseline_id'), 'baseline'),
    componentId:    uuidOrThrow(pick(q, 'componentId', 'component_id'), 'component'),
    subcomponentId: uuidOrThrow(pick(q, 'subcomponentId', 'subcomponent_id'), 'subcomponent'),
    unassigned:     ['1', 'true'].includes(String(q.unassigned ?? '').toLowerCase()),
  };
}

/**
 * Appends access scoping + hierarchy filters to a WHERE clause for a task table
 * (estimations / parametric_estimations). `alias` is the table alias prefix ('' or 'e.').
 *
 * Authorisation is enforced here, not just in the UI:
 *  • non-global users only ever see rows of programs they can access (legacy rows with no program
 *    are visible to global users only);
 *  • asking for a department/program the user cannot access yields an empty result.
 */
export function applyHierarchyScope(
  req: Request,
  where: string,
  params: unknown[],
  i: number,
  alias = ''
): [string, unknown[], number] {
  const user = req.user;
  const f = readHierarchyFilter(req.query as Record<string, unknown>);
  const col = (c: string) => `${alias}${c}`;

  if (user && !isGlobalUser(user)) {
    const ids = user.projectIds as string[];
    if (ids.length === 0) return [`${where} AND 1=0`, params, i];
    where += ` AND ${col('project_id')} = ANY($${i++}::uuid[])`;
    params.push(ids);
    if (f.unassigned) return [`${where} AND 1=0`, params, i];
    if (f.departmentId && !canAccessDepartment(user, f.departmentId)) return [`${where} AND 1=0`, params, i];
    if (f.programId && !canAccessProgram(user, f.programId)) return [`${where} AND 1=0`, params, i];
  }

  if (f.unassigned) where += ` AND ${col('project_id')} IS NULL`;
  if (f.departmentId)   { where += ` AND ${col('department_id')} = $${i++}`;   params.push(f.departmentId); }
  if (f.programId)      { where += ` AND ${col('project_id')} = $${i++}`;      params.push(f.programId); }
  if (f.baselineId)     { where += ` AND ${col('baseline_id')} = $${i++}`;     params.push(f.baselineId); }
  if (f.componentId)    { where += ` AND ${col('component_id')} = $${i++}`;    params.push(f.componentId); }
  if (f.subcomponentId) { where += ` AND ${col('subcomponent_id')} = $${i++}`; params.push(f.subcomponentId); }

  return [where, params, i];
}

// ─── Task hierarchy validation ───────────────────────────────────────────────

export interface TaskHierarchyInput {
  department_id: string;
  program_id: string;
  baseline_id: string;
  component_id?: string | null;
  subcomponent_id?: string | null;
}

export interface ResolvedHierarchy {
  department_id: string;
  department_name: string;
  program_id: string;
  program_name: string;
  baseline_id: string;
  baseline_name: string;
  component_id: string | null;
  component_name: string | null;
  subcomponent_id: string | null;
  subcomponent_name: string | null;
}

interface StatusRow { id: string; name: string; status: string }

/**
 * Validates a Department → Program → Baseline → Component → Subcomponent selection for a task:
 * existence, active status, parent/child consistency and the caller's access.
 * Throws HierarchyError (400 invalid / 403 forbidden). DB composite FKs are the last line of defence.
 */
export async function validateTaskHierarchy(
  input: TaskHierarchyInput,
  user: JwtPayload | undefined
): Promise<ResolvedHierarchy> {
  if (!input.department_id) throw new HierarchyError('Department is required');
  if (!input.program_id)    throw new HierarchyError('Program is required');
  if (!input.baseline_id)   throw new HierarchyError('Baseline is required');
  if (input.subcomponent_id && !input.component_id) {
    throw new HierarchyError('A Subcomponent requires its parent Component to be selected');
  }

  const dept = await queryOne<StatusRow>(
    `SELECT id, name, status FROM departments WHERE id = $1`, [input.department_id]
  );
  if (!dept) throw new HierarchyError('Department not found');
  if (!canAccessDepartment(user, dept.id)) throw new HierarchyError('You do not have access to this Department', 403);
  if (dept.status !== 'active') throw new HierarchyError(`Department "${dept.name}" is inactive`);

  const program = await queryOne<StatusRow & { department_id: string }>(
    `SELECT id, name, status, department_id FROM projects WHERE id = $1 AND deleted_at IS NULL`,
    [input.program_id]
  );
  if (!program) throw new HierarchyError('Program not found');
  if (program.department_id !== dept.id) {
    throw new HierarchyError(`Program "${program.name}" does not belong to Department "${dept.name}"`);
  }
  if (!canAccessProgram(user, program.id)) throw new HierarchyError('You do not have access to this Program', 403);
  if (program.status !== 'active') throw new HierarchyError(`Program "${program.name}" is not active`);

  const baseline = await queryOne<StatusRow & { project_id: string }>(
    `SELECT id, name, status, project_id FROM baselines WHERE id = $1`, [input.baseline_id]
  );
  if (!baseline) throw new HierarchyError('Baseline not found');
  if (baseline.project_id !== program.id) {
    throw new HierarchyError(`Baseline "${baseline.name}" does not belong to Program "${program.name}"`);
  }
  if (baseline.status !== 'active') throw new HierarchyError(`Baseline "${baseline.name}" is inactive`);

  let component: { id: string; name: string; baseline_id: string } | null = null;
  if (input.component_id) {
    component = await queryOne(`SELECT id, name, baseline_id FROM components WHERE id = $1`, [input.component_id]);
    if (!component) throw new HierarchyError('Component not found');
    if (component.baseline_id !== baseline.id) {
      throw new HierarchyError(`Component "${component.name}" does not belong to Baseline "${baseline.name}"`);
    }
  }

  let sub: { id: string; name: string; component_id: string } | null = null;
  if (input.subcomponent_id) {
    sub = await queryOne(`SELECT id, name, component_id FROM subcomponents WHERE id = $1`, [input.subcomponent_id]);
    if (!sub) throw new HierarchyError('Subcomponent not found');
    if (sub.component_id !== component!.id) {
      throw new HierarchyError(`Subcomponent "${sub.name}" does not belong to Component "${component!.name}"`);
    }
  }

  return {
    department_id: dept.id, department_name: dept.name,
    program_id: program.id, program_name: program.name,
    baseline_id: baseline.id, baseline_name: baseline.name,
    component_id: component?.id ?? null, component_name: component?.name ?? null,
    subcomponent_id: sub?.id ?? null, subcomponent_name: sub?.name ?? null,
  };
}

/**
 * Zod fields shared by SP and PE task schemas. `project_id` is accepted as a legacy alias of
 * `program_id`. Required-ness is checked by validateTaskHierarchy so the error messages are uniform.
 */
export const taskHierarchyFields = {
  department_id:   z.string().uuid().optional(),
  program_id:      z.string().uuid().optional(),
  project_id:      z.string().uuid().optional(),
  baseline_id:     z.string().uuid().optional(),
  component_id:    z.string().uuid().nullable().optional(),
  subcomponent_id: z.string().uuid().nullable().optional(),
};

export type TaskHierarchyBody = {
  department_id?: string; program_id?: string; project_id?: string; baseline_id?: string;
  component_id?: string | null; subcomponent_id?: string | null;
};

const HIERARCHY_KEYS = ['department_id', 'program_id', 'project_id', 'baseline_id', 'component_id', 'subcomponent_id'] as const;

export function hasHierarchyFields(body: Record<string, unknown>): boolean {
  return HIERARCHY_KEYS.some(k => body[k] !== undefined);
}

/** Normalises a body to TaskHierarchyInput (program_id ← project_id alias). */
export function toHierarchyInput(body: TaskHierarchyBody): TaskHierarchyInput {
  return {
    department_id: body.department_id ?? '',
    program_id: body.program_id ?? body.project_id ?? '',
    baseline_id: body.baseline_id ?? '',
    component_id: body.component_id ?? null,
    subcomponent_id: body.subcomponent_id ?? null,
  };
}

/**
 * Memoises validateTaskHierarchy for bulk imports, where many rows share the same hierarchy.
 * Failures are cached too, so every row with the same bad combination reports the same error.
 */
export function createHierarchyValidator(user: JwtPayload | undefined) {
  const cache = new Map<string, Promise<ResolvedHierarchy>>();
  return (input: TaskHierarchyInput): Promise<ResolvedHierarchy> => {
    const key = [input.department_id, input.program_id, input.baseline_id, input.component_id, input.subcomponent_id].join('|');
    let p = cache.get(key);
    if (!p) {
      p = validateTaskHierarchy(input, user);
      p.catch(() => undefined); // avoid unhandled rejection; callers await it
      cache.set(key, p);
    }
    return p;
  };
}

/** Ensures a caller may read/modify an existing task row (by its stored program). */
export function assertTaskAccess(user: JwtPayload | undefined, row: { project_id: string | null }): void {
  if (isGlobalUser(user)) return;
  if (!row.project_id || !canAccessProgram(user, row.project_id)) {
    throw new HierarchyError('You do not have access to this task', 403);
  }
}
