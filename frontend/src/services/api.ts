import axios, { AxiosError } from 'axios';
import { normalizeModules, type ModuleCode } from '../utils/moduleAccess';
import type {
  Estimation, StoryPointConfig, EffortEstimateConfig,
  CompetencyOverheadConfig, CompetencyLevelDefinition,
  ComplexityDefinition, RiskDefinition, Notification,
  CalculationResult, PaginatedResponse, AnalysisSummary,
  ComplexityBreakdown, SPBandSummary, ScatterPoint, TrendPoint, ActivityResponse,
  ParametricAverageConfig, ParametricExpertConfig, ParametricEstimation,
  ParametricCalculationResult, ParametricSize,
  ParametricAnalysisSummary, ParametricSizeDistribution, ParametricWorkGroupBreakdown,
  ParametricConfigBreakdown, ParametricTrendPoint, ParametricActualsAnalysis,
  Department, DepartmentUser, Baseline, HierarchyOption, HierarchyContext,
  EffortGroupBy, EffortResponse,
} from '../types';
import { useConnectionStore, useSyncQueueStore } from '../store';
import { useAuthStore } from '../store/authStore';
import type { SyncQueueItem } from '../store';
import type {
  PerformanceDashboard, GroupRow as PerfGroupRow, PerfGroupBy, HistoricalBaseline as PerfHistoricalBaseline,
  HistoricalBaselineInput, KpiSettings, SnapshotSummary,
} from '../modules/performance/types';

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

// ─── Live module access: the server flags responses when the caller's SP / PE access changed ──
// The header carries the LIVE module list ("SP,PE" | "PE" | "none"). We only reload /auth/me when it differs
// from what the store holds — no token rotation here (a rotation cut off by navigation would strand a revoked
// refresh token). The normal refresh flow later issues a token with the new modules.
let accessSync: Promise<void> | null = null;
export function syncAccessFromServer(): Promise<void> {
  if (accessSync) return accessSync;
  accessSync = (async () => {
    try {
      const me = await authApi.me();
      useAuthStore.getState().setUser({ permissions: me.permissions, modules: me.modules ?? [], roles: me.roles });
    } catch { /* retried on the next flagged response */ }
  })().finally(() => { accessSync = null; });
  return accessSync;
}
/** Parses the header; returns the live modules when they differ from the store, else null. */
export function changedModules(headers: unknown): ModuleCode[] | null {
  const raw = (headers as Record<string, unknown> | undefined)?.['x-access-changed'];
  if (typeof raw !== 'string' || !raw) return null;
  const live = normalizeModules(raw === 'none' ? [] : raw.split(','));
  const held = useAuthStore.getState().getModules();
  return live.join(',') === held.join(',') ? null : live;
}
const onAccessHeader = (headers: unknown) => { if (changedModules(headers)) void syncAccessFromServer(); };

