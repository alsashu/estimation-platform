export type ComplexityLevel = 'Low' | 'Medium' | 'High' | 'Very High' | 'Unmanageable';
export type RiskLevel = 'Low' | 'Medium' | 'High' | 'Very High' | 'Unknown';
export type CompetencyLevel = 'Emerging' | 'Competent' | 'Expert';

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
  created_at: string;
  updated_at: string;
}

export interface Estimation {
  id: string;
  title: string;
  description?: string;
  project_name?: string;
  complexity: ComplexityLevel;
  risk: RiskLevel;
  competency: CompetencyLevel;
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
  actual_hours?: number;
  actual_days?: number;
  completed_at?: string;
  variance_hours?: number;
  accuracy_percent?: number;
  notes?: string;
  status: 'open' | 'completed';
  created_at: string;
  updated_at: string;
}

export interface Notification {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error';
  title: string;
  message: string;
  read: boolean;
  created_at: string;
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
}

export interface SPBandSummary {
  story_points: number;
  count: number;
  avg_actual_hours: number;
  avg_revised_min_hours: number;
  avg_variance: number;
}
