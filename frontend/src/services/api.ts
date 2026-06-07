import axios from 'axios';
import type {
  Estimation, StoryPointConfig, EffortEstimateConfig,
  CompetencyOverheadConfig, CompetencyLevelDefinition,
  ComplexityDefinition, RiskDefinition, Notification,
  CalculationResult, PaginatedResponse, AnalysisSummary,
  ComplexityBreakdown, SPBandSummary, ScatterPoint, TrendPoint,
} from '../types';
import { useConnectionStore, useSyncQueueStore } from '../store';
import type { SyncQueueItem } from '../store';

const api = axios.create({
  baseURL: '/api',
  timeout: 15000,
});

// Intercept mutation requests when offline — queue them and return a synthetic response
const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

api.interceptors.request.use((config) => {
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

    // Short-circuit the real HTTP call with a fake queued response
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

api.interceptors.response.use(
  (res) => res,
  (err) => {
    const message = err.response?.data?.error || err.message || 'An error occurred';
    return Promise.reject(new Error(message));
  }
);

// ─── Estimations ──────────────────────────────────────────────────────────
export const estimationsApi = {
  calculate: (params: { complexity: string; risk: string; competency: string }) =>
    api.get<{ success: boolean; data: CalculationResult }>('/estimations/calculate', { params }).then(r => r.data.data!),

  getAll: (params?: Record<string, unknown>) =>
    api.get<PaginatedResponse<Estimation>>('/estimations', { params }).then(r => r.data),

  getById: (id: string) =>
    api.get<{ success: boolean; data: Estimation }>(`/estimations/${id}`).then(r => r.data.data!),

  create: (body: {
    title: string; description?: string; project_name?: string;
    complexity: string; risk: string; competency: string; notes?: string;
  }) => api.post<{ success: boolean; data: Estimation }>('/estimations', body).then(r => r.data.data!),

  update: (id: string, body: Partial<Estimation>) =>
    api.put<{ success: boolean; data: Estimation }>(`/estimations/${id}`, body).then(r => r.data.data!),

  recordActuals: (id: string, body: { estimated_hours?: number; actual_hours?: number; completed_at?: string; notes?: string }) =>
    api.patch<{ success: boolean; data: Estimation }>(`/estimations/${id}/actuals`, body).then(r => r.data.data!),

  delete: (id: string) =>
    api.delete<{ success: boolean }>(`/estimations/${id}`).then(r => r.data),

  batchImport: (rows: { title: string; project_name?: string; description?: string; complexity: string; risk: string; competency: string; notes?: string }[]) =>
    api.post<{ success: boolean; created: number; errors: { row: number; error: string }[] }>('/estimations/import', { rows }).then(r => r.data),
};

// ─── Master Data ──────────────────────────────────────────────────────────
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

// ─── Analysis ─────────────────────────────────────────────────────────────
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

// ─── Notifications ────────────────────────────────────────────────────────
export const notificationsApi = {
  getAll: () =>
    api.get<{ success: boolean; data: Notification[]; unread_count: number }>('/notifications').then(r => r.data),
  markRead: (id: string) => api.patch(`/notifications/${id}/read`),
  markAllRead: () => api.patch('/notifications/read-all'),
};

// ─── Monitoring ───────────────────────────────────────────────────────────────
export interface LogEntry {
  id: number;
  timestamp: string;
  level: 'error' | 'warn' | 'info' | 'http' | 'debug';
  category: string;
  message: string;
  correlationId?: string;
  method?: string;
  url?: string;
  statusCode?: number;
  responseTimeMs?: number;
  ip?: string;
  userAgent?: string;
  errorStack?: string;
  metadata?: Record<string, unknown>;
}

export interface LogFilters {
  level?: string;
  category?: string;
  search?: string;
  from?: string;
  to?: string;
  correlationId?: string;
  limit?: number;
  offset?: number;
}

export interface ServiceCheck {
  status: 'healthy' | 'degraded' | 'unhealthy';
  responseTimeMs: number;
  message?: string;
  details?: Record<string, unknown>;
}

export interface HealthReport {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptimeSeconds: number;
  version: string;
  environment: string;
  responseTimeMs: number;
  services: {
    api: ServiceCheck;
    database: ServiceCheck;
    memory: ServiceCheck;
    system: ServiceCheck;
    logStorage: ServiceCheck;
    logDatabase: ServiceCheck;
  };
}

export const monitoringApi = {
  getLogs: (filters: LogFilters = {}) =>
    api.get<{ success: boolean; data: LogEntry[]; total: number; limit: number; offset: number }>(
      '/monitoring/logs', { params: filters },
    ).then(r => r.data),

  getLogStats: () =>
    api.get<{
      success: boolean;
      data: {
        byLevel: { level: string; count: number }[];
        byCategory: { category: string; count: number }[];
        recentErrors: LogEntry[];
        hourlyTrend: { hour: string; total: number; errors: number; warnings: number; avg_response_ms: number }[];
      };
    }>('/monitoring/logs/stats').then(r => r.data.data),

  clearLogs: (days = 7) =>
    api.delete<{ success: boolean; deleted: number }>('/monitoring/logs', { params: { days } }).then(r => r.data),

  getHealth: () =>
    api.get<HealthReport>('/monitoring/health').then(r => r.data),
};

export default api;
