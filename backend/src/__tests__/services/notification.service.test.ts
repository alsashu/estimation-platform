import { createNotification, createApprovalNotification, broadcastToAdmins } from '../../services/notification.service';

jest.mock('../../config/database', () => ({ query: jest.fn() }));

import { query } from '../../config/database';
const mockQuery = query as jest.Mock;

describe('notification service', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('createNotification', () => {
    it('inserts a notification', async () => {
      mockQuery.mockResolvedValueOnce([]);
      await createNotification({
        userId: 'u1', type: 'info', title: 'Hello', message: 'World',
      });
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO notifications'),
        expect.any(Array)
      );
    });

    it('silently ignores DB errors', async () => {
      mockQuery.mockRejectedValueOnce(new Error('DB'));
      await expect(createNotification({ type: 'error', title: 'X', message: 'Y' })).resolves.toBeUndefined();
    });
  });

  describe('createApprovalNotification', () => {
    it('creates a warning priority notification for approval', async () => {
      mockQuery.mockResolvedValueOnce([]);
      await createApprovalNotification({ forUserId: 'admin-1', title: 'New Request', message: 'User wants to join' });
      const params = mockQuery.mock.calls[0][1] as unknown[];
      expect(params).toContain('warning');
      expect(params).toContain('approval');
      expect(params).toContain('high');
    });
  });

  describe('broadcastToAdmins', () => {
    it('sends notification to each admin', async () => {
      mockQuery.mockResolvedValue([]);
      await broadcastToAdmins(['a1', 'a2', 'a3'], { title: 'Alert', message: 'Something happened' });
      expect(mockQuery).toHaveBeenCalledTimes(3);
    });

    it('does nothing with empty admin list', async () => {
      await broadcastToAdmins([], { title: 'X', message: 'Y' });
      expect(mockQuery).not.toHaveBeenCalled();
    });
  });
});
