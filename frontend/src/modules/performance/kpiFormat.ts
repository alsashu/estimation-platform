/**
 * Pure helpers for the Estimation Performance dashboard: number formatting, KPI definitions, and the
 * step-by-step calculation explanations shown in the KPI tooltips. Every number comes from the backend
 * result — nothing is recalculated here except the display rounding.
 */
import type { EbiNaReason, KpiKey, KpiStatus, PerformanceDashboard, PerfMethod } from './types';

export const NA = 'N/A';

export function fmtPct(v: number | null | undefined, dp = 2, signed = false): string {
  if (v == null || !Number.isFinite(v)) return NA;
  const s = v.toFixed(dp);
  const clean = s === `-${(0).toFixed(dp)}` ? (0).toFixed(dp) : s; // never show "-0.00"
  return `${signed && v > 0 ? '+' : ''}${clean}%`;
}

export function fmtNum(v: number | null | undefined, dp = 2): string {
  if (v == null || !Number.isFinite(v)) return NA;
  return v.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

export const fmtPd = (v: number | null | undefined, dp = 2) => (v == null ? NA : `${fmtNum(v, dp)} PD`);

/** "+1.23 pp" — difference between two percentages. */
export function fmtPp(v: number | null | undefined, dp = 2): string {
  if (v == null || !Number.isFinite(v)) return NA;
  return `${v > 0 ? '+' : ''}${v.toFixed(dp)} pp`;
}

export interface KpiDefinition {
  key: KpiKey;
  short: string;
  name: string;
  caption: string;
  question: string;
  purpose: string;
  formula: string[];
  interpretation: string;
  /** For the trend arrow: is a higher number better? ED is judged by magnitude. */
  higherIsBetter: boolean | 'closer_to_zero';
}

export const KPI_DEFS: Record<KpiKey, KpiDefinition> = {
  efa: {
    key: 'efa', short: 'EFA', name: 'Estimation Framework Accuracy', caption: 'Framework accuracy',
    question: 'Is the estimation framework calibrated accurately?',
    purpose: 'Accuracy of the framework’s calibrated estimates against actual effort, on a common PersonDay basis.',
    formula: ['Framework Aggregate ED (%) = (Σ|Estimate − Actual| / ΣEstimate) × 100', 'EFA (%) = 100 − Framework Aggregate ED (%)'],
    interpretation: 'Higher is better. 100 − EFA is the effort-weighted absolute deviation of framework estimates.',
    higherIsBetter: true,
  },
  ed: {
    key: 'ed', short: 'ED', name: 'Estimation Deviation', caption: 'Signed deviation',
    question: 'How far was the approved estimate from actual effort, and in which direction?',
    purpose: 'Distance and direction between approved estimated effort and actual effort.',
    formula: ['ED (%) = ((Estimate − Actual) / Estimate) × 100'],
    interpretation: 'Zero: estimate matched actual. Negative: underestimation. Positive: overestimation.',
    higherIsBetter: 'closer_to_zero',
  },
  ebi: {
    key: 'ebi', short: 'EBI', name: 'Estimation Benefit Index', caption: 'Historical improvement',
    question: 'Is estimation performance improving compared with the baseline?',
    purpose: 'Reduction in deviation from the governed pre-framework baseline to the current period with the framework.',
    formula: ['EBI (%) = ((Historical Aggregate ED − Current Aggregate ED) / Historical Aggregate ED) × 100'],
    interpretation: 'Positive: deviation reduced vs. the historical baseline. Negative: deterioration. EBI shows movement, not the current accuracy level.',
    higherIsBetter: true,
  },
  eei: {
    key: 'eei', short: 'EEI', name: 'Estimation Effectiveness Index', caption: 'Overall effectiveness',
    question: 'How effective is estimation overall at Department or Program level?',
    purpose: 'Overall effectiveness across every eligible record, framework-aligned or not, on a common PersonDay basis.',
    formula: ['Aggregate ED (%) = (Σ|Estimate − Actual| / ΣEstimate) × 100', 'EEI (%) = 100 − Aggregate ED (%)'],
    interpretation: 'Higher is better. 100 − EEI is the aggregate absolute deviation across all eligible records.',
    higherIsBetter: true,
  },
};

export const KPI_ORDER: KpiKey[] = ['efa', 'ed', 'ebi', 'eei'];

export const STATUS_LABEL: Record<KpiStatus, string> = {
  good: 'On track', warning: 'Watch', critical: 'Needs attention', na: 'Not available',
};

export const EBI_NA_TEXT: Record<EbiNaReason, string> = {
  no_historical_baseline: 'No approved pre-framework historical baseline covers this scope. Add one under Historical Baselines.',
  historical_ed_zero: 'Historical Aggregate ED is 0 %, so the relative improvement has a zero denominator.',
  no_current_records: 'A historical baseline exists, but no framework records with actual effort were completed in this period for the same scope.',
  not_tracked_at_level: 'Historical baselines are governed per Department or Program, so EBI is not tracked at this level.',
};

export const sourceLabel = (methods: PerfMethod[]) =>
  methods.map(m => (m === 'SP' ? 'Historical Data SP' : 'Historical Data PE')).join(' / ');

export function kpiValue(d: PerformanceDashboard, k: KpiKey): number | null {
  return d.summary[k].value;
}

/** Change vs the previous period and whether that change is an improvement. */
export function trendDelta(current: number | null, previous: number | null, k: KpiKey) {
  if (current == null || previous == null) return null;
  const delta = current - previous;
  const def = KPI_DEFS[k];
  const improved = def.higherIsBetter === 'closer_to_zero'
    ? Math.abs(current) < Math.abs(previous)
    : delta > 0;
  return { delta, improved, flat: Math.abs(delta) < 0.005 };
}

export interface Explanation {
  title: string;
  formula: string[];
  inputs: { label: string; value: string }[];
  steps: string[];
  result: string;
  interpretation: string;
  sources: { label: string; value: string }[];
  na?: string;
}

const r2 = (v: number) => fmtNum(v, 2);

/** The exact calculation behind the value displayed on a KPI tile, built from the backend result. */
export function explainKpi(d: PerformanceDashboard, k: KpiKey): Explanation {
  const s = d.summary;
  const src = sourceLabel(d.meta.methods);
  const def = KPI_DEFS[k];
  const base = { title: `${def.name} (${def.short})`, formula: def.formula };

  if (k === 'efa') {
    const f = s.framework;
    const sources = [
      { label: 'Data source', value: src },
      { label: 'Eligible records', value: `${f.record_count} framework-aligned of ${s.eligible.record_count}` },
      ...(f.excluded_overrides ? [{ label: 'Excluded', value: `${f.excluded_overrides} estimate(s) overridden outside the framework range` }] : []),
    ];
    if (s.efa.value == null) {
      return { ...base, inputs: [], steps: [], result: NA, interpretation: def.interpretation, sources,
        na: 'No framework-aligned records with actual effort were completed in this period.' };
    }
    return {
      ...base,
      inputs: [
        { label: 'Total Estimated PD', value: fmtPd(f.total_estimated_pd) },
        { label: 'Total Actual PD', value: fmtPd(f.total_actual_pd) },
        { label: 'Total Absolute Error', value: fmtPd(f.total_abs_error_pd) },
      ],
      steps: [
        'Framework Aggregate ED = (Total Absolute Error / Total Estimated PD) × 100',
        `= (${r2(f.total_abs_error_pd)} / ${r2(f.total_estimated_pd)}) × 100`,
        `= ${fmtPct(s.efa.framework_aggregate_ed)}`,
        `EFA = 100 − ${fmtPct(s.efa.framework_aggregate_ed)}`,
      ],
      result: fmtPct(s.efa.value),
      interpretation: `An EFA of ${fmtPct(s.efa.value)} means the framework-level effort-weighted absolute deviation is ${fmtPct(s.efa.framework_aggregate_ed)}.`,
      sources,
    };
  }

  if (k === 'ed') {
    const e = s.eligible;
    const sources = [
      { label: 'Data source', value: src },
      { label: 'Eligible records', value: String(e.record_count) },
      { label: 'Direction (±' + s.ed.tolerance + '% tolerance)', value: `${s.ed.under_count} under · ${s.ed.on_target_count} on target · ${s.ed.over_count} over` },
    ];
    if (s.ed.value == null) {
      return { ...base, inputs: [], steps: [], result: NA, interpretation: def.interpretation, sources,
        na: 'No eligible records (approved estimate and recorded actual effort) in this period.' };
    }
    const v = s.ed.value;
    const dir = Math.abs(v) <= s.ed.tolerance
      ? `On target (within ±${s.ed.tolerance}%)`
      : v < 0 ? 'Underestimation — actual effort exceeded the estimate' : 'Overestimation — the estimate exceeded actual effort';
    return {
      ...base,
      inputs: [
        { label: 'Estimated PD', value: fmtPd(e.total_estimated_pd) },
        { label: 'Actual PD', value: fmtPd(e.total_actual_pd) },
      ],
      steps: [
        'ED = ((Estimated PD − Actual PD) / Estimated PD) × 100',
        `= ((${r2(e.total_estimated_pd)} − ${r2(e.total_actual_pd)}) / ${r2(e.total_estimated_pd)}) × 100`,
      ],
      result: fmtPct(v, 2, true),
      interpretation: `${dir}. Absolute (aggregate) deviation: ${fmtPct(s.ed.absolute)}.`,
      sources,
    };
  }

  if (k === 'ebi') {
    const b = s.ebi;
    const baselines = b.baselines_used.length ? b.baselines_used.map(x => x.label).join(', ') : 'none';
    const sources = [
      { label: 'Historical source', value: `Without framework — governed baseline(s): ${baselines}` },
      { label: 'Current source', value: `With framework — ${src} (${b.current.record_count} framework records)` },
      ...(b.missing_scope.length ? [{ label: 'Not compared', value: `${b.missing_scope.reduce((n, m) => n + m.record_count, 0)} record(s) in scopes with no historical baseline` }] : []),
    ];
    const inputs = [
      { label: 'Historical Aggregate ED (Without Framework)', value: fmtPct(b.historical_ed) },
      { label: 'Current Aggregate ED (With Framework)', value: fmtPct(b.current_ed) },
    ];
    if (b.value == null) {
      return { ...base, inputs, steps: [], result: NA, interpretation: def.interpretation, sources,
        na: EBI_NA_TEXT[b.na_reason ?? 'no_historical_baseline'] };
    }
    return {
      ...base,
      inputs,
      steps: [
        `Historical = ${r2(b.historical.total_abs_error_pd)} / ${r2(b.historical.total_estimated_pd)} × 100 = ${fmtPct(b.historical_ed)}`,
        `Current = ${r2(b.current.total_abs_error_pd)} / ${r2(b.current.total_estimated_pd)} × 100 = ${fmtPct(b.current_ed)}`,
        `EBI = ((${r2(b.historical_ed!)} − ${r2(b.current_ed!)}) / ${r2(b.historical_ed!)}) × 100`,
      ],
      result: fmtPct(b.value, 2),
      interpretation: b.value >= 0
        ? `${fmtPct(b.value)} reduction in estimation deviation compared with the historical baseline (${fmtPct(b.historical_ed)} → ${fmtPct(b.current_ed)}, ${fmtPp(-(b.reduction ?? 0))}).`
        : `Deviation increased by ${fmtPct(Math.abs(b.value))} relative to the historical baseline — performance deteriorated.`,
      sources,
    };
  }

  // EEI
  const e = s.eligible;
  const sources = [
    { label: 'Data source', value: src },
    { label: 'Eligible records', value: `${e.record_count} (framework-aligned and overridden)` },
  ];
  if (s.eei.value == null) {
    return { ...base, inputs: [], steps: [], result: NA, interpretation: def.interpretation, sources,
      na: 'No eligible records (approved estimate and recorded actual effort) in this period.' };
  }
  return {
    ...base,
    inputs: [
      { label: 'Total Estimated PD', value: fmtPd(e.total_estimated_pd) },
      { label: 'Total Actual PD', value: fmtPd(e.total_actual_pd) },
      { label: 'Total Absolute Error', value: fmtPd(e.total_abs_error_pd) },
    ],
    steps: [
      'Aggregate ED = (Total Absolute Error / Total Estimated PD) × 100',
      `= (${r2(e.total_abs_error_pd)} / ${r2(e.total_estimated_pd)}) × 100`,
      `= ${fmtPct(s.eei.aggregate_ed)}`,
      `EEI = 100 − ${fmtPct(s.eei.aggregate_ed)}`,
    ],
    result: fmtPct(s.eei.value),
    interpretation: `An EEI of ${fmtPct(s.eei.value)} means the aggregate absolute deviation is ${fmtPct(s.eei.aggregate_ed)} across the eligible records.`,
    sources,
  };
}

// ─── CSV export ──────────────────────────────────────────────────────────────

export interface CsvColumn<T> { header: string; value: (row: T) => string | number | null | undefined }

export function toCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const esc = (v: unknown) => {
    const s = v == null ? '' : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [columns.map(c => esc(c.header)).join(','), ...rows.map(r => columns.map(c => esc(c.value(r))).join(','))].join('\r\n');
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** CSV rounding: 2 dp, blank for N/A. */
export const csvNum = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? '' : v.toFixed(2));
