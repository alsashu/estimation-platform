import { describe, it, expect, beforeEach } from 'vitest';
import { useAuthStore } from '../../store/authStore';

const sampleUser = {
  id: 'u1',
  email: 'test@test.com',
  username: 'testuser',
  firstName: 'Test',
  lastName: 'User',
  roles: ['User'],
  permissions: ['estimation.read', 'estimation.create', 'project.read'],
  projectIds: ['proj-1', 'proj-2'] as string[],
};

describe('authStore', () => {
  beforeEach(() => {
    useAuthStore.getState().clearAuth();
  });

  it('starts with no user and no tokens', () => {
    const { user, accessToken, refreshToken } = useAuthStore.getState();
    expect(user).toBeNull();
    expect(accessToken).toBeNull();
    expect(refreshToken).toBeNull();
  });

  it('setAuth stores user and tokens', () => {
    useAuthStore.getState().setAuth(sampleUser, 'at123', 'rt456');
    const { user, accessToken, refreshToken } = useAuthStore.getState();
    expect(user).toEqual(sampleUser);
    expect(accessToken).toBe('at123');
    expect(refreshToken).toBe('rt456');
  });

  it('clearAuth removes all auth state', () => {
    useAuthStore.getState().setAuth(sampleUser, 'at', 'rt');
    useAuthStore.getState().clearAuth();
    const { user, accessToken, refreshToken } = useAuthStore.getState();
    expect(user).toBeNull();
    expect(accessToken).toBeNull();
    expect(refreshToken).toBeNull();
  });

  it('updateTokens replaces only the tokens', () => {
    useAuthStore.getState().setAuth(sampleUser, 'at-old', 'rt-old');
    useAuthStore.getState().updateTokens('at-new', 'rt-new');
    const { accessToken, refreshToken, user } = useAuthStore.getState();
    expect(accessToken).toBe('at-new');
    expect(refreshToken).toBe('rt-new');
    expect(user).toEqual(sampleUser);
  });

  describe('hasPermission', () => {
    beforeEach(() => useAuthStore.getState().setAuth(sampleUser, 'at', 'rt'));

    it('returns true for a permission the user has', () => {
      expect(useAuthStore.getState().hasPermission('estimation.read')).toBe(true);
    });

    it('returns false for a permission the user lacks', () => {
      expect(useAuthStore.getState().hasPermission('user.create')).toBe(false);
    });

    it('returns false when no user is set', () => {
      useAuthStore.getState().clearAuth();
      expect(useAuthStore.getState().hasPermission('estimation.read')).toBe(false);
    });
  });

  describe('hasRole', () => {
    beforeEach(() => useAuthStore.getState().setAuth(sampleUser, 'at', 'rt'));

    it('returns true for a role the user has', () => {
      expect(useAuthStore.getState().hasRole('User')).toBe(true);
    });

    it('returns false for a role the user lacks', () => {
      expect(useAuthStore.getState().hasRole('Admin')).toBe(false);
    });
  });

  describe('hasProjectAccess', () => {
    beforeEach(() => useAuthStore.getState().setAuth(sampleUser, 'at', 'rt'));

    it('returns true for an assigned project', () => {
      expect(useAuthStore.getState().hasProjectAccess('proj-1')).toBe(true);
    });

    it('returns false for an unassigned project', () => {
      expect(useAuthStore.getState().hasProjectAccess('proj-99')).toBe(false);
    });

    it('returns true for any project when projectIds is wildcard', () => {
      const gsaUser = { ...sampleUser, projectIds: '*' as const };
      useAuthStore.getState().setAuth(gsaUser, 'at', 'rt');
      expect(useAuthStore.getState().hasProjectAccess('any-project-id')).toBe(true);
    });
  });

  describe('isGlobalSuperAdmin', () => {
    it('returns true when user has Global Super Admin role', () => {
      const gsa = { ...sampleUser, roles: ['Global Super Admin'] };
      useAuthStore.getState().setAuth(gsa, 'at', 'rt');
      expect(useAuthStore.getState().isGlobalSuperAdmin()).toBe(true);
    });

    it('returns false for regular users', () => {
      useAuthStore.getState().setAuth(sampleUser, 'at', 'rt');
      expect(useAuthStore.getState().isGlobalSuperAdmin()).toBe(false);
    });

    it('returns false when no user is logged in', () => {
      useAuthStore.getState().clearAuth();
      expect(useAuthStore.getState().isGlobalSuperAdmin()).toBe(false);
    });
  });
});
