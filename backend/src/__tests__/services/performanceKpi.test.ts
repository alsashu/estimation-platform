import {
  aggregate, breakdown, bucketStart, calculateKpis, classify, distribution, historicalAggregate, isFrameworkAligned,
  kpiStatus, localDate, matchHistorical, resolveSettings, signedEd, trend, DEFAULT_KPI_SETTINGS,
  type HistoricalBaseline, type Method, type PerfRecord,
} from '../../services/performanceKpi';

let seq = 0;
function rec(est: number, act: number, o: Partial<PerfRecord> = {}): PerfRecord {
  seq++;
  return {
    method: 'SP', id: `r${seq}`, title: `Task ${seq}`,
    department_id: 'D1', department_name: 'Dept 1', program_id: 'P1', program_name: 'Program 1',
    baseline_id: 'B1', baseline_name: 'Baseline 1',
    estimated_pd: est, actual_pd: act, framework_aligned: true,
    completed_at: '2026-10-10T10:00:00.000Z', source: 'Historical Data SP',
    ...o,
  };
}
function hb(o: Partial<HistoricalBaseline> & { ed: number; est?: number }): HistoricalBaseline {
  const est = o.est ?? 100;
  seq++;
  return {
    id: `h${seq}`, version: 1, label: `HB ${seq}`, department_id: 'D1', program_id: 'P1', estimation_method: 'ALL',
    record_count: 10, total_estimated_pd: est, total_actual_pd: est, total_abs_error_pd: (o.ed / 100) * est,
    ...o,
  };
}
const BOTH: Method[] = ['SP', 'PE'];
const opts = { programLevelOnly: false, methods: BOTH };
const close = (v: number | null, expected: number, dp = 6) => { expect(v).not.toBeNull(); expect(v!).toBeCloseTo(expected, dp); };

describe('ED — Estimation Deviation (signed)', () => {
  it('positive deviation = overestimation', () => {
    close(signedEd(100, 90), 10);
    expect(classify(10, 5)).toBe('over');
  });
  it('negative deviation = underestimation (spec example: 90 vs 100 → −11.11 %)', () => {
    close(signedEd(90, 100), -11.111111, 4);
    expect(classify(signedEd(90, 100)!, 5)).toBe('under');
  });
  it('zero deviation = accurate', () => {
    expect(signedEd(50, 50)).toBe(0);
    expect(classify(0, 0)).toBe('on_target');
  });
  it('within tolerance counts as on target, either sign', () => {
    expect(classify(4.99, 5)).toBe('on_target');
    expect(classify(-5, 5)).toBe('on_target');
    expect(classify(-5.01, 5)).toBe('under');
  });
  it('is undefined (null, not 0) for a non-positive estimate', () => {
    expect(signedEd(0, 10)).toBeNull();
  });
  it('aggregate ED counts under / over / on-target tasks and their effort', () => {
    const k = calculateKpis([rec(90, 100), rec(100, 80), rec(100, 102), rec(50, 50)], [], opts);
    expect(k.ed.under_count).toBe(1);
    expect(k.ed.over_count).toBe(1);
    expect(k.ed.on_target_count).toBe(2);
    close(k.ed.under_pct, 25);
    close(k.ed.under_effort_pd, 10);
    close(k.ed.over_effort_pd, 20);
    // signed overall: (340 − 332) / 340
    close(k.ed.value, (8 / 340) * 100);
  });
});

describe('Aggregate ED uses absolute error (errors never cancel)', () => {
  it('+10 and −10 do not net to zero', () => {
    const a = aggregate([rec(100, 90), rec(100, 110)]);
    expect(a.signed_ed).toBe(0);
    close(a.aggregate_ed, 10);
  });
  it('is null when total estimate is zero (no eligible records)', () => {
    expect(aggregate([]).aggregate_ed).toBeNull();
  });
});

