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

export interface Estimation {
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

export interface TrendPoint {
  date: string;
  total: number;
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

export interface ParametricEstimation {
  id: string;
  task_title: string;
  project_id?: string;
  project_name?: string;
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

export interface ParametricAnalysisSummary {
  total_estimations: number;
  avg_detailed_estimation: number;
  avg_average_estimation: number;
  avg_final_estimation: number;
  avg_team_efficiency: number;
  detailed_basis_pct: number;
  average_basis_pct: number;
  import_count: number;
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

export interface ParametricTrendPoint {
  date: string;
  total: number;
  avg_final_estimation: number;
}

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message?: string;
}
