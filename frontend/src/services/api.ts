import axios, { AxiosError } from 'axios';
import type {
  Estimation, StoryPointConfig, EffortEstimateConfig,
  CompetencyOverheadConfig, CompetencyLevelDefinition,
  ComplexityDefinition, RiskDefinition, Notification,
  CalculationResult, PaginatedResponse, AnalysisSummary,
  ComplexityBreakdown, SPBandSummary, ScatterPoint, TrendPoint,
} from '../types';
import { useConnectionStore, useSyncQueueStore } from '../store';
import { useAuthStore } from '../store/authStore';
import type { SyncQueueItem } from '../store';

const api = axios.create({
  baseURL: '/api',
  timeout: 15000,
});

// ─── Request interceptor: attach JWT + offline queuing ────────────────────────
const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

api.interceptors.request.use((config) => {
  // Attach JWT token
  const token = useAuthStore.getState().accessToken;
  if (token && config.headers) {
    config.headers['Authorization'] = `Bearer ${token}`;
  }

  // Offline queuing for mutations
  const { isOnline } = useConnectionStore.getState();
  const method = (config.method ?? '').toUpperCase();
  if (!isOnline && MUTATION_METHODS.has(method)) {
    const rawData = config.data;
    const data: unknown = rawData
      ? (typeof rawData === 'string' ? JSON.parse(rawData) : rawData)
      : undefined;

    useSyncQueueStore.getState().enqueue({
      method: method as SyncQueueItem['method'],
      url: config.url ?? '',
      data,
    });

    config.adapter = () =>
      Promise.resolve({
        data: { success: true, queued: true, data: data ?? {} },
        status: 202,
        statusText: 'Queued',
        headers: {},
        config,
        request: {},
      });
  }

  return config;
});

// ─── Response interceptor: handle 401 with token refresh ─────────────────────
let isRefreshing = false;
let refreshSubscribers: ((token: string) => void)[] = [];

function subscribeTokenRefresh(cb: (token: string) => void) {
  refreshSubscribers.push(cb);
}

function onRefreshed(token: string) {
  refreshSubscribers.forEach(cb => cb(token));
  refreshSubscribers = [];
}

api.interceptors.response.use(
  (res) => res,
  async (err: AxiosError) => {
    const original = err.config as typeof err.config & { _retry?: boolean };

    if (err.response?.status === 401 && !original?._retry && original?.url !== '/auth/refresh') {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          subscribeTokenRefresh((token) => {
            if (original?.headers) original.headers['Authorization'] = `Bearer ${token}`;
            resolve(api(original!));
          });
        });
      }

      original!._retry = true;
      isRefreshing = true;

      const { refreshToken, updateTokens, clearAuth } = useAuthStore.getState();
      if (!refreshToken) {
        clearAuth();
        isRefreshing = false;
        return Promise.reject(err);
      }

      try {
        const response = await axios.post('/api/auth/refresh', { refreshToken });
        const { accessToken: newAccess, refreshToken: newRefresh } = response.data;
        updateTokens(newAccess, newRefresh);
        onRefreshed(newAccess);
        isRefreshing = false;
        if (original?.headers) original.headers['Authorization'] = `Bearer ${newAccess}`;
        return api(original!);
      } catch {
        clearAuth();
        isRefreshing = false;
        window.location.href = '/login';
        return Promise.reject(err);
      }
    }

    const message = (err.response?.data as Record<string, unknown>)?.error || err.message || 'An error occurred';
    return Promise.reject(new Error(String(message)));
  }
);

// ─── Auth ─────────────────────────────────────────────────────────────────────
export const authApi = {
  login: (email: string, password: string) =>
    axios.post<{ success: boolean; accessToken: string; refreshToken: string; user: import('../store/authStore').AuthUser }>(
      '/api/auth/login', { email, password }
    ).then(r => r.data),

  register: (body: {
    firstName: string; lastName: string; username: string;
    email: string; password: string;
    requestedProjectId?: string; requestedRoleId?: string;
  }) => axios.post<{ success: boolean; message: string; data: { id: string } }>('/api/auth/register', body).then(r => r.data),

  logout: (refreshToken?: string) =>
    api.post('/auth/logout', { refreshToken }),

  me: () =>
    api.get<{ success: boolean; data: import('../store/authStore').AuthUser & { last_login_at?: string; created_at?: string } }>('/auth/me').then(r => r.data.data!),

  changePassword: (currentPassword: string, newPassword: string) =>
    api.post('/auth/change-password', { currentPassword, newPassword }).then(r => r.data),

  forgotPassword: (email: string) =>
    axios.post<{ success: boolean; message: string; resetToken?: string; resetUrl?: string }>(
      '/api/auth/forgot-password', { email }
    ).then(r => r.data),

  resetPassword: (token: string, newPassword: string) =>
    axios.post<{ success: boolean; message: string }>('/api/auth/reset-password', { token, newPassword }).then(r => r.data),

  generatePassword: () =>
    axios.get<{ success: boolean; data: { password: string } }>('/api/auth/generate-password').then(r => r.data.data!),
};

