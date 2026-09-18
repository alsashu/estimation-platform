import { Request, Response } from 'express';
import { z } from 'zod';
import { query, queryOne } from '../config/database';
import { auditLog } from '../services/audit.service';

const sizeValuesSchema = z.object({
  middleware_inputs: z.number().min(0),
  application: z.number().min(0),
  system_configuration: z.number().min(0),
  data_and_control_flow: z.number().min(0),
  use_case: z.number().min(0),
});

// ─── Average Estimation configs ────────────────────────────────────────────────

export async function getAllAverageConfigs(_req: Request, res: Response): Promise<void> {
  const data = await query(
    `SELECT ac.*,
            COUNT(p.id)::int AS project_count
     FROM parametric_average_configs ac
     LEFT JOIN projects p ON p.parametric_average_config_id = ac.id AND p.deleted_at IS NULL
     GROUP BY ac.id
     ORDER BY ac.is_default DESC, ac.name`
  );
  res.json({ success: true, data });
}

const averageCreateSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  small: z.number().min(0),
  medium: z.number().min(0),
  large: z.number().min(0),
});

export async function createAverageConfig(req: Request, res: Response): Promise<void> {
  const body = averageCreateSchema.parse(req.body);
  const exists = await queryOne(`SELECT id FROM parametric_average_configs WHERE name = $1`, [body.name]);
  if (exists) { res.status(409).json({ success: false, error: 'A configuration with this name already exists' }); return; }

  const [row] = await query(
    `INSERT INTO parametric_average_configs (name, description, small, medium, large, created_by)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [body.name, body.description ?? null, body.small, body.medium, body.large, req.user?.userId ?? null]
  );
  await auditLog({ entity: 'parametric_average_config', entityId: (row as { id: string }).id, action: 'created', newValue: body, user: req.user, req });
  res.status(201).json({ success: true, data: row });
}

const averageUpdateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().optional(),
  small: z.number().min(0).optional(),
  medium: z.number().min(0).optional(),
  large: z.number().min(0).optional(),
  is_active: z.boolean().optional(),
});

export async function updateAverageConfig(req: Request, res: Response): Promise<void> {
  const body = averageUpdateSchema.parse(req.body);
  const existing = await queryOne(`SELECT * FROM parametric_average_configs WHERE id = $1`, [req.params.id]);
  if (!existing) { res.status(404).json({ success: false, error: 'Configuration not found' }); return; }

  if (body.is_active === false && (existing as { is_default: boolean }).is_default) {
    res.status(400).json({ success: false, error: 'Cannot deactivate the default configuration. Set another configuration as default first.' });
    return;
  }

  const row = await queryOne(
    `UPDATE parametric_average_configs SET
       name=COALESCE($1,name), description=COALESCE($2,description),
       small=COALESCE($3,small), medium=COALESCE($4,medium), large=COALESCE($5,large),
       is_active=COALESCE($6,is_active), updated_by=$7
     WHERE id=$8 RETURNING *`,
    [body.name ?? null, body.description ?? null, body.small ?? null, body.medium ?? null, body.large ?? null,
     body.is_active ?? null, req.user?.userId ?? null, req.params.id]
  );
  await auditLog({ entity: 'parametric_average_config', entityId: req.params.id, action: 'updated', previousValue: existing, newValue: body, user: req.user, req });
  res.json({ success: true, data: row });
}

export async function setDefaultAverageConfig(req: Request, res: Response): Promise<void> {
  const existing = await queryOne<{ id: string; is_active: boolean }>(`SELECT id, is_active FROM parametric_average_configs WHERE id = $1`, [req.params.id]);
  if (!existing) { res.status(404).json({ success: false, error: 'Configuration not found' }); return; }
  if (!existing.is_active) { res.status(400).json({ success: false, error: 'Cannot make an inactive configuration the default' }); return; }

  await query(`UPDATE parametric_average_configs SET is_default = (id = $1), updated_by = $2`, [req.params.id, req.user?.userId ?? null]);
  await auditLog({ entity: 'parametric_average_config', entityId: req.params.id, action: 'set_default', user: req.user, req });
  res.json({ success: true, message: 'Default configuration updated' });
}

export async function deleteAverageConfig(req: Request, res: Response): Promise<void> {
  const existing = await queryOne<{ id: string; is_default: boolean }>(`SELECT id, is_default FROM parametric_average_configs WHERE id = $1`, [req.params.id]);
  if (!existing) { res.status(404).json({ success: false, error: 'Configuration not found' }); return; }
  if (existing.is_default) { res.status(400).json({ success: false, error: 'Cannot delete the default configuration. Set another configuration as default first.' }); return; }

  const countRow = await queryOne<{ count: string }>(`SELECT COUNT(*) as count FROM parametric_average_configs`);
  if (parseInt(countRow?.count ?? '0') <= 1) {
    res.status(400).json({ success: false, error: 'At least one Average Estimation configuration must remain' });
    return;
  }

  await query(`DELETE FROM parametric_average_configs WHERE id = $1`, [req.params.id]);
  await auditLog({ entity: 'parametric_average_config', entityId: req.params.id, action: 'deleted', user: req.user, req });
  res.json({ success: true, message: 'Configuration deleted' });
}

// ─── Expert Judgement configs ───────────────────────────────────────────────────

interface ExpertValueRow {
  size: 'Small' | 'Medium' | 'Large';
  middleware_inputs: number; application: number; system_configuration: number;
  data_and_control_flow: number; use_case: number;
}

async function attachValues<T extends { id: string }>(configs: T[]): Promise<(T & { values: Record<string, unknown> })[]> {
  if (configs.length === 0) return [];
  const ids = configs.map(c => c.id);
  const rows = await query<ExpertValueRow & { config_id: string }>(
    `SELECT config_id, size, middleware_inputs, application, system_configuration, data_and_control_flow, use_case
     FROM parametric_expert_values WHERE config_id = ANY($1::uuid[])`,
    [ids]
  );
  return configs.map(c => {
    const values: Record<string, unknown> = {};
    for (const r of rows.filter(r => r.config_id === c.id)) {
      values[r.size] = {
        middleware_inputs: Number(r.middleware_inputs), application: Number(r.application),
        system_configuration: Number(r.system_configuration), data_and_control_flow: Number(r.data_and_control_flow),
        use_case: Number(r.use_case),
      };
    }
    return { ...c, values };
  });
}

export async function getAllExpertConfigs(_req: Request, res: Response): Promise<void> {
  const configs = await query<{ id: string }>(
    `SELECT ec.*,
            COUNT(p.id)::int AS project_count
     FROM parametric_expert_configs ec
     LEFT JOIN projects p ON p.parametric_expert_config_id = ec.id AND p.deleted_at IS NULL
     GROUP BY ec.id
     ORDER BY ec.is_default DESC, ec.name`
  );
  res.json({ success: true, data: await attachValues(configs) });
}

export async function getExpertConfig(req: Request, res: Response): Promise<void> {
  const config = await queryOne<{ id: string }>(`SELECT * FROM parametric_expert_configs WHERE id = $1`, [req.params.id]);
  if (!config) { res.status(404).json({ success: false, error: 'Configuration not found' }); return; }
  const [withValues] = await attachValues([config]);
  res.json({ success: true, data: withValues });
}

const expertCreateSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  values: z.object({ Small: sizeValuesSchema, Medium: sizeValuesSchema, Large: sizeValuesSchema }),
});

export async function createExpertConfig(req: Request, res: Response): Promise<void> {
  const body = expertCreateSchema.parse(req.body);
  const exists = await queryOne(`SELECT id FROM parametric_expert_configs WHERE name = $1`, [body.name]);
  if (exists) { res.status(409).json({ success: false, error: 'A configuration with this name already exists' }); return; }

  const [config] = await query<{ id: string }>(
    `INSERT INTO parametric_expert_configs (name, description, created_by) VALUES ($1,$2,$3) RETURNING *`,
    [body.name, body.description ?? null, req.user?.userId ?? null]
  );

  for (const size of ['Small', 'Medium', 'Large'] as const) {
    const v = body.values[size];
    await query(
      `INSERT INTO parametric_expert_values
         (config_id, size, middleware_inputs, application, system_configuration, data_and_control_flow, use_case)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [config.id, size, v.middleware_inputs, v.application, v.system_configuration, v.data_and_control_flow, v.use_case]
    );
  }

  await auditLog({ entity: 'parametric_expert_config', entityId: config.id, action: 'created', newValue: body, user: req.user, req });
  const [withValues] = await attachValues([config]);
  res.status(201).json({ success: true, data: withValues });
}

const expertUpdateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().optional(),
  is_active: z.boolean().optional(),
  values: z.object({ Small: sizeValuesSchema, Medium: sizeValuesSchema, Large: sizeValuesSchema }).optional(),
});

export async function updateExpertConfig(req: Request, res: Response): Promise<void> {
  const body = expertUpdateSchema.parse(req.body);
  const existing = await queryOne<{ id: string; is_default: boolean }>(`SELECT * FROM parametric_expert_configs WHERE id = $1`, [req.params.id]);
  if (!existing) { res.status(404).json({ success: false, error: 'Configuration not found' }); return; }

  if (body.is_active === false && existing.is_default) {
    res.status(400).json({ success: false, error: 'Cannot deactivate the default configuration. Set another configuration as default first.' });
    return;
  }

  const [config] = await query(
    `UPDATE parametric_expert_configs SET
       name=COALESCE($1,name), description=COALESCE($2,description),
       is_active=COALESCE($3,is_active), updated_by=$4
     WHERE id=$5 RETURNING *`,
    [body.name ?? null, body.description ?? null, body.is_active ?? null, req.user?.userId ?? null, req.params.id]
  );

  if (body.values) {
    for (const size of ['Small', 'Medium', 'Large'] as const) {
      const v = body.values[size];
      await query(
        `UPDATE parametric_expert_values SET
           middleware_inputs=$1, application=$2, system_configuration=$3, data_and_control_flow=$4, use_case=$5
         WHERE config_id=$6 AND size=$7`,
        [v.middleware_inputs, v.application, v.system_configuration, v.data_and_control_flow, v.use_case, req.params.id, size]
      );
    }
  }

  await auditLog({ entity: 'parametric_expert_config', entityId: req.params.id, action: 'updated', previousValue: existing, newValue: body, user: req.user, req });
  const [withValues] = await attachValues([config as { id: string }]);
  res.json({ success: true, data: withValues });
}

