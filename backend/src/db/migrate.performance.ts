import { PoolClient } from 'pg';

/**
 * Estimation Performance dashboard (EFA / ED / EBI / EEI).
 *
 * Current KPIs are calculated on the fly from the existing Historical Data SP (`estimations`) and
 * Historical Data PE (`parametric_estimations`) records, so no estimation data is copied here.
 *
 * kpi_historical_baselines
 *   The governed *pre-framework* reference used by EBI ("Historical Aggregate ED – without framework").
 *   Those estimates were never made in this platform, so they are captured as approved aggregate totals
 *   per Department (optionally per Program) and method. Entries are versioned: an edit deactivates the
 *   current row and inserts a new version (supersedes_id), so a past report can always be re-derived.
 *
 * kpi_snapshots
 *   Frozen copies of a calculated dashboard (filters + full result, incl. the baseline versions used) so a
 *   management report stays reproducible after records or baselines change.
 */
export const performanceMigration = `
CREATE TABLE IF NOT EXISTS kpi_historical_baselines (
  id                  UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  department_id       UUID          NOT NULL REFERENCES departments(id),
  program_id          UUID          REFERENCES projects(id),
  estimation_method   VARCHAR(3)    NOT NULL DEFAULT 'ALL' CHECK (estimation_method IN ('SP', 'PE', 'ALL')),
  label               VARCHAR(150)  NOT NULL,
  period_from         DATE,
  period_to           DATE,
  record_count        INT           NOT NULL CHECK (record_count > 0),
  total_estimated_pd  NUMERIC(12,2) NOT NULL CHECK (total_estimated_pd > 0),
  total_actual_pd     NUMERIC(12,2) NOT NULL CHECK (total_actual_pd >= 0),
  total_abs_error_pd  NUMERIC(12,2) NOT NULL CHECK (total_abs_error_pd >= 0),
  source_note         TEXT,
  version             INT           NOT NULL DEFAULT 1,
  supersedes_id       UUID          REFERENCES kpi_historical_baselines(id),
  is_active           BOOLEAN       NOT NULL DEFAULT true,
  created_by          UUID          REFERENCES users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_by          UUID          REFERENCES users(id) ON DELETE SET NULL,
  updated_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  -- Σ|E−A| can never be smaller than |ΣE − ΣA| (triangle inequality); small tolerance for rounding.
  CONSTRAINT chk_kpi_hb_abs_error CHECK (total_abs_error_pd + 0.05 >= ABS(total_estimated_pd - total_actual_pd)),
  CONSTRAINT chk_kpi_hb_period CHECK (period_from IS NULL OR period_to IS NULL OR period_from <= period_to)
);
-- One active baseline per Department / Program / method.
CREATE UNIQUE INDEX IF NOT EXISTS uq_kpi_hb_active_scope ON kpi_historical_baselines
  (department_id, COALESCE(program_id, '00000000-0000-0000-0000-000000000000'::uuid), estimation_method)
  WHERE is_active;

CREATE TABLE IF NOT EXISTS kpi_snapshots (
  id          UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  label       VARCHAR(150)  NOT NULL,
  filters     JSONB         NOT NULL,
  result      JSONB         NOT NULL,
  created_by  UUID          REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_kpi_snapshots_created ON kpi_snapshots(created_at DESC);
`;

export async function runPerformanceMigration(client: PoolClient): Promise<void> {
  await client.query(performanceMigration);
}
