import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface AuthUser {
  id: string;
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  roles: string[];
  permissions: string[];
  projectIds: string[] | '*';
}

interface AuthStore {
  user: AuthUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  setAuth: (user: AuthUser, accessToken: string, refreshToken: string) => void;
  clearAuth: () => void;
  updateTokens: (accessToken: string, refreshToken: string) => void;
  hasPermission: (permission: string) => boolean;
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
