import { describe, it, expect, beforeEach } from 'vitest';
import { changedModules } from '../../services/api';
import { useAuthStore } from '../../store/authStore';

const login = (modules: ('SP' | 'PE')[]) => useAuthStore.getState().setAuth(
  { id: 'u', email: '', username: '', firstName: '', lastName: '', roles: ['Admin'], permissions: [], projectIds: [], modules }, 'a', 'r');

describe('X-Access-Changed handling', () => {
  beforeEach(() => useAuthStore.getState().clearAuth());

  it('ignores responses without the header', () => {
    login(['SP']);
    expect(changedModules({})).toBeNull();
    expect(changedModules(undefined)).toBeNull();
  });

  it('reports the live modules when they differ from the store', () => {
    login(['SP']);
    expect(changedModules({ 'x-access-changed': 'PE' })).toEqual(['PE']);
    expect(changedModules({ 'x-access-changed': 'SP,PE' })).toEqual(['SP', 'PE']);
    expect(changedModules({ 'x-access-changed': 'none' })).toEqual([]);
  });

  it('does nothing once the store already reflects the change (no /auth/me storm)', () => {
    login(['PE']);
    expect(changedModules({ 'x-access-changed': 'PE' })).toBeNull();
  });
});
