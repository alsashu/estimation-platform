import { query, queryOne } from '../config/database';

export const PARAMETRIC_SIZES = ['Small', 'Medium', 'Large', 'NA'] as const;
export type ParametricSize = typeof PARAMETRIC_SIZES[number];

export const TEAM_EFFICIENCY_VALUES = [1, 0.8, 0.5] as const;
export type TeamEfficiency = typeof TEAM_EFFICIENCY_VALUES[number];

export const PARAMETRIC_FIELDS = [
  'middleware_inputs',
  'application',
  'system_configuration',
  'data_and_control_flow',
  'use_case',
] as const;
export type ParametricField = typeof PARAMETRIC_FIELDS[number];

const FIELD_LABELS: Record<ParametricField, string> = {
  middleware_inputs: 'Middleware Inputs',
  application: 'Application',
  system_configuration: 'System Configuration',
  data_and_control_flow: 'Data and Control Flow',
  use_case: 'Use Case',
};

export type ExpertFieldSet = Record<ParametricField, number>;

export interface AverageConfig {
  id: string;
  name: string;
  small: number;
  medium: number;
  large: number;
}

export interface ExpertConfig {
  id: string;
  name: string;
  values: Record<'Small' | 'Medium' | 'Large', ExpertFieldSet>;
}

export interface ParametricInputs {
  middleware_inputs: ParametricSize;
  application: ParametricSize;
  system_configuration: ParametricSize;
  data_and_control_flow: ParametricSize;
  use_case: ParametricSize;
  team_efficiency: number;
}

