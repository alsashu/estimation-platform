import { query, queryOne } from '../config/database';
import type { StoryPointConfig, EffortEstimateConfig, CompetencyOverheadConfig, ComplexityLevel, RiskLevel, CompetencyLevel } from '../types';

export async function getStoryPoints(complexity: string, risk: string): Promise<StoryPointConfig | null> {
  return queryOne<StoryPointConfig>(
    `SELECT * FROM story_point_configs WHERE complexity = $1 AND risk = $2`,
    [complexity, risk]
  );
}

export async function getEffortEstimate(storyPoints: number): Promise<EffortEstimateConfig | null> {
  return queryOne<EffortEstimateConfig>(
    `SELECT * FROM effort_estimate_configs WHERE story_points = $1`,
    [storyPoints]
  );
}

export async function getOverheadPercent(competency: string, complexity: string): Promise<number> {
  const row = await queryOne<CompetencyOverheadConfig>(
    `SELECT overhead_percent FROM competency_overhead_configs WHERE competency = $1 AND complexity = $2`,
    [competency, complexity]
  );
  return row ? Number(row.overhead_percent) : 0;
}

export interface EstimationResult {
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

export async function runFullEstimation(
  complexity: string,
  risk: string,
  competency: string
): Promise<EstimationResult | null> {
  const spConfig = await getStoryPoints(complexity, risk);
  if (!spConfig) return null;

  const effortConfig = await getEffortEstimate(spConfig.story_points);
  if (!effortConfig) return null;

  const overhead = await getOverheadPercent(competency, complexity);

  const minDays = Number(effortConfig.min_days);
  const maxDays = Number(effortConfig.max_days);

  const revisedMinDays = minDays * (1 + overhead);
  const revisedMaxDays = maxDays * (1 + overhead);

  return {
    story_points: spConfig.story_points,
    color_hex: spConfig.color_hex,
    initial_min_days: minDays,
    initial_max_days: maxDays,
    initial_min_hours: minDays * 8,
    initial_max_hours: maxDays * 8,
    overhead_percent: overhead,
    revised_min_days: revisedMinDays,
    revised_max_days: revisedMaxDays,
    revised_min_hours: revisedMinDays * 8,
    revised_max_hours: revisedMaxDays * 8,
  };
}