// ─── Users ────────────────────────────────────────────────────────────────────
export interface UserRecord {
  id: string; first_name: string; last_name: string; username: string;
  email: string; status: string; is_active: boolean;
  last_login_at?: string; created_at: string; updated_at: string;
  roles: string[];
  projects?: { id: string; name: string; code: string }[];
}

export const usersApi = {
  list: (params?: Record<string, unknown>) =>
    api.get<PaginatedResponse<UserRecord>>('/users', { params }).then(r => r.data),
  get: (id: string) =>
    api.get<{ success: boolean; data: UserRecord }>(`/users/${id}`).then(r => r.data.data!),
  create: (body: {
    firstName: string; lastName: string; username: string; email: string; password: string;
    roleIds?: string[]; projectIds?: string[];
  }) => api.post<{ success: boolean; data: UserRecord }>('/users', body).then(r => r.data.data!),
  update: (id: string, body: Partial<{ firstName: string; lastName: string; username: string; email: string; password: string; roleIds: string[]; projectIds: string[] }>) =>
    api.put<{ success: boolean; data: UserRecord }>(`/users/${id}`, body).then(r => r.data.data!),
  setActive: (id: string, active: boolean) =>
    api.patch(`/users/${id}/active`, { active }).then(r => r.data),
  delete: (id: string) =>
    api.delete(`/users/${id}`).then(r => r.data),
  resetPassword: (id: string, newPassword: string) =>
    api.post(`/users/${id}/reset-password`, { newPassword }).then(r => r.data),
};

// ─── Projects ─────────────────────────────────────────────────────────────────
export interface ProjectRecord {
  id: string; name: string; code?: string; description?: string;
  status: string; created_at: string; user_count?: number; estimation_count?: number;
  users?: { id: string; name: string; email: string; username: string }[];
}

export const projectsApi = {
  list: (params?: Record<string, unknown>) =>
    api.get<PaginatedResponse<ProjectRecord>>('/projects', { params }).then(r => r.data),
  get: (id: string) =>
    api.get<{ success: boolean; data: ProjectRecord }>(`/projects/${id}`).then(r => r.data.data!),
  create: (body: { name: string; description?: string; code?: string; status?: string }) =>
    api.post<{ success: boolean; data: ProjectRecord }>('/projects', body).then(r => r.data.data!),
  update: (id: string, body: Partial<{ name: string; description: string; code: string; status: string }>) =>
    api.put<{ success: boolean; data: ProjectRecord }>(`/projects/${id}`, body).then(r => r.data.data!),
  delete: (id: string) =>
    api.delete(`/projects/${id}`).then(r => r.data),
  assignUsers: (id: string, userIds: string[]) =>
    api.post(`/projects/${id}/users`, { userIds }).then(r => r.data),
  removeUser: (id: string, userId: string) =>
    api.delete(`/projects/${id}/users/${userId}`).then(r => r.data),
};

// ─── Roles & Permissions ──────────────────────────────────────────────────────
export interface RoleRecord {
  id: string; name: string; description?: string; is_system: boolean;
  created_at: string; permissions: string[] | { id: string; name: string; module: string }[];
  user_count: number;
}

export interface PermissionRecord {
  id: string; name: string; description?: string; module: string;
}

export const rolesApi = {
  list: () =>
    api.get<{ success: boolean; data: RoleRecord[] }>('/roles').then(r => r.data.data!),
  get: (id: string) =>
    api.get<{ success: boolean; data: RoleRecord }>(`/roles/${id}`).then(r => r.data.data!),
  create: (body: { name: string; description?: string; permissionIds?: string[] }) =>
    api.post<{ success: boolean; data: RoleRecord }>('/roles', body).then(r => r.data.data!),
  update: (id: string, body: { name?: string; description?: string; permissionIds?: string[] }) =>
    api.put<{ success: boolean; data: RoleRecord }>(`/roles/${id}`, body).then(r => r.data.data!),
  delete: (id: string) =>
    api.delete(`/roles/${id}`).then(r => r.data),
  listPermissions: () =>
    api.get<{ success: boolean; data: PermissionRecord[] }>('/roles/permissions').then(r => r.data.data!),
};

