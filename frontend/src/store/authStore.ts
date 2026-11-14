import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { MODULE_CODES, normalizeModules, type ModuleCode } from '../utils/moduleAccess';

export interface AuthUser {
  id: string;
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  roles: string[];
  permissions: string[];
  /** Accessible Program ids (legacy name projects). '*' = global. */
  projectIds: string[] | '*';
  /** Accessible Department ids. '*' = global. */
  departmentIds?: string[] | '*';
  /** Estimation modules (SP / PE), independent of roles. Permissions are already limited to these. */
  modules?: ModuleCode[];
}

interface AuthStore {
  user: AuthUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  setAuth: (user: AuthUser, accessToken: string, refreshToken: string) => void;
  clearAuth: () => void;
  updateTokens: (accessToken: string, refreshToken: string) => void;
  /** Replace the user's live access (permissions / modules) after the server reported a change. */
  setUser: (patch: Partial<AuthUser>) => void;
  hasPermission: (permission: string) => boolean;
  hasModule: (module: ModuleCode) => boolean;
  getModules: () => ModuleCode[];
  hasRole: (role: string) => boolean;
  hasProjectAccess: (projectId: string) => boolean;
  isGlobalSuperAdmin: () => boolean;
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      refreshToken: null,

      setAuth: (user, accessToken, refreshToken) =>
        set({ user, accessToken, refreshToken }),

      clearAuth: () =>
        set({ user: null, accessToken: null, refreshToken: null }),

      updateTokens: (accessToken, refreshToken) =>
        set({ accessToken, refreshToken }),

      setUser: (patch) => set(s => (s.user ? { user: { ...s.user, ...patch } } : {})),

      getModules: () => {
        const { user } = get();
        if (!user) return [];
        if (user.roles?.includes('Global Super Admin')) return [...MODULE_CODES];
        // Sessions persisted before module access existed: derive from the (already filtered) permissions
        if (!user.modules) {
          const p = user.permissions ?? [];
          return MODULE_CODES.filter(m => p.some(x => m === 'SP' ? x.startsWith('estimation.') : x.startsWith('parametric.')));
        }
        return normalizeModules(user.modules);
      },

      hasModule: (module) => get().getModules().includes(module),

      hasPermission: (permission: string) => {
        const { user } = get();
        return user?.permissions?.includes(permission) ?? false;
      },

      hasRole: (role: string) => {
        const { user } = get();
        return user?.roles?.includes(role) ?? false;
      },

      hasProjectAccess: (projectId: string) => {
        const { user } = get();
        if (!user) return false;
        if (user.projectIds === '*') return true;
        return (user.projectIds as string[]).includes(projectId);
      },

      isGlobalSuperAdmin: () => {
        const { user } = get();
        return user?.roles?.includes('Global Super Admin') ?? false;
      },
    }),
    { name: 'ep-auth' }
  )
);
