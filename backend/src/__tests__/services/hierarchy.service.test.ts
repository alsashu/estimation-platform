import { Request } from 'express';
import type { JwtPayload } from '../../auth/jwt';

jest.mock('../../config/database', () => ({ query: jest.fn(), queryOne: jest.fn() }));
import { query, queryOne } from '../../config/database';
import {
  applyHierarchyScope, assertTaskAccess, canAccessDepartment, canAccessProgram, computeAccess,
  createHierarchyValidator, hasHierarchyFields, HierarchyError, isGlobalUser, readHierarchyFilter,
  toHierarchyInput, validateTaskHierarchy,
} from '../../services/hierarchy.service';

const mockQuery = query as jest.Mock;
const mockQueryOne = queryOne as jest.Mock;

const D1 = '11111111-1111-1111-1111-111111111111';
const D2 = '22222222-2222-2222-2222-222222222222';
const P1 = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const P2 = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const B1 = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const C1 = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const S1 = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

const gsa: JwtPayload = { userId: 'g', email: 'g@x', username: 'g', roles: ['Global Super Admin'], permissions: [], projectIds: '*', departmentIds: '*' };
/** User with one department and one program */
const single: JwtPayload = { userId: 'u1', email: 'u@x', username: 'u', roles: ['User'], permissions: [], projectIds: [P1], departmentIds: [D1] };
/** User with multiple departments and multiple programs */
const multi: JwtPayload = { ...single, userId: 'u2', projectIds: [P1, P2], departmentIds: [D1, D2] };
const legacyToken: JwtPayload = { ...single, departmentIds: undefined };

const reqWith = (user: JwtPayload | undefined, q: Record<string, unknown> = {}) => ({ user, query: q } as unknown as Request);

beforeEach(() => { mockQuery.mockReset(); mockQueryOne.mockReset(); });

// ─── access helpers ──────────────────────────────────────────────────────────
describe('access helpers', () => {
  it('treats only "*" program access as global', () => {
    expect(isGlobalUser(gsa)).toBe(true);
    expect(isGlobalUser(single)).toBe(false);
    expect(isGlobalUser(undefined)).toBe(false);
  });

  it('canAccessProgram respects assigned programs', () => {
    expect(canAccessProgram(gsa, P2)).toBe(true);
    expect(canAccessProgram(single, P1)).toBe(true);
    expect(canAccessProgram(single, P2)).toBe(false);
    expect(canAccessProgram(multi, P2)).toBe(true);
    expect(canAccessProgram(undefined, P1)).toBe(false);
  });

  it('canAccessDepartment respects assigned departments (multiple departments supported)', () => {
    expect(canAccessDepartment(gsa, D2)).toBe(true);
    expect(canAccessDepartment(single, D1)).toBe(true);
    expect(canAccessDepartment(single, D2)).toBe(false);
    expect(canAccessDepartment(multi, D2)).toBe(true);
  });

  it('denies department access for pre-department tokens (no departmentIds claim)', () => {
    expect(canAccessDepartment(legacyToken, D1)).toBe(false);
  });
});