export async function setDefaultExpertConfig(req: Request, res: Response): Promise<void> {
  const existing = await queryOne<{ id: string; is_active: boolean }>(`SELECT id, is_active FROM parametric_expert_configs WHERE id = $1`, [req.params.id]);
  if (!existing) { res.status(404).json({ success: false, error: 'Configuration not found' }); return; }
  if (!existing.is_active) { res.status(400).json({ success: false, error: 'Cannot make an inactive configuration the default' }); return; }

  await query(`UPDATE parametric_expert_configs SET is_default = (id = $1), updated_by = $2`, [req.params.id, req.user?.userId ?? null]);
  await auditLog({ entity: 'parametric_expert_config', entityId: req.params.id, action: 'set_default', user: req.user, req });
  res.json({ success: true, message: 'Default configuration updated' });
}

export async function deleteExpertConfig(req: Request, res: Response): Promise<void> {
  const existing = await queryOne<{ id: string; is_default: boolean }>(`SELECT id, is_default FROM parametric_expert_configs WHERE id = $1`, [req.params.id]);
  if (!existing) { res.status(404).json({ success: false, error: 'Configuration not found' }); return; }
  if (existing.is_default) { res.status(400).json({ success: false, error: 'Cannot delete the default configuration. Set another configuration as default first.' }); return; }

  const countRow = await queryOne<{ count: string }>(`SELECT COUNT(*) as count FROM parametric_expert_configs`);
  if (parseInt(countRow?.count ?? '0') <= 1) {
    res.status(400).json({ success: false, error: 'At least one Expert Judgement configuration must remain' });
    return;
  }

  await query(`DELETE FROM parametric_expert_configs WHERE id = $1`, [req.params.id]);
  await auditLog({ entity: 'parametric_expert_config', entityId: req.params.id, action: 'deleted', user: req.user, req });
  res.json({ success: true, message: 'Configuration deleted' });
}

// ─── Project → Parametric configuration mapping ─────────────────────────────────

const projectMappingSchema = z.object({
  parametric_average_config_id: z.string().uuid().nullable().optional(),
  parametric_expert_config_id: z.string().uuid().nullable().optional(),
});

export async function setProjectParametricConfig(req: Request, res: Response): Promise<void> {
  if (!req.user) { res.status(401).json({ success: false, error: 'Not authenticated' }); return; }

  const body = projectMappingSchema.parse(req.body);
  const project = await queryOne(`SELECT id FROM projects WHERE id = $1 AND deleted_at IS NULL`, [req.params.id]);
  if (!project) { res.status(404).json({ success: false, error: 'Project not found' }); return; }

  if (body.parametric_average_config_id) {
    const cfg = await queryOne(`SELECT id FROM parametric_average_configs WHERE id = $1 AND is_active = true`, [body.parametric_average_config_id]);
    if (!cfg) { res.status(400).json({ success: false, error: 'Invalid or inactive Average Estimation configuration' }); return; }
  }
  if (body.parametric_expert_config_id) {
    const cfg = await queryOne(`SELECT id FROM parametric_expert_configs WHERE id = $1 AND is_active = true`, [body.parametric_expert_config_id]);
    if (!cfg) { res.status(400).json({ success: false, error: 'Invalid or inactive Expert Judgement configuration' }); return; }
  }

  // Only touch a column if the caller explicitly included it in the payload —
  // this lets `null` clear a mapping (fall back to the default config) while
  // an absent key leaves the existing mapping untouched.
  const setAverage = 'parametric_average_config_id' in req.body;
  const setExpert = 'parametric_expert_config_id' in req.body;

  const row = await queryOne(
    `UPDATE projects SET
       parametric_average_config_id = CASE WHEN $1 THEN $2::uuid ELSE parametric_average_config_id END,
       parametric_expert_config_id  = CASE WHEN $3 THEN $4::uuid ELSE parametric_expert_config_id END,
       updated_by = $5
     WHERE id = $6 RETURNING id, name, parametric_average_config_id, parametric_expert_config_id`,
    [setAverage, body.parametric_average_config_id ?? null, setExpert, body.parametric_expert_config_id ?? null, req.user.userId, req.params.id]
  );

  await auditLog({ entity: 'project', entityId: req.params.id, action: 'parametric_config_mapped', newValue: body, user: req.user, req });
  res.json({ success: true, data: row });
}
