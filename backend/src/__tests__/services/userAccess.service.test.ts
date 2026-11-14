import type { JwtPayload } from '../../auth/jwt';

jest.mock('../../config/database', () => ({ query: jest.fn(), queryOne: jest.fn() }));
import { query } from '../../config/database';
import { checkGrantScope, syncUserAccess } from '../../services/userAccess.service';

const mockQuery = query as jest.Mock;
const D1 = '11111111-1111-1111-1111-111111111111';
const D2 = '22222222-2222-2222-2222-222222222222';

const gsa: JwtPayload = { userId: 'g', email: 'g@x', username: 'g', roles: ['Global Super Admin'], permissions: [], projectIds: '*', departmentIds: '*' };
const admin: JwtPayload = { userId: 'a', email: 'a@x', username: 'a', roles: ['Admin'], permissions: [], projectIds: ['p1'], departmentIds: [D1] };

beforeEach(() => mockQuery.mockReset().mockResolvedValue([]));

describe('checkGrantScope', () => {
  it('allows global admins to grant anything', () => {
    expect(checkGrantScope(gsa, [{ id: D2, access_scope: 'all' }], ['p9'])).toBeNull();
  });
  it('blocks granting departments outside the admin\'s access', () => {
    expect(checkGrantScope(admin, [{ id: D2, access_scope: 'assigned' }], undefined)).toMatch(/departments/);
  });
  it('blocks granting programs outside the admin\'s access', () => {
    expect(checkGrantScope(admin, undefined, ['p2'])).toMatch(/programs/);
  });
  it('allows grants within scope', () => {
    expect(checkGrantScope(admin, [{ id: D1, access_scope: 'assigned' }], ['p1'])).toBeNull();
  });
});

describe('syncUserAccess', () => {
  const sqls = () => mockQuery.mock.calls.map(c => c[0] as string);

  it('replaces departments then prunes program assignments outside them', async () => {
    await syncUserAccess('u', [{ id: D1, access_scope: 'all' }], undefined, 'g');
    expect(sqls()[0]).toContain('DELETE FROM user_departments');
    expect(mockQuery.mock.calls[1][1]).toEqual(['u', D1, 'all', 'g']);
    expect(sqls()[2]).toContain('DELETE FROM project_users pu USING projects p');
  });

  it('with only programs, adds the parent departments automatically', async () => {
    await syncUserAccess('u', undefined, ['p1', 'p2'], 'g');
    expect(sqls()[0]).toContain('DELETE FROM project_users');
    expect(sqls().filter(s => s.includes('INSERT INTO project_users'))).toHaveLength(2);
    expect(sqls()[sqls().length - 1]).toContain('INSERT INTO user_departments');
  });

  it('supports a user with multiple departments and multiple programs', async () => {
    await syncUserAccess('u', [{ id: D1, access_scope: 'assigned' }, { id: D2, access_scope: 'assigned' }], ['p1', 'p2'], 'g');
    expect(sqls().filter(s => s.includes('INSERT INTO user_departments'))).toHaveLength(2);
    expect(sqls().filter(s => s.includes('INSERT INTO project_users'))).toHaveLength(2);
  });
});