describe('computeAccess', () => {
  it('returns "*" for global users without querying', async () => {
    await expect(computeAccess('g', true)).resolves.toEqual({ departmentIds: '*', projectIds: '*' });
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('returns department memberships and programs that respect the parent department', async () => {
    mockQuery
      .mockResolvedValueOnce([{ department_id: D1 }, { department_id: D2 }])
      .mockResolvedValueOnce([{ id: P1 }]);
    await expect(computeAccess('u', false)).resolves.toEqual({ departmentIds: [D1, D2], projectIds: [P1] });
    const programSql = mockQuery.mock.calls[1][0] as string;
    expect(programSql).toContain('ud.department_id = p.department_id');  // program ↔ department relationship
    expect(programSql).toContain("access_scope = 'all'");               // department-level access
  });
});

// ─── query filters ───────────────────────────────────────────────────────────
describe('readHierarchyFilter', () => {
  it('accepts camelCase, snake_case and legacy project names', () => {
    expect(readHierarchyFilter({ projectId: P1 }).programId).toBe(P1);
    expect(readHierarchyFilter({ project_id: P1 }).programId).toBe(P1);
    expect(readHierarchyFilter({ programId: P1, department_id: D1, baselineId: B1 })).toMatchObject({
      programId: P1, departmentId: D1, baselineId: B1,
    });
  });

  it('rejects malformed ids with a 400 HierarchyError', () => {
    expect(() => readHierarchyFilter({ departmentId: 'not-a-uuid' })).toThrow(HierarchyError);
  });

  it('ignores empty strings and parses unassigned flag', () => {
    expect(readHierarchyFilter({ departmentId: '', unassigned: 'true' })).toMatchObject({ departmentId: undefined, unassigned: true });
  });
});

describe('applyHierarchyScope', () => {
  it('adds no access clause for global users', () => {
    const [where, params] = applyHierarchyScope(reqWith(gsa), 'WHERE 1=1', [], 1);
    expect(where).toBe('WHERE 1=1');
    expect(params).toEqual([]);
  });

  it('scopes non-global users to their accessible programs (excludes unassigned legacy rows)', () => {
    const [where, params] = applyHierarchyScope(reqWith(single), 'WHERE 1=1', [], 1, 'e.');
    expect(where).toContain('e.project_id = ANY($1::uuid[])');
    expect(params).toEqual([[P1]]);
  });

  it('returns nothing for users with no program access', () => {
    const [where] = applyHierarchyScope(reqWith({ ...single, projectIds: [] }), 'WHERE 1=1', [], 1);
    expect(where).toContain('1=0');
  });

  it('blocks unauthorised department filter', () => {
    const [where] = applyHierarchyScope(reqWith(single, { departmentId: D2 }), 'WHERE 1=1', [], 1);
    expect(where).toContain('1=0');
  });

  it('blocks unauthorised program filter', () => {
    const [where] = applyHierarchyScope(reqWith(single, { programId: P2 }), 'WHERE 1=1', [], 1);
    expect(where).toContain('1=0');
  });

  it('blocks the unassigned (legacy) view for non-global users', () => {
    const [where] = applyHierarchyScope(reqWith(single, { unassigned: '1' }), 'WHERE 1=1', [], 1);
    expect(where).toContain('1=0');
  });

  it('applies department, program, baseline, component and subcomponent filters with correct placeholders', () => {
    const [where, params, next] = applyHierarchyScope(
      reqWith(multi, { departmentId: D1, programId: P1, baselineId: B1, componentId: C1, subcomponentId: S1 }),
      'WHERE x = $1', ['x'], 2
    );
    expect(where).toContain('project_id = ANY($2::uuid[])');
    expect(where).toContain('department_id = $3');
    expect(where).toContain('project_id = $4');
    expect(where).toContain('baseline_id = $5');
    expect(where).toContain('component_id = $6');
    expect(where).toContain('subcomponent_id = $7');
    expect(params).toEqual(['x', [P1, P2], D1, P1, B1, C1, S1]);
    expect(next).toBe(8);
  });

  it('lets global users view unassigned legacy rows', () => {
    const [where] = applyHierarchyScope(reqWith(gsa, { unassigned: 'true' }), 'WHERE 1=1', [], 1);
    expect(where).toContain('project_id IS NULL');
  });
});

// ─── task validation ─────────────────────────────────────────────────────────
const dept = { id: D1, name: 'Engineering', status: 'active' };
const prog = { id: P1, name: 'Alpha', status: 'active', department_id: D1 };
const base = { id: B1, name: 'R1', status: 'active', project_id: P1 };
const comp = { id: C1, name: 'API', baseline_id: B1 };
const sub  = { id: S1, name: 'Auth', component_id: C1 };

function mockChain(...rows: unknown[]) {
  rows.forEach(r => mockQueryOne.mockResolvedValueOnce(r));
}

const input = (over: Record<string, unknown> = {}) => ({ department_id: D1, program_id: P1, baseline_id: B1, ...over });

describe('validateTaskHierarchy', () => {
  it('requires department, program and baseline', async () => {
    await expect(validateTaskHierarchy(input({ department_id: '' }), gsa)).rejects.toThrow('Department is required');
    await expect(validateTaskHierarchy(input({ program_id: '' }), gsa)).rejects.toThrow('Program is required');
    await expect(validateTaskHierarchy(input({ baseline_id: '' }), gsa)).rejects.toThrow('Baseline is required');
  });

  it('accepts a task without component / subcomponent', async () => {
    mockChain(dept, prog, base);
    const h = await validateTaskHierarchy(input(), single);
    expect(h).toMatchObject({ department_id: D1, program_id: P1, baseline_id: B1, component_id: null, subcomponent_id: null, program_name: 'Alpha' });
  });

  it('accepts an optional component', async () => {
    mockChain(dept, prog, base, comp);
    const h = await validateTaskHierarchy(input({ component_id: C1 }), single);
    expect(h.component_name).toBe('API');
  });

  it('accepts an optional subcomponent under its component', async () => {
    mockChain(dept, prog, base, comp, sub);
    const h = await validateTaskHierarchy(input({ component_id: C1, subcomponent_id: S1 }), single);
    expect(h.subcomponent_name).toBe('Auth');
  });

  it('rejects a subcomponent without a component', async () => {
    await expect(validateTaskHierarchy(input({ subcomponent_id: S1 }), gsa)).rejects.toThrow(/requires its parent Component/);
  });

  it('rejects unknown department', async () => {
    mockChain(null);
    await expect(validateTaskHierarchy(input(), gsa)).rejects.toThrow('Department not found');
  });

  it('rejects unauthorised department with 403', async () => {
    mockChain({ ...dept, id: D2 });
    await expect(validateTaskHierarchy(input({ department_id: D2 }), single)).rejects.toMatchObject({ statusCode: 403 });
  });

  it('rejects inactive department', async () => {
    mockChain({ ...dept, status: 'inactive' });
    await expect(validateTaskHierarchy(input(), gsa)).rejects.toThrow(/inactive/);
  });

  it('rejects a program from another department (cross-department)', async () => {
    mockChain(dept, { ...prog, department_id: D2 });
    await expect(validateTaskHierarchy(input(), gsa)).rejects.toThrow(/does not belong to Department/);
  });

  it('rejects unauthorised program with 403', async () => {
    mockChain(dept, { ...prog, id: P2 });
    await expect(validateTaskHierarchy(input({ program_id: P2 }), single)).rejects.toMatchObject({ statusCode: 403 });
  });

  it('rejects inactive program', async () => {
    mockChain(dept, { ...prog, status: 'inactive' });
    await expect(validateTaskHierarchy(input(), gsa)).rejects.toThrow(/not active/);
  });

  it('rejects a baseline from another program (cross-program)', async () => {
    mockChain(dept, prog, { ...base, project_id: P2 });
    await expect(validateTaskHierarchy(input(), gsa)).rejects.toThrow(/does not belong to Program/);
  });

  it('rejects inactive baseline', async () => {
    mockChain(dept, prog, { ...base, status: 'inactive' });
    await expect(validateTaskHierarchy(input(), gsa)).rejects.toThrow(/inactive/);
  });

  it('rejects a component from another baseline', async () => {
    mockChain(dept, prog, base, { ...comp, baseline_id: 'other' });
    await expect(validateTaskHierarchy(input({ component_id: C1 }), gsa)).rejects.toThrow(/does not belong to Baseline/);
  });

  it('rejects a subcomponent from another component', async () => {
    mockChain(dept, prog, base, comp, { ...sub, component_id: 'other' });
    await expect(validateTaskHierarchy(input({ component_id: C1, subcomponent_id: S1 }), gsa)).rejects.toThrow(/does not belong to Component/);
  });

  it('rejects unknown baseline / component / subcomponent', async () => {
    mockChain(dept, prog, null);
    await expect(validateTaskHierarchy(input(), gsa)).rejects.toThrow('Baseline not found');
    mockChain(dept, prog, base, null);
    await expect(validateTaskHierarchy(input({ component_id: C1 }), gsa)).rejects.toThrow('Component not found');
    mockChain(dept, prog, base, comp, null);
    await expect(validateTaskHierarchy(input({ component_id: C1, subcomponent_id: S1 }), gsa)).rejects.toThrow('Subcomponent not found');
  });
});

describe('createHierarchyValidator (bulk import memoisation)', () => {
  it('validates each distinct hierarchy only once', async () => {
    mockChain(dept, prog, base);
    const validate = createHierarchyValidator(gsa);
    await validate(input());
    await validate(input());
    expect(mockQueryOne).toHaveBeenCalledTimes(3);
  });
});

describe('body helpers', () => {
  it('maps legacy project_id to program_id', () => {
    expect(toHierarchyInput({ department_id: D1, project_id: P1, baseline_id: B1 }).program_id).toBe(P1);
  });
  it('detects hierarchy fields', () => {
    expect(hasHierarchyFields({ title: 'x' })).toBe(false);
    expect(hasHierarchyFields({ baseline_id: B1 })).toBe(true);
  });
  it('assertTaskAccess blocks other programs and unassigned rows for scoped users', () => {
    expect(() => assertTaskAccess(single, { project_id: P1 })).not.toThrow();
    expect(() => assertTaskAccess(single, { project_id: P2 })).toThrow(HierarchyError);
    expect(() => assertTaskAccess(single, { project_id: null })).toThrow(HierarchyError);
    expect(() => assertTaskAccess(gsa, { project_id: null })).not.toThrow();
  });
});