describe('EFA — Estimation Framework Accuracy', () => {
  it('spec example: Framework Aggregate ED 12 % → EFA 88 %', () => {
    const k = calculateKpis([rec(500, 560), rec(500, 440)], [], opts); // |60|+|60| / 1000 = 12 %
    close(k.efa.framework_aggregate_ed, 12);
    close(k.efa.value, 88);
  });
  it('multiple records are effort-weighted, not averaged', () => {
    // small task 100 % off, big task exact: weighted ED = 10/110, not the 50 % simple mean
    const k = calculateKpis([rec(10, 20), rec(100, 100)], [], opts);
    close(k.efa.framework_aggregate_ed, (10 / 110) * 100);
  });
  it('uses only framework-aligned records; EEI uses all eligible records', () => {
    const k = calculateKpis([rec(100, 100), rec(100, 150, { framework_aligned: false })], [], opts);
    close(k.efa.value, 100);
    close(k.eei.value, 75); // 50 / 200
    expect(k.framework.excluded_overrides).toBe(1);
  });
  it('aggregates across programs and departments', () => {
    const recs = [rec(100, 110, { program_id: 'P1' }), rec(200, 180, { program_id: 'P2', department_id: 'D2' })];
    close(calculateKpis(recs, [], opts).efa.value, 100 - (30 / 300) * 100);
  });
  it('is N/A (null) with no eligible records, never 0', () => {
    const k = calculateKpis([], [], opts);
    expect(k.efa.value).toBeNull();
    expect(k.efa.status).toBe('na');
  });
});

describe('framework alignment', () => {
  it('SP estimate inside the calibrated range or absent → aligned', () => {
    expect(isFrameworkAligned('SP', 300, 256.8, 513.6)).toBe(true);
    expect(isFrameworkAligned('SP', null, 8.16, 16.32)).toBe(true);
  });
  it('SP estimate overridden outside the range → not aligned', () => {
    expect(isFrameworkAligned('SP', 18, 8.16, 16.32)).toBe(false);
  });
  it('PE final estimation is always the engine output', () => {
    expect(isFrameworkAligned('PE', 999, null, null)).toBe(true);
  });
});

describe('EEI — Estimation Effectiveness Index', () => {
  it('Aggregate ED = Σ|E−A| / ΣE and EEI = 100 − Aggregate ED', () => {
    // ΣE = 1240, Σ|E−A| = 360 → 29.03 % → 70.97 %
    const k = calculateKpis([rec(1000, 1300), rec(240, 180)], [], opts);
    close(k.eligible.total_abs_error_pd, 360);
    close(k.eei.aggregate_ed, (360 / 1240) * 100);
    close(k.eei.value, 100 - (360 / 1240) * 100);
    expect(k.eei.value!.toFixed(2)).toBe('70.97');
  });
  it('department level aggregates every program', () => {
    const recs = [rec(100, 120, { program_id: 'P1' }), rec(100, 90, { program_id: 'P2' }), rec(50, 50, { program_id: 'P3' })];
    close(calculateKpis(recs, [], opts).eei.value, 100 - (30 / 250) * 100);
  });
  it('can go below zero — results are never capped', () => {
    close(calculateKpis([rec(10, 40)], [], opts).eei.value, -200);
  });
  it('zero estimated effort → N/A', () => {
    expect(aggregate([{ estimated_pd: 0, actual_pd: 5 }]).aggregate_ed).toBeNull();
  });
});

