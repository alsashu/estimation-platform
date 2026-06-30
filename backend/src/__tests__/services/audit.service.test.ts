import { auditLog } from '../../services/audit.service';
import type { JwtPayload } from '../../auth/jwt';

jest.mock('../../config/database', () => ({ query: jest.fn() }));

import { query } from '../../config/database';
const mockQuery = query as jest.Mock;

const user: JwtPayload = {
  userId: 'u1', email: 'a@b.com', username: 'u',
  roles: ['Admin'], permissions: [], projectIds: '*',
};

describe('auditLog service', () => {
  beforeEach(() => jest.clearAllMocks());

  it('inserts an audit log entry', async () => {
    mockQuery.mockResolvedValueOnce([]);
    await auditLog({ entity: 'user', entityId: 'u1', action: 'created', user });
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO audit_logs'),
      expect.any(Array)
    );
  });

  it('silently ignores DB errors', async () => {
    mockQuery.mockRejectedValueOnce(new Error('DB down'));
    await expect(auditLog({ entity: 'user', entityId: 'u1', action: 'deleted', user })).resolves.toBeUndefined();
  });

  it('passes entity, entityId, action, and userId in params', async () => {
    mockQuery.mockResolvedValueOnce([]);
    await auditLog({ entity: 'project', entityId: 'proj-1', action: 'updated', user });
    const params = (mockQuery.mock.calls[0][1] as unknown[]);
    expect(params).toContain('project');
    expect(params).toContain('proj-1');
    expect(params).toContain('updated');
    expect(params).toContain('u1');
  });

  it('handles missing user gracefully', async () => {
    mockQuery.mockResolvedValueOnce([]);
    await auditLog({ entity: 'system', entityId: 'sys', action: 'startup' });
    expect(mockQuery).toHaveBeenCalled();
  });
});
