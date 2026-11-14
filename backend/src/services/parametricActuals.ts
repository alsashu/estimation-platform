/**
 * Estimated vs Actual metrics for Parametric Estimation (PersonDays).
 *
 *   Variance  = Estimated − Actual                       (positive = finished under estimate)
 *   Deviation = |Estimated − Actual| / Estimated × 100
 *   Accuracy  = (1 − |Estimated − Actual| / Estimated) × 100, floored at 0 (same floor as Storypoint)
 *
 * Accuracy and Deviation are undefined when there is no positive estimate, so they are returned as
 * `null` rather than dividing by zero. Variance is still meaningful and always returned.
 * The SP engine is untouched — this module only serves PE.
 */
export interface ActualMetrics {
  variance_days: number;
  accuracy_percent: number | null;
  deviation_percent: number | null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function computeActualMetrics(estimated: number | null | undefined, actual: number): ActualMetrics {
  if (!Number.isFinite(actual) || actual <= 0) throw new RangeError('Actual effort must be a number greater than 0');
  const est = estimated == null ? NaN : Number(estimated);
  if (!Number.isFinite(est)) {
    return { variance_days: round2(-actual), accuracy_percent: null, deviation_percent: null };
  }
  const variance = est - actual;
  if (est <= 0) return { variance_days: round2(variance), accuracy_percent: null, deviation_percent: null };
  const deviation = (Math.abs(variance) / est) * 100;
  return {
    variance_days: round2(variance),
    accuracy_percent: round2(Math.max(0, 100 - deviation)),
    deviation_percent: round2(deviation),
  };
}
