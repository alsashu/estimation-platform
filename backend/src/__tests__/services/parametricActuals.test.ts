import { computeActualMetrics } from '../../services/parametricActuals';

describe('computeActualMetrics (PE, PersonDays)', () => {
  it('finished under estimate → positive variance', () => {
    // Estimated 10, Actual 8: variance 2, deviation 20 %, accuracy 80 %
    expect(computeActualMetrics(10, 8)).toEqual({ variance_days: 2, accuracy_percent: 80, deviation_percent: 20 });
  });

  it('finished over estimate → negative variance', () => {
    expect(computeActualMetrics(10, 12)).toEqual({ variance_days: -2, accuracy_percent: 80, deviation_percent: 20 });
  });

  it('exact match → 100 % accuracy, 0 deviation', () => {
    expect(computeActualMetrics(70, 70)).toEqual({ variance_days: 0, accuracy_percent: 100, deviation_percent: 0 });
  });

  it('floors accuracy at 0 when actual is more than double the estimate, deviation keeps the real size', () => {
    expect(computeActualMetrics(10, 35)).toEqual({ variance_days: -25, accuracy_percent: 0, deviation_percent: 250 });
  });

  it('rounds to 2 decimals', () => {
    const m = computeActualMetrics(3, 2);
    expect(m.variance_days).toBe(1);
    expect(m.deviation_percent).toBe(33.33);
    expect(m.accuracy_percent).toBe(66.67);
  });

  it('accepts numeric strings from the database (DECIMAL columns)', () => {
    expect(computeActualMetrics('12.5' as unknown as number, 10)).toEqual({ variance_days: 2.5, accuracy_percent: 80, deviation_percent: 20 });
  });

  it('zero estimate → no division by zero; accuracy/deviation unavailable', () => {
    expect(computeActualMetrics(0, 5)).toEqual({ variance_days: -5, accuracy_percent: null, deviation_percent: null });
  });

  it('missing estimate → accuracy/deviation unavailable', () => {
    expect(computeActualMetrics(null, 5)).toEqual({ variance_days: -5, accuracy_percent: null, deviation_percent: null });
    expect(computeActualMetrics(undefined, 5).accuracy_percent).toBeNull();
  });

  it('rejects non-positive or non-numeric actuals', () => {
    expect(() => computeActualMetrics(10, 0)).toThrow(RangeError);
    expect(() => computeActualMetrics(10, -1)).toThrow(RangeError);
    expect(() => computeActualMetrics(10, NaN)).toThrow(RangeError);
  });
});