api.interceptors.response.use(
  (res) => {
    onAccessHeader(res.headers);
    return res;
  },
  async (err: AxiosError) => {
    onAccessHeader(err.response?.headers);
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
  projects?: { id: string; name: string; code: string; department_id?: string }[];
  departments?: { id: string; name: string; code: string; access_scope: 'assigned' | 'all' }[];
  /** Active estimation modules (SP / PE). A Global Super Admin always has both. */
  estimation_modules?: ModuleCode[];
}

export interface DepartmentGrant { id: string; access_scope: 'assigned' | 'all' }

export const usersApi = {
  list: (params?: Record<string, unknown>) =>
    api.get<PaginatedResponse<UserRecord>>('/users', { params }).then(r => r.data),
  get: (id: string) =>
    api.get<{ success: boolean; data: UserRecord }>(`/users/${id}`).then(r => r.data.data!),
  create: (body: {
    firstName: string; lastName: string; username: string; email: string; password: string;
    roleIds?: string[]; projectIds?: string[]; departments?: DepartmentGrant[]; modules: ModuleCode[];
  }) => api.post<{ success: boolean; data: UserRecord }>('/users', body).then(r => r.data.data!),
  update: (id: string, body: Partial<{ firstName: string; lastName: string; username: string; email: string; password: string; roleIds: string[]; projectIds: string[]; departments: DepartmentGrant[]; modules: ModuleCode[] }>) =>
    api.put<{ success: boolean; data: UserRecord }>(`/users/${id}`, body).then(r => r.data.data!),
  setActive: (id: string, active: boolean) =>
    api.patch(`/users/${id}/active`, { active }).then(r => r.data),
  delete: (id: string) =>
    api.delete(`/users/${id}`).then(r => r.data),
  resetPassword: (id: string, newPassword: string) =>
    api.post(`/users/${id}/reset-password`, { newPassword }).then(r => r.data),
};

// ─── Programs (formerly "Projects") ───────────────────────────────────────────
export interface ProjectRecord {
  id: string; name: string; code?: string; description?: string;
  department_id: string; department_name?: string; department_code?: string;
  baseline_count?: number; parametric_estimation_count?: number;
  baselines?: { id: string; name: string; version?: string; status: string; is_legacy: boolean }[];
  status: string; created_at: string; user_count?: number; estimation_count?: number;
  users?: { id: string; name: string; email: string; username: string }[];
  parametric_average_config_id?: string | null;
  parametric_expert_config_id?: string | null;
  parametric_average_config_name?: string | null;
  parametric_expert_config_name?: string | null;
}

export const projectsApi = {
  list: (params?: Record<string, unknown>) =>
    api.get<PaginatedResponse<ProjectRecord>>('/programs', { params }).then(r => r.data),
  get: (id: string) =>
    api.get<{ success: boolean; data: ProjectRecord }>(`/programs/${id}`).then(r => r.data.data!),
  create: (body: { department_id: string; name: string; description?: string; code?: string; status?: string }) =>
    api.post<{ success: boolean; data: ProjectRecord }>('/programs', body).then(r => r.data.data!),
  update: (id: string, body: Partial<{ department_id: string; name: string; description: string; code: string; status: string }>) =>
    api.put<{ success: boolean; data: ProjectRecord }>(`/programs/${id}`, body).then(r => r.data.data!),
  delete: (id: string) =>
    api.delete(`/programs/${id}`).then(r => r.data),
  assignUsers: (id: string, userIds: string[]) =>
    api.post(`/programs/${id}/users`, { userIds }).then(r => r.data),
  removeUser: (id: string, userId: string) =>
    api.delete(`/programs/${id}/users/${userId}`).then(r => r.data),
};

/** Preferred name — Programs replace Projects throughout the UI. */
export type ProgramRecord = ProjectRecord;
export const programsApi = projectsApi;

// ─── Organisational hierarchy ─────────────────────────────────────────────────
export const departmentsApi = {
  list: (params?: Record<string, unknown>) =>
    api.get<{ success: boolean; data: Department[]; total: number }>('/departments', { params }).then(r => r.data),
  get: (id: string) =>
    api.get<{ success: boolean; data: Department }>(`/departments/${id}`).then(r => r.data.data!),
  create: (body: { name: string; code: string; description?: string; status?: string }) =>
    api.post<{ success: boolean; data: Department }>('/departments', body).then(r => r.data.data!),
  update: (id: string, body: Partial<{ name: string; code: string; description: string; status: string }>) =>
    api.put<{ success: boolean; data: Department }>(`/departments/${id}`, body).then(r => r.data.data!),
  setStatus: (id: string, status: 'active' | 'inactive') =>
    api.patch<{ success: boolean; data: Department }>(`/departments/${id}/status`, { status }).then(r => r.data.data!),
  listUsers: (id: string) =>
    api.get<{ success: boolean; data: DepartmentUser[] }>(`/departments/${id}/users`).then(r => r.data.data!),
  assignUsers: (id: string, userIds: string[], access_scope: 'assigned' | 'all') =>
    api.post(`/departments/${id}/users`, { userIds, access_scope }).then(r => r.data),
  removeUser: (id: string, userId: string) =>
    api.delete(`/departments/${id}/users/${userId}`).then(r => r.data),
};

export interface BaselineInput {
  program_id: string; department_id?: string; name: string; version?: string | null; description?: string | null;
  start_date?: string | null; end_date?: string | null; status?: 'active' | 'inactive';
}

export const baselinesApi = {
  list: (params?: Record<string, unknown>) =>
    api.get<{ success: boolean; data: Baseline[]; total: number }>('/baselines', { params }).then(r => r.data),
  get: (id: string) =>
    api.get<{ success: boolean; data: Baseline }>(`/baselines/${id}`).then(r => r.data.data!),
  create: (body: BaselineInput) =>
    api.post<{ success: boolean; data: Baseline }>('/baselines', body).then(r => r.data.data!),
  update: (id: string, body: Partial<Omit<BaselineInput, 'program_id' | 'department_id'>>) =>
    api.put<{ success: boolean; data: Baseline }>(`/baselines/${id}`, body).then(r => r.data.data!),
  setStatus: (id: string, status: 'active' | 'inactive') =>
    api.patch(`/baselines/${id}/status`, { status }).then(r => r.data),
  delete: (id: string) => api.delete(`/baselines/${id}`).then(r => r.data),

  createComponent: (body: { baseline_id: string; name: string; description?: string }) =>
    api.post('/components', body).then(r => r.data.data),
  updateComponent: (id: string, body: { name?: string; description?: string | null }) =>
    api.put(`/components/${id}`, body).then(r => r.data.data),
  deleteComponent: (id: string) => api.delete(`/components/${id}`).then(r => r.data),

  createSubcomponent: (body: { component_id: string; name: string; description?: string }) =>
    api.post('/subcomponents', body).then(r => r.data.data),
  updateSubcomponent: (id: string, body: { name?: string; description?: string | null }) =>
    api.put(`/subcomponents/${id}`, body).then(r => r.data.data),
  deleteSubcomponent: (id: string) => api.delete(`/subcomponents/${id}`).then(r => r.data),
};

type Lookup = { success: boolean; data: HierarchyOption[] };
const lookup = (path: string, params: Record<string, unknown>) =>
  api.get<Lookup>(`/hierarchy/lookup/${path}`, { params }).then(r => r.data.data);

/** Permission-filtered data for the header context and cascading dropdowns. */
export const hierarchyApi = {
  context: () => api.get<{ success: boolean; data: HierarchyContext }>('/hierarchy/context').then(r => r.data.data),
  departments: (search?: string) => lookup('departments', { search }),
  programs: (departmentId: string, search?: string) => lookup('programs', { departmentId, search }),
  baselines: (programId: string, search?: string) => lookup('baselines', { programId, search }),
  components: (baselineId: string, search?: string) => lookup('components', { baselineId, search }),
  subcomponents: (componentId: string, search?: string) => lookup('subcomponents', { componentId, search }),
  effort: (params: { module: 'sp' | 'pe'; groupBy: EffortGroupBy } & Record<string, unknown>) =>
    api.get<EffortResponse>('/hierarchy/effort', { params }).then(r => r.data),
};

/** Hierarchy ids sent with task create / import / re-assignment. */
export interface TaskHierarchyPayload {
  department_id: string;
  program_id: string;
  baseline_id: string;
  component_id?: string | null;
  subcomponent_id?: string | null;
}

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
  approve: (id: string, modules: ModuleCode[], roleId?: string) =>
    api.post(`/registrations/${id}/approve`, { roleId, modules }).then(r => r.data),
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

  create: (body: TaskHierarchyPayload & {
    title: string; description?: string;
    complexity: string; risk: string; competency: string; work_group: string; notes?: string;
  }) => api.post<{ success: boolean; data: Estimation }>('/estimations', body).then(r => r.data.data!),

  update: (id: string, body: Partial<TaskHierarchyPayload & { title: string; description: string | null; notes: string | null }>) =>
    api.put<{ success: boolean; data: Estimation }>(`/estimations/${id}`, body).then(r => r.data.data!),

  recordActuals: (id: string, body: { estimated_hours?: number; actual_hours?: number; completed_at?: string; notes?: string }) =>
    api.patch<{ success: boolean; data: Estimation }>(`/estimations/${id}/actuals`, body).then(r => r.data.data!),

  delete: (id: string) =>
    api.delete<{ success: boolean }>(`/estimations/${id}`).then(r => r.data),

  batchImport: (hierarchy: TaskHierarchyPayload, rows: { title: string; description?: string; complexity: string; risk: string; competency: string; work_group: string; notes?: string }[]) =>
    api.post<{ success: boolean; created: number; errors: { row: number; error: string }[] }>('/estimations/import', { hierarchy, rows }).then(r => r.data),
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

// ─── Parametric Estimation: Master Data ──────────────────────────────────────────
export interface ParametricInputs {
  middleware_inputs: ParametricSize;
  application: ParametricSize;
  system_configuration: ParametricSize;
  data_and_control_flow: ParametricSize;
  use_case: ParametricSize;
  team_efficiency: number;
}

export const parametricMasterApi = {
  getAverageConfigs: () =>
    api.get<{ success: boolean; data: ParametricAverageConfig[] }>('/parametric/average-configs').then(r => r.data.data!),
  createAverageConfig: (body: { name: string; description?: string; small: number; medium: number; large: number }) =>
    api.post<{ success: boolean; data: ParametricAverageConfig }>('/parametric/average-configs', body).then(r => r.data.data!),
  updateAverageConfig: (id: string, body: Partial<{ name: string; description: string; small: number; medium: number; large: number; is_active: boolean }>) =>
    api.put<{ success: boolean; data: ParametricAverageConfig }>(`/parametric/average-configs/${id}`, body).then(r => r.data.data!),
  setDefaultAverageConfig: (id: string) =>
    api.patch(`/parametric/average-configs/${id}/default`).then(r => r.data),
  deleteAverageConfig: (id: string) =>
    api.delete(`/parametric/average-configs/${id}`).then(r => r.data),

  getExpertConfigs: () =>
    api.get<{ success: boolean; data: ParametricExpertConfig[] }>('/parametric/expert-configs').then(r => r.data.data!),
  createExpertConfig: (body: { name: string; description?: string; values: ParametricExpertConfig['values'] }) =>
    api.post<{ success: boolean; data: ParametricExpertConfig }>('/parametric/expert-configs', body).then(r => r.data.data!),
  updateExpertConfig: (id: string, body: Partial<{ name: string; description: string; is_active: boolean; values: ParametricExpertConfig['values'] }>) =>
    api.put<{ success: boolean; data: ParametricExpertConfig }>(`/parametric/expert-configs/${id}`, body).then(r => r.data.data!),
  setDefaultExpertConfig: (id: string) =>
    api.patch(`/parametric/expert-configs/${id}/default`).then(r => r.data),
  deleteExpertConfig: (id: string) =>
    api.delete(`/parametric/expert-configs/${id}`).then(r => r.data),

  setProjectConfig: (projectId: string, body: { parametric_average_config_id?: string | null; parametric_expert_config_id?: string | null }) =>
    api.patch(`/programs/${projectId}/parametric-config`, body).then(r => r.data),
};

// ─── Parametric Estimation ────────────────────────────────────────────────────────
export const parametricEstimationsApi = {
  calculate: (body: ParametricInputs & { program_id?: string }) =>
    api.post<{ success: boolean; data: ParametricCalculationResult }>('/parametric-estimations/calculate', body).then(r => r.data.data!),

  getAll: (params?: Record<string, unknown>) =>
    api.get<PaginatedResponse<ParametricEstimation>>('/parametric-estimations', { params }).then(r => r.data),

  getById: (id: string) =>
    api.get<{ success: boolean; data: ParametricEstimation }>(`/parametric-estimations/${id}`).then(r => r.data.data!),

  create: (body: ParametricInputs & TaskHierarchyPayload & {
    task_title: string; description?: string; work_group?: string;
  }) => api.post<{ success: boolean; data: ParametricEstimation }>('/parametric-estimations', body).then(r => r.data.data!),

  update: (id: string, body: Partial<TaskHierarchyPayload & { task_title: string; description: string | null; work_group: string | null }>) =>
    api.put<{ success: boolean; data: ParametricEstimation }>(`/parametric-estimations/${id}`, body).then(r => r.data.data!),

  /** Records or corrects actual effort (PersonDays). Omitted notes are kept; null/'' clears them. */
  recordActuals: (id: string, body: { actual_days: number; notes?: string | null; completed_at?: string }) =>
    api.patch<{ success: boolean; data: ParametricEstimation }>(`/parametric-estimations/${id}/actuals`, body).then(r => r.data.data!),

  batchImport: (hierarchy: TaskHierarchyPayload, rows: (ParametricInputs & {
    task_title: string; description?: string; work_group?: string;
  })[]) =>
    api.post<{ success: boolean; created: number; errors: { row: number; error: string }[] }>('/parametric-estimations/import', { hierarchy, rows }).then(r => r.data),
};

// ─── Parametric Analysis ──────────────────────────────────────────────────────────
export const parametricAnalysisApi = {
  getSummary: (params?: Record<string, unknown>) =>
    api.get<{ success: boolean; data: ParametricAnalysisSummary }>('/parametric-analysis/summary', { params }).then(r => r.data.data!),
  getSizeDistribution: (params?: Record<string, unknown>) =>
    api.get<{ success: boolean; data: ParametricSizeDistribution[] }>('/parametric-analysis/size-distribution', { params }).then(r => r.data.data!),
  getByWorkGroup: (params?: Record<string, unknown>) =>
    api.get<{ success: boolean; data: ParametricWorkGroupBreakdown[] }>('/parametric-analysis/work-group', { params }).then(r => r.data.data!),
  getByConfig: (params?: Record<string, unknown>) =>
    api.get<{ success: boolean; data: ParametricConfigBreakdown[] }>('/parametric-analysis/config', { params }).then(r => r.data.data!),
  getTrend: (params?: Record<string, unknown>) =>
    api.get<{ success: boolean; data: ParametricTrendPoint[] }>('/parametric-analysis/trend', { params }).then(r => r.data.data!),
  /** Estimation Activity for a From/To range (YYYY-MM-DD) in the caller time zone. */
  getActivity: (params: Record<string, unknown>) =>
    api.get<{ success: boolean } & ActivityResponse<ParametricTrendPoint>>('/parametric-analysis/trend', { params }).then(r => ({ data: r.data.data, meta: r.data.meta })),
  getActuals: (params?: Record<string, unknown>) =>
    api.get<{ success: boolean; data: ParametricActualsAnalysis }>('/parametric-analysis/actuals', { params }).then(r => r.data.data!),
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
  /** Estimation Activity for a From/To range (YYYY-MM-DD) in the caller time zone. */
  getActivity: (params: Record<string, unknown>) =>
    api.get<{ success: boolean } & ActivityResponse<TrendPoint>>('/analysis/trend', { params }).then(r => ({ data: r.data.data, meta: r.data.meta })),
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

// ─── Estimation Performance (EFA / ED / EBI / EEI) ──────────────────────────────
export const performanceApi = {
  dashboard: (params: Record<string, unknown>) =>
    api.get<{ success: boolean; data: PerformanceDashboard }>('/performance/dashboard', { params }).then(r => r.data.data),
  breakdown: <T = PerfGroupRow>(params: Record<string, unknown> & { groupBy: PerfGroupBy }) =>
    api.get<{ success: boolean; data: T[]; meta: { excluded_records: number } }>('/performance/breakdown', { params }).then(r => r.data),
  baselines: (params?: Record<string, unknown>) =>
    api.get<{ success: boolean; data: PerfHistoricalBaseline[] }>('/performance/baselines', { params }).then(r => r.data.data),
  createBaseline: (body: HistoricalBaselineInput) =>
    api.post<{ success: boolean; data: PerfHistoricalBaseline }>('/performance/baselines', body).then(r => r.data.data),
  updateBaseline: (id: string, body: HistoricalBaselineInput) =>
    api.put<{ success: boolean; data: PerfHistoricalBaseline }>(`/performance/baselines/${id}`, body).then(r => r.data.data),
  setBaselineStatus: (id: string, is_active: boolean) =>
    api.patch<{ success: boolean; data: PerfHistoricalBaseline }>(`/performance/baselines/${id}/status`, { is_active }).then(r => r.data.data),
  settings: () => api.get<{ success: boolean; data: KpiSettings }>('/performance/settings').then(r => r.data.data),
  updateSettings: (body: KpiSettings) =>
    api.put<{ success: boolean; data: KpiSettings }>('/performance/settings', body).then(r => r.data.data),
  snapshots: () => api.get<{ success: boolean; data: SnapshotSummary[] }>('/performance/snapshots').then(r => r.data.data),
  snapshot: (id: string) =>
    api.get<{ success: boolean; data: SnapshotSummary & { result: PerformanceDashboard } }>(`/performance/snapshots/${id}`).then(r => r.data.data),
  createSnapshot: (label: string, filters: Record<string, unknown>) =>
    api.post<{ success: boolean; data: { id: string; label: string; created_at: string } }>('/performance/snapshots', { label, filters }).then(r => r.data.data),
};
