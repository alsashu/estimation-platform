export type ComplexityLevel = 'Low' | 'Medium' | 'High' | 'Very High' | 'Unmanageable';
export type RiskLevel       = 'Low' | 'Medium' | 'High' | 'Very High' | 'Unknown';
export type CompetencyLevel = 'Emerging' | 'Competent' | 'Expert';
export type WorkGroup = 'DEVELOPMENT' | 'VALIDATION' | 'SPECIFICATION';
export type EstimationStatus = 'open' | 'completed';
export type Theme = 'light' | 'dark';

export interface StoryPointConfig {
  id: string;
  complexity: ComplexityLevel;
  risk: RiskLevel;
  story_points: number;
  color_hex: string;
  created_at: string;
  updated_at: string;
}

export interface EffortEstimateConfig {
  id: string;
  story_points: number;
  min_days: number;
  max_days: number;
  min_hours: number;
  max_hours: number;
  created_at: string;
  updated_at: string;
}

export interface CompetencyOverheadConfig {
  id: string;
  competency: CompetencyLevel;
  complexity: ComplexityLevel;
  overhead_percent: number;
  created_at: string;
  updated_at: string;
}

export interface CompetencyLevelDefinition {
  id: string;
  level: CompetencyLevel;
  description: string;
  knowledge_depth: string;
  independence: string;
  problem_solving: string;
  communication: string;
  mentorship: string;
  sort_order: number;
}

export interface ComplexityDefinition {
  id: string;
  level: ComplexityLevel;
  scope: string;
  requirement_clarity: string;
  business_logic: string;
  dependencies: string;
  implementation_effort: string;
  testing_effort: string;
  risk_label: string;
  rollback_complexity: string;
  sort_order: number;
}

export interface RiskDefinition {
  id: string;
  level: RiskLevel;
  scope: string;
  requirement_clarity: string;
  business_logic: string;
  dependencies: string;
  implementation_effort: string;
  testing_effort: string;
  risk_label: string;
  rollback_complexity: string;
  sort_order: number;
}

export interface Estimation extends TaskHierarchyFields {
  id: string;
  title: string;
  description?: string;
  project_name?: string;
  complexity: ComplexityLevel;
  risk: RiskLevel;
  competency: CompetencyLevel;
  work_group: WorkGroup;
  story_points: number;
  initial_min_days: number;
  initial_max_days: number;
  initial_min_hours: number;
  initial_max_hours: number;
  overhead_percent: number;
  revised_min_days: number;
  revised_max_days: number;
  revised_min_hours: number;
  revised_max_hours: number;
  estimated_hours?: number;
  actual_hours?: number;
  actual_days?: number;
  completed_at?: string;
  variance_hours?: number;
  accuracy_percent?: number;
  notes?: string;
  status: EstimationStatus;
  created_at: string;
  updated_at: string;
}

export interface CalculationResult {
  story_points: number;
  color_hex: string;
  initial_min_days: number;
  initial_max_days: number;
  initial_min_hours: number;
  initial_max_hours: number;
  overhead_percent: number;
  revised_min_days: number;
  revised_max_days: number;
  revised_min_hours: number;
  revised_max_hours: number;
}

export interface Notification {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error';
  title: string;
  message: string;
  read: boolean;
  created_at: string;
  // Enterprise fields
  user_id?: string;
  category?: 'general' | 'approval' | 'system' | 'security';
  action_url?: string;
  priority?: 'normal' | 'high' | 'urgent';
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  total: number;
  page: number;
  limit: number;
}

export interface AnalysisSummary {
  total_estimations: number;
  completed_estimations: number;
  avg_accuracy: number;
  avg_variance: number;
  bias: 'under-estimate' | 'over-estimate' | 'accurate';
  std_deviation: number;
}

export interface ComplexityBreakdown {
  complexity: ComplexityLevel;
  count: number;
  avg_accuracy: number;
  avg_variance: number;
  min_accuracy: number;
  max_accuracy: number;
}

export interface SPBandSummary {
  story_points: number;
  count: number;
  avg_actual_hours: number;
  avg_revised_min_hours: number;
  avg_variance: number;
}

export interface ScatterPoint {
  id: string;
  title: string;
  revised_min_hours: number;
  actual_hours: number;
  complexity: ComplexityLevel;
  story_points: number;
  accuracy_percent: number;
}

/** One bucket of the Estimation Activity graph. date = bucket start (YYYY-MM-DD, caller time zone). */
export interface ActivityBucket {
  date: string;
  /** Bucket start / end clamped to the requested range (weekly / monthly buckets can be partial). */
  period_start: string;
  period_end: string;
  total: number;
}

