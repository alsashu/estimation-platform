import { PoolClient } from 'pg';

// ─── Default Average Estimation config ─────────────────────────────────────
const AVERAGE_CONFIGS = [
  { name: 'Standard', description: 'Default Average Estimation values', small: 12, medium: 22, large: 32.5, isDefault: true },
];

// ─── Default Expert Judgement configs (from parametric-estimation.md) ──────
const EXPERT_CONFIGS = [
  {
    name: 'ASW',
    description: 'Expert Judgement values for ASW-type projects',
    isDefault: true,
    values: {
      Small:  { middlewareInputs: 10, application: 20, systemConfiguration: 0, dataAndControlFlow: 10, useCase: 10 },
      Medium: { middlewareInputs: 20, application: 35, systemConfiguration: 0, dataAndControlFlow: 30, useCase: 15 },
      Large:  { middlewareInputs: 30, application: 50, systemConfiguration: 0, dataAndControlFlow: 40, useCase: 20 },
    },
  },
  {
    name: 'CAA',
    description: 'Expert Judgement values for CAA-type projects',
    isDefault: false,
    values: {
      Small:  { middlewareInputs: 0, application: 10, systemConfiguration: 5,  dataAndControlFlow: 0, useCase: 10 },
      Medium: { middlewareInputs: 0, application: 30, systemConfiguration: 10, dataAndControlFlow: 0, useCase: 15 },
      Large:  { middlewareInputs: 0, application: 50, systemConfiguration: 20, dataAndControlFlow: 0, useCase: 20 },
    },
  },
];

export async function seedParametricData(client: PoolClient): Promise<void> {
  console.log('🌱  Seeding parametric estimation master data...');

  for (const cfg of AVERAGE_CONFIGS) {
    const existing = await client.query(`SELECT id FROM parametric_average_configs WHERE name = $1`, [cfg.name]);
    if (existing.rows[0]) continue;
    await client.query(
      `INSERT INTO parametric_average_configs (name, description, small, medium, large, is_default, is_active)
       VALUES ($1,$2,$3,$4,$5,$6,true)`,
      [cfg.name, cfg.description, cfg.small, cfg.medium, cfg.large, cfg.isDefault]
    );
  }

  for (const cfg of EXPERT_CONFIGS) {
    const existing = await client.query(`SELECT id FROM parametric_expert_configs WHERE name = $1`, [cfg.name]);
    if (existing.rows[0]) continue;

    const result = await client.query(
      `INSERT INTO parametric_expert_configs (name, description, is_default, is_active)
       VALUES ($1,$2,$3,true) RETURNING id`,
      [cfg.name, cfg.description, cfg.isDefault]
    );
    const configId: string = result.rows[0].id;

    for (const [size, v] of Object.entries(cfg.values)) {
      await client.query(
        `INSERT INTO parametric_expert_values
           (config_id, size, middleware_inputs, application, system_configuration, data_and_control_flow, use_case)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [configId, size, v.middlewareInputs, v.application, v.systemConfiguration, v.dataAndControlFlow, v.useCase]
      );
    }
  }

  console.log('✅  Parametric estimation master data seeded.');
}
