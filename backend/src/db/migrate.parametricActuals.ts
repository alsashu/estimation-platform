import { PoolClient } from 'pg';

/**
 * Parametric Estimation — Estimated & Actual effort tracking (idempotent).
 *
 * • `final_estimation` stays the Estimated PersonDays and is never written by the actuals flow.
 * • Actuals are stored in PersonDays with the derived metrics, notes and who/when audit columns.
 *   Every record / correction also writes an `audit_logs` row with the previous and new values.
 * • Derived metrics are recomputed for rows that already have actuals so that every environment
 *   uses the PE convention Variance = Estimated − Actual (earlier builds stored Actual − Estimated).
 *   Re-running is harmless because the values are pure functions of final_estimation/actual_days.
 */
export const parametricActualsMigration = `
ALTER TABLE parametric_estimations ADD COLUMN IF NOT EXISTS deviation_percent   DECIMAL(8,2);
ALTER TABLE parametric_estimations ADD COLUMN IF NOT EXISTS actual_notes        TEXT;
ALTER TABLE parametric_estimations ADD COLUMN IF NOT EXISTS actuals_recorded_by UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE parametric_estimations ADD COLUMN IF NOT EXISTS actuals_recorded_at TIMESTAMPTZ;
ALTER TABLE parametric_estimations ADD COLUMN IF NOT EXISTS actuals_updated_by  UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE parametric_estimations ADD COLUMN IF NOT EXISTS actuals_updated_at  TIMESTAMPTZ;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_pe_actual_days_positive') THEN
    ALTER TABLE parametric_estimations
      ADD CONSTRAINT chk_pe_actual_days_positive CHECK (actual_days IS NULL OR actual_days > 0);
  END IF;
END $$;

UPDATE parametric_estimations
   SET variance_days     = ROUND(final_estimation - actual_days, 2),
       deviation_percent = CASE WHEN final_estimation > 0
                                THEN ROUND(ABS(final_estimation - actual_days) / final_estimation * 100, 2) END,
       accuracy_percent  = CASE WHEN final_estimation > 0
                                THEN GREATEST(0, ROUND(100 - ABS(final_estimation - actual_days) / final_estimation * 100, 2)) END,
       actuals_recorded_at = COALESCE(actuals_recorded_at, completed_at, updated_at)
 WHERE actual_days IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pe_status ON parametric_estimations (status);
`;

export async function runParametricActualsMigration(client: PoolClient): Promise<void> {
  console.log('🔧  Running parametric actuals migration...');
  await client.query('BEGIN');
  try {
    await client.query(parametricActualsMigration);
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  }
  console.log('✅  Parametric actuals migration complete.');
}