// ─── Registrations ────────────────────────────────────────────────────────────
export interface RegistrationRequest {
  id: string; first_name: string; last_name: string; username: string;
  email: string; status: 'pending' | 'approved' | 'rejected';
  rejection_reason?: string; created_at: string; reviewed_at?: string;
  requested_project_name?: string; requested_project_code?: string;
  requested_role_name?: string; reviewed_by_name?: string;
}

export const registrationsApi = {
  list: (params?: Record<string, unknown>) =>
    api.get<PaginatedResponse<RegistrationRequest>>('/registrations', { params }).then(r => r.data),
  getPendingCount: () =>
    api.get<{ success: boolean; data: { count: number } }>('/registrations/pending-count').then(r => r.data.data!),
  approve: (id: string, roleId?: string) =>
    api.post(`/registrations/${id}/approve`, { roleId }).then(r => r.data),
  reject: (id: string, reason: string) =>
    api.post(`/registrations/${id}/reject`, { reason }).then(r => r.data),
};

// ─── Estimations ──────────────────────────────────────────────────────────────
export const estimationsApi = {
  calculate: (params: { complexity: string; risk: string; competency: string }) =>
    api.get<{ success: boolean; data: CalculationResult }>('/estimations/calculate', { params }).then(r => r.data.data!),

  getAll: (params?: Record<string, unknown>) =>
    api.get<PaginatedResponse<Estimation>>('/estimations', { params }).then(r => r.data),

  getById: (id: string) =>
    api.get<{ success: boolean; data: Estimation }>(`/estimations/${id}`).then(r => r.data.data!),

  create: (body: {
    title: string; description?: string; project_name?: string; project_id?: string;
    complexity: string; risk: string; competency: string; work_group: string; notes?: string;
  }) => api.post<{ success: boolean; data: Estimation }>('/estimations', body).then(r => r.data.data!),

  update: (id: string, body: Partial<Estimation>) =>
    api.put<{ success: boolean; data: Estimation }>(`/estimations/${id}`, body).then(r => r.data.data!),

  recordActuals: (id: string, body: { estimated_hours?: number; actual_hours?: number; completed_at?: string; notes?: string }) =>
    api.patch<{ success: boolean; data: Estimation }>(`/estimations/${id}/actuals`, body).then(r => r.data.data!),

  delete: (id: string) =>
    api.delete<{ success: boolean }>(`/estimations/${id}`).then(r => r.data),

  batchImport: (rows: { title: string; project_name?: string; project_id?: string; description?: string; complexity: string; risk: string; competency: string; work_group: string; notes?: string }[]) =>
    api.post<{ success: boolean; created: number; errors: { row: number; error: string }[] }>('/estimations/import', { rows }).then(r => r.data),
};

// ─── Master Data ──────────────────────────────────────────────────────────────
export const masterApi = {
  getStoryPoints: () =>
    api.get<{ success: boolean; data: StoryPointConfig[] }>('/story-points').then(r => r.data.data!),
  createStoryPoint: (body: Partial<StoryPointConfig>) =>
    api.post<{ success: boolean; data: StoryPointConfig }>('/story-points', body).then(r => r.data.data!),
  updateStoryPoint: (id: string, body: Partial<StoryPointConfig>) =>
    api.put<{ success: boolean; data: StoryPointConfig }>(`/story-points/${id}`, body).then(r => r.data.data!),
  deleteStoryPoint: (id: string) =>
    api.delete(`/story-points/${id}`).then(r => r.data),

  getEffortEstimates: () =>
    api.get<{ success: boolean; data: EffortEstimateConfig[] }>('/effort-estimates').then(r => r.data.data!),
  createEffortEstimate: (body: Partial<EffortEstimateConfig>) =>
    api.post<{ success: boolean; data: EffortEstimateConfig }>('/effort-estimates', body).then(r => r.data.data!),
  updateEffortEstimate: (id: string, body: Partial<EffortEstimateConfig>) =>
    api.put<{ success: boolean; data: EffortEstimateConfig }>(`/effort-estimates/${id}`, body).then(r => r.data.data!),
  deleteEffortEstimate: (id: string) =>
    api.delete(`/effort-estimates/${id}`).then(r => r.data),

  getOverheads: () =>
    api.get<{ success: boolean; data: CompetencyOverheadConfig[] }>('/competency-overheads').then(r => r.data.data!),
  updateOverhead: (id: string, overhead_percent: number) =>
    api.put<{ success: boolean; data: CompetencyOverheadConfig }>(`/competency-overheads/${id}`, { overhead_percent }).then(r => r.data.data!),

  getCompetencyDefs: () =>
    api.get<{ success: boolean; data: CompetencyLevelDefinition[] }>('/competency-definitions').then(r => r.data.data!),
  updateCompetencyDef: (id: string, body: Partial<CompetencyLevelDefinition>) =>
    api.put<{ success: boolean; data: CompetencyLevelDefinition }>(`/competency-definitions/${id}`, body).then(r => r.data.data!),

  getComplexityDefs: () =>
    api.get<{ success: boolean; data: ComplexityDefinition[] }>('/definitions/complexity').then(r => r.data.data!),
  getRiskDefs: () =>
    api.get<{ success: boolean; data: RiskDefinition[] }>('/definitions/risk').then(r => r.data.data!),
};