export type ActivityInterval = 'day' | 'week' | 'month';

export interface ActivityMeta {
  from: string;
  to: string;
  timezone: string;
  interval: ActivityInterval;
  days: number;
}

export interface ActivityResponse<P extends ActivityBucket> {
  data: P[];
  meta: ActivityMeta;
}

/** SP: total = created in bucket; completed = completed in bucket. */
export interface TrendPoint extends ActivityBucket {
  completed: number;
  avg_accuracy: number;
}

// ─── Parametric Estimation ──────────────────────────────────────────────────────
export type ParametricSize = 'Small' | 'Medium' | 'Large' | 'NA';
export type TeamEfficiency = 1 | 0.8 | 0.5;

export interface ParametricFieldSet {
  middleware_inputs: number;
  application: number;
  system_configuration: number;
  data_and_control_flow: number;
  use_case: number;
}

export interface ParametricAverageConfig {
  id: string;
  name: string;
  description?: string;
  small: number;
  medium: number;
  large: number;
  is_default: boolean;
  is_active: boolean;
  project_count?: number;
  created_at: string;
  updated_at: string;
}

export interface ParametricExpertConfig {
  id: string;
  name: string;
  description?: string;
  is_default: boolean;
  is_active: boolean;
  project_count?: number;
  values: { Small: ParametricFieldSet; Medium: ParametricFieldSet; Large: ParametricFieldSet };
  created_at: string;
  updated_at: string;
}

export interface ParametricBreakdownField {
  field: keyof ParametricFieldSet;
  label: string;
  size: ParametricSize;
  detailed_value: number;
  average_value: number;
}

export interface ParametricCalculationResult {
  multiplier: number;
  detailed_estimation: number;
  average_estimation: number;
  final_estimation: number;
  final_basis: 'detailed' | 'average';
  breakdown: ParametricBreakdownField[];
  expert_config: { id: string; name: string; values: ParametricExpertConfig['values'] };
  average_config: { id: string; name: string; small: number; medium: number; large: number };
}

export interface ParametricEstimation extends TaskHierarchyFields {
  id: string;
  task_title: string;
  project_name?: string;
  status?: 'open' | 'completed';
  actual_days?: number | null;
  variance_days?: number | null;
  accuracy_percent?: number | null;
  deviation_percent?: number | null;
  actual_notes?: string | null;
  completed_at?: string | null;
  actuals_recorded_by?: string | null;
  actuals_recorded_by_name?: string | null;
  actuals_recorded_at?: string | null;
  actuals_updated_by?: string | null;
  actuals_updated_by_name?: string | null;
  actuals_updated_at?: string | null;
  description?: string;
  work_group?: string;
  middleware_inputs: ParametricSize;
  application: ParametricSize;
  system_configuration: ParametricSize;
  data_and_control_flow: ParametricSize;
  use_case: ParametricSize;
  team_efficiency: TeamEfficiency;
  multiplier: number;
  detailed_estimation: number;
  average_estimation: number;
  final_estimation: number;
  expert_config_id?: string;
  expert_config_name?: string;
  expert_config_snapshot?: ParametricExpertConfig['values'];
  average_config_id?: string;
  average_config_name?: string;
  average_config_snapshot?: { small: number; medium: number; large: number };
  breakdown?: ParametricBreakdownField[];
  source: 'manual' | 'excel_import';
  created_by?: string;
  created_at: string;
  updated_by?: string;
  updated_at: string;
}

/** variance_days = Estimated − Actual (positive = finished under estimate). */
export interface ParametricActualsPoint {
  id: string;
  task_title: string;
  estimated_days: number;
  actual_days: number;
  variance_days: number;
  accuracy_percent: number | null;
  deviation_percent: number | null;
  completed_at: string | null;
}

export interface ParametricActualsAnalysis {
  points: ParametricActualsPoint[];
  accuracy_bands: { band: string; count: number }[];
}

export interface ParametricAnalysisSummary {
  total_estimations: number;
  avg_detailed_estimation: number;
  avg_average_estimation: number;
  avg_final_estimation: number;
  avg_team_efficiency: number;
  detailed_basis_pct: number;
  average_basis_pct: number;
  import_count: number;
  /** Estimated vs Actual (PersonDays) — over tasks with recorded actuals only. */
  completed_count: number;
  open_count: number;
  estimated_completed_days: number;
  actual_total_days: number;
  total_variance_days: number;
  avg_accuracy_percent: number | null;
  avg_deviation_percent: number | null;
  under_estimate_count: number;
  over_estimate_count: number;
  on_target_count: number;
}