export interface ParametricBreakdownField {
  field: ParametricField;
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
  expert_config: { id: string; name: string; values: ExpertConfig['values'] };
  average_config: { id: string; name: string; small: number; medium: number; large: number };
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function round3(n: number): number {
  return Math.round((n + Number.EPSILON) * 1000) / 1000;
}

function averageValueFor(size: ParametricSize, avg: AverageConfig): number {
  if (size === 'Small') return Number(avg.small);
  if (size === 'Medium') return Number(avg.medium);
  if (size === 'Large') return Number(avg.large);
  return 0;
}

function expertValueFor(size: ParametricSize, field: ParametricField, expert: ExpertConfig): number {
  if (size !== 'Small' && size !== 'Medium' && size !== 'Large') return 0;
  return Number(expert.values[size][field]);
}

// ─── Master data lookups ───────────────────────────────────────────────────────

interface AverageConfigRow {
  id: string; name: string; small: string | number; medium: string | number; large: string | number;
}

function mapAverageRow(row: AverageConfigRow): AverageConfig {
  return { id: row.id, name: row.name, small: Number(row.small), medium: Number(row.medium), large: Number(row.large) };
}

export async function getAverageConfigById(id: string): Promise<AverageConfig | null> {
  const row = await queryOne<AverageConfigRow>(
    `SELECT id, name, small, medium, large FROM parametric_average_configs WHERE id = $1 AND is_active = true`,
    [id]
  );
  return row ? mapAverageRow(row) : null;
}

export async function getDefaultAverageConfig(): Promise<AverageConfig | null> {
  const row = await queryOne<AverageConfigRow>(
    `SELECT id, name, small, medium, large FROM parametric_average_configs
     WHERE is_active = true ORDER BY is_default DESC, created_at ASC LIMIT 1`
  );
  return row ? mapAverageRow(row) : null;
}

interface ExpertValueRow {
  size: 'Small' | 'Medium' | 'Large';
  middleware_inputs: string | number;
  application: string | number;
  system_configuration: string | number;
  data_and_control_flow: string | number;
  use_case: string | number;
}

async function loadExpertValues(configId: string): Promise<ExpertConfig['values']> {
  const rows = await query<ExpertValueRow>(
    `SELECT size, middleware_inputs, application, system_configuration, data_and_control_flow, use_case
     FROM parametric_expert_values WHERE config_id = $1`,
    [configId]
  );
  const empty: ExpertFieldSet = { middleware_inputs: 0, application: 0, system_configuration: 0, data_and_control_flow: 0, use_case: 0 };
  const values: ExpertConfig['values'] = { Small: { ...empty }, Medium: { ...empty }, Large: { ...empty } };
  for (const row of rows) {
    values[row.size] = {
      middleware_inputs: Number(row.middleware_inputs),
      application: Number(row.application),
      system_configuration: Number(row.system_configuration),
      data_and_control_flow: Number(row.data_and_control_flow),
      use_case: Number(row.use_case),
    };
  }
  return values;
}

export async function getExpertConfigById(id: string): Promise<ExpertConfig | null> {
  const row = await queryOne<{ id: string; name: string }>(
    `SELECT id, name FROM parametric_expert_configs WHERE id = $1 AND is_active = true`, [id]
  );
  if (!row) return null;
  return { id: row.id, name: row.name, values: await loadExpertValues(row.id) };
}

export async function getDefaultExpertConfig(): Promise<ExpertConfig | null> {
  const row = await queryOne<{ id: string; name: string }>(
    `SELECT id, name FROM parametric_expert_configs
     WHERE is_active = true ORDER BY is_default DESC, created_at ASC LIMIT 1`
  );
  if (!row) return null;
  return { id: row.id, name: row.name, values: await loadExpertValues(row.id) };
}

export interface ResolvedParametricConfig {
  average: AverageConfig;
  expert: ExpertConfig;
}

/**
 * Resolves the Average + Expert Judgement master data to use for a calculation.
 * A project's explicitly mapped configuration wins; otherwise falls back to
 * whichever active configuration is flagged as the default.
 */
export async function resolveProjectParametricConfig(projectId?: string | null): Promise<ResolvedParametricConfig> {
  let averageId: string | null = null;
  let expertId: string | null = null;

  if (projectId) {
    const proj = await queryOne<{ parametric_average_config_id: string | null; parametric_expert_config_id: string | null }>(
      `SELECT parametric_average_config_id, parametric_expert_config_id FROM projects WHERE id = $1 AND deleted_at IS NULL`,
      [projectId]
    );
    averageId = proj?.parametric_average_config_id ?? null;
    expertId = proj?.parametric_expert_config_id ?? null;
  }

  const average = (averageId ? await getAverageConfigById(averageId) : null) ?? await getDefaultAverageConfig();
  const expert = (expertId ? await getExpertConfigById(expertId) : null) ?? await getDefaultExpertConfig();

  if (!average) throw new Error('No active Average Estimation master data configuration is available. Please contact an administrator.');
  if (!expert) throw new Error('No active Expert Judgement master data configuration is available. Please contact an administrator.');

  return { average, expert };
}

// ─── Calculation ────────────────────────────────────────────────────────────────

export function calculateParametric(
  inputs: ParametricInputs,
  average: AverageConfig,
  expert: ExpertConfig
): ParametricCalculationResult {
  const multiplier = 1 / inputs.team_efficiency;

  const breakdown: ParametricBreakdownField[] = PARAMETRIC_FIELDS.map((field) => {
    const size = inputs[field];
    return {
      field,
      label: FIELD_LABELS[field],
      size,
      detailed_value: expertValueFor(size, field, expert),
      average_value: averageValueFor(size, average),
    };
  });

  const detailedSum = breakdown.reduce((sum, b) => sum + b.detailed_value, 0);
  const averageSum = breakdown.reduce((sum, b) => sum + b.average_value, 0);

  const detailed_estimation = round2(multiplier * detailedSum);
  const average_estimation = round2(multiplier * averageSum);
  const final_estimation = Math.max(detailed_estimation, average_estimation);

  return {
    multiplier: round3(multiplier),
    detailed_estimation,
    average_estimation,
    final_estimation,
    final_basis: detailed_estimation >= average_estimation ? 'detailed' : 'average',
    breakdown,
    expert_config: { id: expert.id, name: expert.name, values: expert.values },
    average_config: { id: average.id, name: average.name, small: average.small, medium: average.medium, large: average.large },
  };
}