describe('EBI — Estimation Benefit Index', () => {
  const current = [rec(500, 560), rec(500, 440)]; // current ED 12 %

  it('spec example: historical 20 %, current 12 % → 40 %', () => {
    const k = calculateKpis(current, [hb({ ed: 20 })], opts);
    close(k.ebi.historical_ed, 20);
    close(k.ebi.current_ed, 12);
    close(k.ebi.value, 40);
    close(k.ebi.reduction, 8);
  });
  it('historical lower than current → negative EBI (deterioration), not capped', () => {
    close(calculateKpis(current, [hb({ ed: 6 })], opts).ebi.value, -100);
  });
  it('historical equal to current → 0 %', () => {
    close(calculateKpis(current, [hb({ ed: 12 })], opts).ebi.value, 0);
  });
  it('historical ED zero → N/A (zero denominator), distinct from 0', () => {
    const k = calculateKpis(current, [hb({ ed: 0 })], opts);
    expect(k.ebi.value).toBeNull();
    expect(k.ebi.na_reason).toBe('historical_ed_zero');
  });
  it('no historical baseline → N/A', () => {
    const k = calculateKpis(current, [], opts);
    expect(k.ebi.value).toBeNull();
    expect(k.ebi.na_reason).toBe('no_historical_baseline');
    expect(k.ebi.missing_scope).toHaveLength(1);
  });
  it('current side uses framework (calibrated) records only; historical side is the pre-framework baseline', () => {
    const recs = [...current, rec(100, 300, { framework_aligned: false })];
    const k = calculateKpis(recs, [hb({ ed: 20 })], opts);
    close(k.ebi.current_ed, 12);          // override excluded from "with framework"
    close(k.ebi.historical_ed, 20);       // only the governed baseline, never platform records
    expect(k.ebi.historical.record_count).toBe(10);
  });
  it('historical entries without current records in the period are left out (comparable scope)', () => {
    const k = calculateKpis(current, [hb({ ed: 20 }), hb({ ed: 50, program_id: 'P9' })], opts);
    close(k.ebi.historical_ed, 20);
    expect(k.ebi.unmatched_baselines.map(b => b.program_id)).toEqual(['P9']);
  });
  it('N/A when there are no current framework records', () => {
    expect(calculateKpis([], [hb({ ed: 20 })], opts).ebi.na_reason).toBe('no_current_records');
  });
});

describe('historical scope matching', () => {
  it('program-level entries win over the department-level entry (no double counting)', () => {
    const recs = [rec(100, 100, { program_id: 'P1' }), rec(100, 100, { program_id: 'P2' })];
    const s = matchHistorical(recs, [hb({ ed: 10, program_id: null }), hb({ ed: 20, program_id: 'P1' })], opts);
    expect(s.entries.map(e => e.program_id)).toEqual(['P1']);
    expect(s.comparable).toHaveLength(1);
    expect(s.missing.map(m => m.program_id)).toEqual(['P2']);
  });
  it('department-level entry covers the whole department when no program entries exist', () => {
    const recs = [rec(100, 100, { program_id: 'P1' }), rec(100, 100, { program_id: 'P2' })];
    const s = matchHistorical(recs, [hb({ ed: 10, program_id: null })], opts);
    expect(s.comparable).toHaveLength(2);
  });
  it('a Program filter ignores department-level entries', () => {
    const s = matchHistorical([rec(100, 100)], [hb({ ed: 10, program_id: null })], { programLevelOnly: true, methods: BOTH });
    expect(s.entries).toHaveLength(0);
  });
  it('method-specific entries only cover their method; ALL covers both', () => {
    const recs = [rec(100, 100, { method: 'SP' }), rec(100, 100, { method: 'PE' })];
    const sOnly = matchHistorical(recs, [hb({ ed: 10, estimation_method: 'SP' })], opts);
    expect(sOnly.comparable.map(r => r.method)).toEqual(['SP']);
    expect(sOnly.missing.map(m => m.method)).toEqual(['PE']);
    const all = matchHistorical(recs, [hb({ ed: 10, estimation_method: 'ALL' }), hb({ ed: 30, estimation_method: 'SP' })], opts);
    expect(all.entries.map(e => e.estimation_method)).toEqual(['ALL']);
  });
  it('SP-only reporting prefers the SP entry over ALL', () => {
    const s = matchHistorical([rec(100, 100)], [hb({ ed: 10, estimation_method: 'ALL' }), hb({ ed: 30, estimation_method: 'SP' })], { programLevelOnly: false, methods: ['SP'] });
    expect(s.entries.map(e => e.estimation_method)).toEqual(['SP']);
  });
  it('historicalAggregate is effort weighted', () => {
    const h = historicalAggregate([hb({ ed: 10, est: 100 }), hb({ ed: 30, est: 300 })]);
    close(h.aggregate_ed, 25);
  });
});