// ─── Analysis ─────────────────────────────────────────────────────────────────
export const analysisApi = {
  getSummary: (params?: Record<string, unknown>) =>
    api.get<{ success: boolean; data: AnalysisSummary }>('/analysis/summary', { params }).then(r => r.data.data!),
  getByComplexity: (params?: Record<string, unknown>) =>
    api.get<{ success: boolean; data: ComplexityBreakdown[] }>('/analysis/complexity', { params }).then(r => r.data.data!),
  getSPBands: (params?: Record<string, unknown>) =>
    api.get<{ success: boolean; data: SPBandSummary[] }>('/analysis/sp-bands', { params }).then(r => r.data.data!),
  getScatter: (params?: Record<string, unknown>) =>
    api.get<{ success: boolean; data: ScatterPoint[] }>('/analysis/scatter', { params }).then(r => r.data.data!),
  getTrend: (params?: Record<string, unknown>) =>
    api.get<{ success: boolean; data: TrendPoint[] }>('/analysis/trend', { params }).then(r => r.data.data!),
};

// ─── Notifications ────────────────────────────────────────────────────────────
export const notificationsApi = {
  getAll: () =>
    api.get<{ success: boolean; data: Notification[]; unread_count: number }>('/notifications').then(r => r.data),
  markRead: (id: string) => api.patch(`/notifications/${id}/read`),
  markAllRead: () => api.patch('/notifications/read-all'),
};

// ─── Audit Logs ───────────────────────────────────────────────────────────────
export interface AuditLogEntry {
  id: number; entity: string; entity_id?: string; action: string;
  previous_value?: unknown; new_value?: unknown; user_id?: string;
  username?: string; ip_address?: string; timestamp: string;
}

export const auditApi = {
  list: (params?: Record<string, unknown>) =>
    api.get<PaginatedResponse<AuditLogEntry>>('/audit-logs', { params }).then(r => r.data),
};

// ─── Monitoring ───────────────────────────────────────────────────────────────
export interface LogEntry {
  id: number; timestamp: string; level: 'error' | 'warn' | 'info' | 'http' | 'debug';
  category: string; message: string; correlationId?: string;
  method?: string; url?: string; statusCode?: number; responseTimeMs?: number;
  ip?: string; userAgent?: string; errorStack?: string; metadata?: Record<string, unknown>;
}
export interface LogFilters {
  level?: string; category?: string; search?: string;
  from?: string; to?: string; correlationId?: string; limit?: number; offset?: number;
}
export interface ServiceCheck {
  status: 'healthy' | 'degraded' | 'unhealthy'; responseTimeMs: number; message?: string; details?: Record<string, unknown>;
}
export interface HealthReport {
  status: 'healthy' | 'degraded' | 'unhealthy'; timestamp: string; uptimeSeconds: number;
  version: string; environment: string; responseTimeMs: number;
  services: { api: ServiceCheck; database: ServiceCheck; memory: ServiceCheck; system: ServiceCheck; logStorage: ServiceCheck; logDatabase: ServiceCheck; };
}

export const monitoringApi = {
  getLogs: (filters: LogFilters = {}) =>
    api.get<{ success: boolean; data: LogEntry[]; total: number; limit: number; offset: number }>(
      '/monitoring/logs', { params: filters },
    ).then(r => r.data),

  getLogStats: () =>
    api.get<{ success: boolean; data: { byLevel: { level: string; count: number }[]; byCategory: { category: string; count: number }[]; recentErrors: LogEntry[]; hourlyTrend: { hour: string; total: number; errors: number; warnings: number; avg_response_ms: number }[] } }>(
      '/monitoring/logs/stats'
    ).then(r => r.data.data),

  clearLogs: (days = 7) =>
    api.delete<{ success: boolean; deleted: number }>('/monitoring/logs', { params: { days } }).then(r => r.data),

  getHealth: () =>
    api.get<HealthReport>('/monitoring/health').then(r => r.data),
};

export default api;
