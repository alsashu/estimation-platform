/** Estimation Performance dashboard — shapes returned by /api/performance/*. All effort is PersonDays. */
export type PerfMethod = 'SP' | 'PE';
export type MethodFilter = 'BOTH' | PerfMethod;
export type KpiStatus = 'good' | 'warning' | 'critical' | 'na';
export type KpiKey = 'efa' | 'ed' | 'ebi' | 'eei';
export type PerfGroupBy = 'department' | 'program' | 'baseline' | 'task';
export type EbiNaReason = 'no_historical_baseline' | 'historical_ed_zero' | 'no_current_records' | 'not_tracked_at_level';

export interface Aggregate {
  record_count: number;
  total_estimated_pd: number;
  total_actual_pd: number;
  total_abs_error_pd: number;
  total_signed_error_pd: number;
  aggregate_ed: number | null;
  signed_ed: number | null;
}

export interface KpiSettings {
  on_target_tolerance: number;
  distribution_bounds: number[];
  thresholds: Record<KpiKey, { good: number; warning: number }>;
  default_range_days: number;
}

export interface BaselineRef {
  id: string;
  version?: number;
  label: string;
  department_id: string;
  program_id: string | null;
  estimation_method: PerfMethod | 'ALL';
}

export interface MissingScope {
  department_id: string | null;
  department_name: string | null;
  program_id: string | null;
  program_name: string | null;
  method: PerfMethod;
  record_count: number;
}

export interface KpiSummary {
  eligible: Aggregate;
  framework: Aggregate & { excluded_overrides: number };
  efa: { value: number | null; framework_aggregate_ed: number | null; status: KpiStatus };
  ed: {
    value: number | null; absolute: number | null;
    under_count: number; over_count: number; on_target_count: number;
    under_pct: number | null; over_pct: number | null; on_target_pct: number | null;
    under_effort_pd: number; over_effort_pd: number;
    under_ed: number | null; over_ed: number | null;
    tolerance: number; status: KpiStatus;
  };
  ebi: {
    value: number | null; na_reason: EbiNaReason | null;
    historical_ed: number | null; current_ed: number | null; reduction: number | null;
    historical: { entry_count: number; record_count: number; total_estimated_pd: number; total_actual_pd: number; total_abs_error_pd: number; aggregate_ed: number | null };
    current: Aggregate;
    baselines_used: BaselineRef[];
    missing_scope: MissingScope[];
    unmatched_baselines: BaselineRef[];
    status: KpiStatus;
  };
  eei: { value: number | null; aggregate_ed: number | null; status: KpiStatus };
  by_method: Record<PerfMethod, Aggregate>;
}

export interface GroupRow {
  id: string | null;
  name: string;
  department_id: string | null;
  department_name: string | null;
  program_id: string | null;
  program_name: string | null;
  method?: PerfMethod;
  record_count: number;
  framework_record_count: number;
  total_estimated_pd: number;
  total_actual_pd: number;
  total_abs_error_pd: number;
  ed: number | null;
  aggregate_ed: number | null;
  efa: number | null;
  eei: number | null;
  ebi: number | null;
  ebi_na_reason: EbiNaReason | null;
  historical_ed: number | null;
  current_ed: number | null;
  under_count: number;
  over_count: number;
  on_target_count: number;
}

export interface TaskRow extends GroupRow {
  baseline_name: string | null;
  framework_aligned: boolean;
  source: string;
  completed_at: string;
  direction: 'under' | 'over' | 'on_target' | null;
}

export interface TrendPoint {
  period: string;
  record_count: number;
  framework_record_count: number;
  efa: number | null;
  eei: number | null;
  ed: number | null;
  total_estimated_pd: number;
  total_actual_pd: number;
}

export interface DistributionBucket { label: string; min: number; max: number | null; count: number; pct: number | null }

export interface RankedProgram { name: string; department_name: string | null; aggregate_ed: number | null }

export interface PerformanceDashboard {
  meta: {
    from: string; to: string; timezone: string; interval: 'day' | 'week' | 'month'; days: number;
    previous: { from: string; to: string };
    methods: PerfMethod[];
    filters: { departmentId: string | null; programIds: string[]; baselineId: string | null };
    sources: string[];
    unit: 'person_days';
    sp_hours_per_pd: number;
    settings: KpiSettings;
    excluded_records: number;
    generated_at: string;
  };
  summary: KpiSummary;
  previous: { efa: number | null; ed: number | null; ebi: number | null; eei: number | null; record_count: number };
  indicators: {
    total_estimated_pd: number; total_actual_pd: number; total_abs_error_pd: number;
    average_deviation: number | null;
    underestimation_rate: number | null; overestimation_rate: number | null; on_target_rate: number | null;
    actuals_coverage: number | null; data_completeness: number | null;
    framework_adoption_rate: number | null; calibration_gap: number | null;
    best_program: RankedProgram | null;
    highest_deviation_program: RankedProgram | null;
    best_department: { name: string; eei: number | null } | null;
    improvement_opportunities: GroupRow[];
    top_improving_programs: GroupRow[];
  };
  coverage: { total_records: number; with_actuals: number; completed: number; complete_data: number; actuals_coverage: number | null; data_completeness: number | null };
  by_program: GroupRow[];
  by_department: GroupRow[];
  trend: TrendPoint[];
  distribution: DistributionBucket[];
}

export interface HistoricalBaseline {
  id: string;
  version: number;
  label: string;
  department_id: string;
  department_name: string | null;
  program_id: string | null;
  program_name: string | null;
  estimation_method: PerfMethod | 'ALL';
  record_count: number;
  total_estimated_pd: number;
  total_actual_pd: number;
  total_abs_error_pd: number;
  period_from: string | null;
  period_to: string | null;
  source_note: string | null;
  is_active: boolean;
  supersedes_id: string | null;
  created_at: string;
  updated_at: string;
  created_by_username: string | null;
  aggregate_ed: number;
}

export type HistoricalBaselineInput = Pick<HistoricalBaseline,
  'department_id' | 'program_id' | 'estimation_method' | 'label' | 'period_from' | 'period_to' |
  'record_count' | 'total_estimated_pd' | 'total_actual_pd' | 'total_abs_error_pd' | 'source_note'>;

export interface SnapshotSummary {
  id: string;
  label: string;
  filters: Record<string, unknown>;
  created_at: string;
  created_by_username: string | null;
  efa: string | null; ed: string | null; ebi: string | null; eei: string | null;
}