describe('method reporting', () => {
  const recs = [rec(10, 12, { method: 'SP' }), rec(100, 90, { method: 'PE' })];
  it('combined reporting adds PersonDays from both methods', () => {
    const k = calculateKpis(recs, [], opts);
    close(k.eligible.total_estimated_pd, 110);
    close(k.by_method.SP.total_estimated_pd, 10);
    close(k.by_method.PE.total_estimated_pd, 100);
  });
});

describe('breakdown', () => {
  const recs = [
    rec(100, 120, { program_id: 'P1', program_name: 'Alpha' }),
    rec(100, 90, { program_id: 'P2', program_name: 'Beta' }),
    rec(50, 50, { program_id: 'P2', program_name: 'Beta', baseline_id: 'B2', baseline_name: 'B-two' }),
  ];
  it('per program, with program-level EBI', () => {
    const rows = breakdown(recs, [hb({ ed: 40, program_id: 'P1' })], 'program', opts);
    expect(rows.map(r => r.name)).toEqual(['Alpha', 'Beta']);
    close(rows[0].ed, -20);
    close(rows[0].ebi, 50);           // (40 − 20) / 40
    expect(rows[1].ebi).toBeNull();
    expect(rows[1].ebi_na_reason).toBe('no_historical_baseline');
    close(rows[1].efa, 100 - (10 / 150) * 100);
  });
  it('per department / baseline / task', () => {
    expect(breakdown(recs, [], 'department', opts)).toHaveLength(1);
    const bl = breakdown(recs, [], 'baseline', opts);
    expect(bl.map(r => r.name)).toEqual(['B-two', 'Baseline 1']);
    expect(bl[0].ebi_na_reason).toBe('not_tracked_at_level');
    expect(breakdown(recs, [], 'task', opts)).toHaveLength(3);
  });
});

describe('distribution, trend, status, settings', () => {
  it('histogram buckets by |ED|', () => {
    const d = distribution([rec(100, 100), rec(100, 104), rec(100, 92), rec(100, 115), rec(100, 160)], [5, 10, 20, 30]);
    expect(d.map(b => b.count)).toEqual([2, 1, 1, 0, 1]);
    expect(d[4].label).toBe('> 30%');
    close(d[0].pct, 40);
  });
  it('trend buckets by local completion date and leaves empty periods null', () => {
    const recs = [
      rec(100, 90, { completed_at: '2026-09-30T20:00:00.000Z' }), // 1 Oct in Asia/Kolkata
      rec(100, 100, { completed_at: '2026-11-02T08:00:00.000Z', framework_aligned: false }),
    ];
    const t = trend(recs, '2026-09-01', '2026-11-14', 'Asia/Kolkata', 'month');
    expect(t.map(p => p.period)).toEqual(['2026-09-01', '2026-10-01', '2026-11-01']);
    expect(t[0].efa).toBeNull();
    close(t[1].efa, 90);
    expect(t[2].efa).toBeNull();     // only an override that month
    close(t[2].eei, 100);
    expect(localDate('2026-09-30T20:00:00.000Z', 'UTC')).toBe('2026-09-30');
    expect(bucketStart('2026-11-14', 'week')).toBe('2026-11-09');
  });
  it('status thresholds (ED by magnitude)', () => {
    const s = DEFAULT_KPI_SETTINGS;
    expect(kpiStatus('efa', 95, s)).toBe('good');
    expect(kpiStatus('efa', 85, s)).toBe('warning');
    expect(kpiStatus('efa', 50, s)).toBe('critical');
    expect(kpiStatus('ed', -8, s)).toBe('good');
    expect(kpiStatus('ed', -25, s)).toBe('critical');
    expect(kpiStatus('ebi', null, s)).toBe('na');
  });
  it('settings fall back to defaults for malformed values', () => {
    const s = resolveSettings({ on_target_tolerance: 'x', distribution_bounds: [20, 10], thresholds: { efa: { good: 95 } } });
    expect(s.on_target_tolerance).toBe(5);
    expect(s.distribution_bounds).toEqual([10, 20]);
    expect(s.thresholds.efa).toEqual({ good: 95, warning: 80 });
  });
});