export interface ParametricSizeDistribution {
  field: string;
  Small: number;
  Medium: number;
  Large: number;
  NA: number;
}

export interface ParametricWorkGroupBreakdown {
  work_group: string;
  count: number;
  avg_final_estimation: number;
}

export interface ParametricConfigBreakdown {
  expert_config_name: string;
  count: number;
  avg_final_estimation: number;
}

export interface ParametricTrendPoint extends ActivityBucket {
  manual: number;
  excel_import: number;
  avg_final_estimation: number;
}

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message?: string;
}

// ─── Organisational hierarchy ────────────────────────────────────────────────
// Department → Program → Baseline → Component (optional) → Subcomponent (optional) → Task

export type HierarchyStatus = 'active' | 'inactive';

/** Hierarchy references + display names carried by every SP and PE task. */
export interface TaskHierarchyFields {
  department_id?: string | null;
  department_name?: string | null;
  /** The Program id ("project" is the legacy name, kept for API compatibility). */
  project_id?: string | null;
  program_name?: string | null;
  baseline_id?: string | null;
  baseline_name?: string | null;
  component_id?: string | null;
  component_name?: string | null;
  subcomponent_id?: string | null;
  subcomponent_name?: string | null;
}

export interface Department {
  id: string;
  name: string;
  code: string;
  description?: string | null;
  status: HierarchyStatus;
  is_system: boolean;
  created_by?: string | null;
  created_by_name?: string | null;
  created_at: string;
  updated_at?: string;
  program_count?: number;
  user_count?: number;
  programs?: { id: string; name: string; code?: string; status: string; baseline_count: number }[];
}

export interface DepartmentUser {
  id: string; first_name: string; last_name: string; username: string; email: string;
  access_scope: 'assigned' | 'all';
  assigned_at: string;
  programs: { id: string; name: string; code?: string }[];
}

export interface Baseline {
  id: string;
  project_id: string;
  name: string;
  version?: string | null;
  description?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  status: HierarchyStatus;
  is_legacy: boolean;
  created_at: string;
  program_name?: string;
  program_code?: string;
  department_id?: string;
  department_name?: string;
  component_count?: number;
  sp_task_count?: number;
  pe_task_count?: number;
  sp_unstructured_count?: number;
  pe_unstructured_count?: number;
  components?: ComponentNode[];
}

export interface ComponentNode {
  id: string;
  name: string;
  description?: string | null;
  sp_task_count: number;
  pe_task_count: number;
  subcomponents: SubcomponentNode[];
}

export interface SubcomponentNode {
  id: string;
  name: string;
  description?: string | null;
  sp_task_count: number;
  pe_task_count: number;
}

/** Minimal option row returned by /hierarchy/lookup/* and /hierarchy/context. */
export interface HierarchyOption {
  id: string;
  name: string;
  code?: string | null;
  version?: string | null;
  department_id?: string;
  is_legacy?: boolean;
  is_system?: boolean;
}

export interface HierarchyContext {
  isGlobal: boolean;
  departments: HierarchyOption[];
  programs: (HierarchyOption & { department_id: string })[];
}

/** Values of a Department → … → Subcomponent selection (empty string = not selected). */
export interface HierarchySelection {
  department_id: string;
  program_id: string;
  baseline_id: string;
  component_id: string;
  subcomponent_id: string;
}

export type EffortGroupBy = 'department' | 'program' | 'baseline' | 'component' | 'subcomponent' | 'task';

export interface EffortRow {
  id: string | null;
  name: string;
  status?: string;
  department_name: string | null;
  program_name: string | null;
  baseline_name: string | null;
  component_name: string | null;
  subcomponent_name?: string | null;
  task_count: number;
  completed_count: number;
  estimated_total: number;
  estimated_completed: number;
  actual_total: number;
  variance: number;
  accuracy_percent: number | null;
  deviation_percent?: number | null;
}

export interface EffortResponse {
  success: boolean;
  unit: 'hours' | 'person_days';
  /** SP: Actual − Estimated; PE: Estimated − Actual. */
  variance_convention?: 'actual_minus_estimated' | 'estimated_minus_actual';
  groupBy: EffortGroupBy;
  data: EffortRow[];
  totals: Omit<EffortRow, 'id' | 'name' | 'department_name' | 'program_name' | 'baseline_name' | 'component_name'>;
}
