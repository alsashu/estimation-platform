import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const dashboard = vi.fn();
const breakdown = vi.fn();
vi.mock('../../services/api', () => ({
  performanceApi: {
    dashboard: (p: unknown) => dashboard(p),
    breakdown: (p: unknown) => breakdown(p),
    settings: vi.fn().mockResolvedValue({
      on_target_tolerance: 5, distribution_bounds: [5, 10, 20, 30], default_range_days: 90,
      thresholds: { efa: { good: 90, warning: 80 }, eei: { good: 85, warning: 70 }, ed: { good: 10, warning: 20 }, ebi: { good: 25, warning: 0 } },
    }),
    baselines: vi.fn().mockResolvedValue([]),
    snapshots: vi.fn().mockResolvedValue([]),
  },
  hierarchyApi: { baselines: vi.fn().mockResolvedValue([]) },
  registrationsApi: { getPendingCount: vi.fn().mockResolvedValue({ count: 0 }) },
}));

import EstimationPerformancePage, { rangeForDays, rootLevelFor } from '../../modules/performance/EstimationPerformancePage';
import { explainKpi, fmtPct, fmtPp, toCsv, trendDelta, EBI_NA_TEXT } from '../../modules/performance/kpiFormat';
import { validateBaselineDraft, draftToInput, EMPTY_DRAFT } from '../../modules/performance/PerformanceAdmin';
import { drillParams } from '../../modules/performance/BreakdownPanel';
import { Sidebar } from '../../components/layout/Sidebar';
import { useAuthStore, type AuthUser } from '../../store/authStore';
import { useHierarchyStore } from '../../store/hierarchyStore';
import type { Aggregate, GroupRow, PerformanceDashboard } from '../../modules/performance/types';
import type { ModuleCode } from '../../utils/moduleAccess';

// ─── Fixture: the spec's illustrative numbers, shaped like the API response ──
const agg = (est: number, act: number, abs: number, n: number): Aggregate => ({
  record_count: n, total_estimated_pd: est, total_actual_pd: act, total_abs_error_pd: abs,
  total_signed_error_pd: est - act, aggregate_ed: est > 0 ? (abs / est) * 100 : null, signed_ed: est > 0 ? ((est - act) / est) * 100 : null,
});
const row = (o: Partial<GroupRow>): GroupRow => ({
  id: 'p1', name: 'Program 1', department_id: 'd1', department_name: 'Dept', program_id: 'p1', program_name: 'Program 1',
  record_count: 3, framework_record_count: 3, total_estimated_pd: 100, total_actual_pd: 110, total_abs_error_pd: 10,
  ed: -10, aggregate_ed: 10, efa: 90, eei: 90, ebi: null, ebi_na_reason: 'no_historical_baseline', historical_ed: null, current_ed: null,
  under_count: 2, over_count: 0, on_target_count: 1, ...o,
});

function makeDashboard(over: Partial<PerformanceDashboard['summary']> = {}): PerformanceDashboard {
  const eligible = agg(1240, 1300, 360, 25);
  const framework = { ...agg(1000, 1050, 120, 20), excluded_overrides: 5 };
  return {
    meta: {
      from: '2026-08-17', to: '2026-11-14', timezone: 'UTC', interval: 'week', days: 90,
      previous: { from: '2026-05-19', to: '2026-08-16' }, methods: ['SP', 'PE'],
      filters: { departmentId: null, programIds: [], baselineId: null }, sources: ['Historical Data SP', 'Historical Data PE'],
      unit: 'person_days', sp_hours_per_pd: 8, excluded_records: 0, generated_at: '2026-11-14T00:00:00Z',
      settings: { on_target_tolerance: 5, distribution_bounds: [5, 10, 20, 30], default_range_days: 90,
        thresholds: { efa: { good: 90, warning: 80 }, eei: { good: 85, warning: 70 }, ed: { good: 10, warning: 20 }, ebi: { good: 25, warning: 0 } } },
    },
    summary: {
      eligible, framework,
      efa: { value: 88, framework_aggregate_ed: 12, status: 'warning' },
      ed: { value: eligible.signed_ed, absolute: eligible.aggregate_ed, under_count: 10, over_count: 5, on_target_count: 10,
        under_pct: 40, over_pct: 20, on_target_pct: 40, under_effort_pd: 100, over_effort_pd: 40, under_ed: -12, over_ed: 8, tolerance: 5, status: 'good' },
      ebi: { value: 40, na_reason: null, historical_ed: 20, current_ed: 12, reduction: 8,
        historical: { entry_count: 1, record_count: 40, total_estimated_pd: 500, total_actual_pd: 560, total_abs_error_pd: 100, aggregate_ed: 20 },
        current: agg(1000, 1050, 120, 20), baselines_used: [{ id: 'h1', version: 1, label: 'FY25 pre-framework', department_id: 'd1', program_id: null, estimation_method: 'ALL' }],
        missing_scope: [], unmatched_baselines: [], status: 'good' },
      eei: { value: 100 - (360 / 1240) * 100, aggregate_ed: (360 / 1240) * 100, status: 'good' },
      by_method: { SP: agg(240, 250, 60, 5), PE: agg(1000, 1050, 300, 20) },
      ...over,
    },
    previous: { efa: 85, ed: -6, ebi: null, eei: 72, record_count: 10 },
    indicators: {
      total_estimated_pd: 1240, total_actual_pd: 1300, total_abs_error_pd: 360, average_deviation: 14.2,
      underestimation_rate: 40, overestimation_rate: 20, on_target_rate: 40, actuals_coverage: 50, data_completeness: 45,
      framework_adoption_rate: 80, calibration_gap: 8,
      best_program: { name: 'Program 1', department_name: 'Dept', aggregate_ed: 10 },
      highest_deviation_program: { name: 'Program 2', department_name: 'Dept', aggregate_ed: 30 },
      best_department: { name: 'Dept', eei: 71 },
      improvement_opportunities: [row({ name: 'Program 2', id: 'p2', program_id: 'p2', aggregate_ed: 30 })],
      top_improving_programs: [],
    },
    coverage: { total_records: 50, with_actuals: 25, completed: 25, complete_data: 22, actuals_coverage: 50, data_completeness: 44 },
    by_program: [row({}), row({ id: 'p2', program_id: 'p2', name: 'Program 2', ed: 25, aggregate_ed: 30, efa: 70, eei: 70 })],
    by_department: [row({ id: 'd1', name: 'Dept', program_id: null, program_name: null })],
    trend: [{ period: '2026-11-09', record_count: 3, framework_record_count: 3, efa: 88, eei: 71, ed: -5, total_estimated_pd: 100, total_actual_pd: 105 }],
    distribution: [{ label: '0–5%', min: 0, max: 5, count: 10, pct: 40 }, { label: '> 5%', min: 5, max: null, count: 15, pct: 60 }],
  };
}

function login(modules: ModuleCode[], extra: string[] = []) {
  const user: AuthUser = {
    id: 'u1', email: 'a@b', username: 'a', firstName: 'A', lastName: 'B', roles: ['Admin'], projectIds: [], modules,
    permissions: [...(modules.includes('SP') ? ['estimation.read'] : []), ...(modules.includes('PE') ? ['parametric.read'] : []), ...extra],
  };
  useAuthStore.getState().setAuth(user, 'at', 'rt');
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><MemoryRouter><EstimationPerformancePage /></MemoryRouter></QueryClientProvider>);
}

beforeEach(() => {
  useAuthStore.getState().clearAuth();
  useHierarchyStore.getState().reset();
  useHierarchyStore.getState().setContext({
    isGlobal: true,
    departments: [{ id: 'd1', name: 'Dept' }, { id: 'd2', name: 'Other' }],
    programs: [{ id: 'p1', name: 'Program 1', department_id: 'd1' }, { id: 'p2', name: 'Program 2', department_id: 'd1' }],
  } as never);
  dashboard.mockReset().mockResolvedValue(makeDashboard());
  breakdown.mockReset().mockResolvedValue({ success: true, data: [], meta: { excluded_records: 0 } });
});

// ─── Formatting & explanations ───────────────────────────────────────────────
describe('kpiFormat', () => {
  it('distinguishes N/A from zero', () => {
    expect(fmtPct(null)).toBe('N/A');
    expect(fmtPct(0)).toBe('0.00%');
    expect(fmtPct(-0.0001)).toBe('0.00%');
    expect(fmtPct(-11.111, 2, true)).toBe('-11.11%');
    expect(fmtPct(4, 1, true)).toBe('+4.0%');
    expect(fmtPp(-8)).toBe('-8.00 pp');
  });

  it('EFA tooltip walks through the displayed value', () => {
    const ex = explainKpi(makeDashboard(), 'efa');
    expect(ex.steps).toContain('= (120.00 / 1,000.00) × 100');
    expect(ex.steps).toContain('= 12.00%');
    expect(ex.result).toBe('88.00%');
    expect(ex.sources.find(s => s.label === 'Eligible records')?.value).toBe('20 framework-aligned of 25');
  });

  it('EEI tooltip: 360 / 1,240 → 29.03 % → 70.97 %', () => {
    const ex = explainKpi(makeDashboard(), 'eei');
    expect(ex.steps).toContain('= (360.00 / 1,240.00) × 100');
    expect(ex.steps).toContain('= 29.03%');
    expect(ex.result).toBe('70.97%');
  });

  it('ED tooltip shows the signed result and direction', () => {
    const d = makeDashboard();
    d.summary.ed.value = -11.111; d.summary.eligible = agg(90, 100, 10, 1);
    const ex = explainKpi(d, 'ed');
    expect(ex.steps[1]).toBe('= ((90.00 − 100.00) / 90.00) × 100');
    expect(ex.result).toBe('-11.11%');
    expect(ex.interpretation).toMatch(/^Underestimation/);
  });

  it('EBI tooltip: historical 20 %, current 12 % → 40 %; N/A explains why', () => {
    const ex = explainKpi(makeDashboard(), 'ebi');
    expect(ex.steps[2]).toBe('EBI = ((20.00 − 12.00) / 20.00) × 100');
    expect(ex.result).toBe('40.00%');
    expect(ex.sources[0].value).toContain('Without framework');
    const d = makeDashboard();
    d.summary.ebi = { ...d.summary.ebi, value: null, na_reason: 'historical_ed_zero' };
    const na = explainKpi(d, 'ebi');
    expect(na.result).toBe('N/A');
    expect(na.na).toBe(EBI_NA_TEXT.historical_ed_zero);
  });

  it('trend: ED improves when closer to zero, others when higher', () => {
    expect(trendDelta(-3, -6, 'ed')?.improved).toBe(true);
    expect(trendDelta(88, 85, 'efa')?.improved).toBe(true);
    expect(trendDelta(80, 85, 'eei')?.improved).toBe(false);
    expect(trendDelta(null, 85, 'eei')).toBeNull();
  });

  it('CSV escapes commas, quotes and blanks N/A', () => {
    expect(toCsv([{ a: 'x, "y"', b: null }], [{ header: 'A', value: r => r.a }, { header: 'B', value: r => r.b }]))
      .toBe('A,B\r\n"x, ""y""",');
  });
});

describe('page helpers', () => {
  it('default range and breakdown root level', () => {
    expect(rangeForDays(90, '2026-11-14')).toEqual({ from: '2026-08-17', to: '2026-11-14' });
    expect(rootLevelFor({ departmentId: null, programIds: [], baselineId: null })).toBe('department');
    expect(rootLevelFor({ departmentId: 'd1', programIds: [], baselineId: null })).toBe('program');
    expect(rootLevelFor({ departmentId: 'd1', programIds: ['p1'], baselineId: null })).toBe('baseline');
    expect(rootLevelFor({ departmentId: 'd1', programIds: ['p1'], baselineId: 'b1' })).toBe('task');
  });

  it('drill-down params follow Department → Program → Baseline', () => {
    const r = row({ id: 'b1' });
    expect(drillParams('department', r)).toEqual({ departmentId: 'd1' });
    expect(drillParams('program', r)).toEqual({ programIds: 'p1' });
    expect(drillParams('baseline', r)).toEqual({ baselineId: 'b1' });
    expect(drillParams('program', row({ program_id: null }))).toBeNull();
  });

  it('historical baseline form validation mirrors the API', () => {
    expect(Object.keys(validateBaselineDraft(EMPTY_DRAFT)).sort()).toEqual(
      ['department_id', 'label', 'record_count', 'total_abs_error_pd', 'total_actual_pd', 'total_estimated_pd'].sort());
    const ok = { ...EMPTY_DRAFT, department_id: 'd1', label: 'FY25', record_count: '10', total_estimated_pd: '300', total_actual_pd: '340', total_abs_error_pd: '60' };
    expect(validateBaselineDraft(ok)).toEqual({});
    expect(validateBaselineDraft({ ...ok, total_abs_error_pd: '20' }).total_abs_error_pd).toMatch(/Cannot be less than/);
    expect(validateBaselineDraft({ ...ok, period_from: '2025-12-01', period_to: '2025-01-01' }).period_to).toBeDefined();
    expect(draftToInput(ok)).toMatchObject({ program_id: null, record_count: 10, total_abs_error_pd: 60, period_from: null });
  });
});

// ─── Navigation ──────────────────────────────────────────────────────────────
describe('sidebar', () => {
  const links = () => {
    const qc = new QueryClient();
    render(<QueryClientProvider client={qc}><MemoryRouter><Sidebar /></MemoryRouter></QueryClientProvider>);
    return screen.queryAllByRole('link').map(a => a.textContent?.trim());
  };
  it.each([[['SP']], [['PE']], [['SP', 'PE']]] as ModuleCode[][][])('shows Estimation Performance under Overview for %j', (mods) => {
    login(mods);
    const l = links();
    expect(l).toContain('Estimation Performance');
    const dashIdx = l.findIndex(x => x?.startsWith('Dashboard'));
    expect(l.indexOf('Estimation Performance')).toBeGreaterThan(dashIdx);
  });
  it('hidden without any estimation module', () => {
    login([]);
    expect(links()).not.toContain('Estimation Performance');
  });
});

// ─── Page ────────────────────────────────────────────────────────────────────
describe('Estimation Performance page', () => {
  it('renders the four KPI tiles from the backend result', async () => {
    login(['SP', 'PE']);
    renderPage();
    expect(await screen.findByTestId('kpi-value-efa')).toHaveTextContent('88.00%');
    expect(screen.getByTestId('kpi-value-ebi')).toHaveTextContent('40.00%');
    expect(screen.getByTestId('kpi-value-eei')).toHaveTextContent('70.97%');
    expect(screen.getByTestId('kpi-value-ed')).toHaveTextContent('-4.84%');
    expect(screen.getByTestId('kpi-trend-efa')).toHaveTextContent('+3.00 pp');
    expect(screen.getByTestId('kpi-trend-ebi')).toHaveTextContent('No previous data');
    expect(dashboard).toHaveBeenCalledWith(expect.objectContaining({ method: 'BOTH', from: expect.any(String), to: expect.any(String), tz: expect.any(String) }));
  });

  it('shows N/A (not 0) when a KPI cannot be calculated', async () => {
    login(['SP', 'PE']);
    const d = makeDashboard();
    d.summary.ebi = { ...d.summary.ebi, value: null, na_reason: 'no_historical_baseline', historical_ed: null, status: 'na' };
    dashboard.mockResolvedValue(d);
    renderPage();
    expect(await screen.findByTestId('kpi-value-ebi')).toHaveTextContent('N/A');
    fireEvent.click(screen.getByTestId('kpi-info-ebi'));
    const tip = await screen.findByRole('tooltip');
    expect(within(tip).getByText(EBI_NA_TEXT.no_historical_baseline)).toBeInTheDocument();
  });

  it('info button opens the calculation tooltip (tap / click) and Escape closes it', async () => {
    login(['SP', 'PE']);
    renderPage();
    fireEvent.click(await screen.findByTestId('kpi-info-efa'));
    const tip = await screen.findByRole('tooltip');
    expect(within(tip).getByTestId('kpi-calc-result')).toHaveTextContent('= 88.00%');
    expect(within(tip).getByText('Historical Data SP / Historical Data PE')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('tooltip')).toBeNull());
  });

  it('SP-only users can only report SP data', async () => {
    login(['SP']);
    renderPage();
    await screen.findByTestId('kpi-value-efa');
    expect(dashboard).toHaveBeenCalledWith(expect.objectContaining({ method: 'SP' }));
    expect(screen.getByRole('radio', { name: 'Both' })).toBeDisabled();
    expect(screen.getByRole('radio', { name: 'Parametric' })).toBeDisabled();
    expect(screen.getByRole('radio', { name: 'Story Point' })).toHaveAttribute('aria-checked', 'true');
  });

  it('switching the method and department refetches with those filters', async () => {
    login(['SP', 'PE']);
    renderPage();
    await screen.findByTestId('kpi-value-efa');
    fireEvent.click(screen.getByRole('radio', { name: 'Parametric' }));
    await waitFor(() => expect(dashboard).toHaveBeenLastCalledWith(expect.objectContaining({ method: 'PE' })));
    useHierarchyStore.getState().setSelectedDepartment('d1');
    await waitFor(() => expect(dashboard).toHaveBeenLastCalledWith(expect.objectContaining({ departmentId: 'd1', method: 'PE' })));
    useHierarchyStore.getState().setSelectedProgram('p2');
    await waitFor(() => expect(dashboard).toHaveBeenLastCalledWith(expect.objectContaining({ programIds: 'p2' })));
  });

  it('rejects an invalid date range without calling the API', async () => {
    login(['SP', 'PE']);
    renderPage();
    await screen.findByTestId('kpi-value-efa');
    const calls = dashboard.mock.calls.length;
    fireEvent.change(screen.getByLabelText('From Date'), { target: { value: '2026-11-10' } });
    fireEvent.change(screen.getByLabelText('To Date'), { target: { value: '2026-11-01' } });
    expect(await screen.findByRole('alert')).toHaveTextContent(/From Date/);
    expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled();
    expect(dashboard.mock.calls.length).toBe(calls);
  });

  it('no eligible records → every KPI N/A and an explanation', async () => {
    login(['SP', 'PE']);
    const d = makeDashboard();
    const empty = agg(0, 0, 0, 0);
    d.summary = { ...d.summary, eligible: empty, framework: { ...empty, excluded_overrides: 0 },
      efa: { value: null, framework_aggregate_ed: null, status: 'na' }, eei: { value: null, aggregate_ed: null, status: 'na' },
      ed: { ...d.summary.ed, value: null, absolute: null }, ebi: { ...d.summary.ebi, value: null, na_reason: 'no_current_records', status: 'na' } };
    dashboard.mockResolvedValue(d);
    renderPage();
    expect(await screen.findByTestId('perf-no-records')).toBeInTheDocument();
    for (const k of ['efa', 'ed', 'ebi', 'eei']) expect(screen.getByTestId(`kpi-value-${k}`)).toHaveTextContent('N/A');
  });

  it('clicking a tile opens the detail drawer with supporting records', async () => {
    login(['SP', 'PE']);
    breakdown.mockResolvedValue({ success: true, meta: { excluded_records: 0 }, data: [
      { ...row({ name: 'Task A', id: 't1', method: 'SP', ed: -11.11 }), framework_aligned: true, source: 'Historical Data SP', completed_at: '2026-11-01', baseline_name: 'B', direction: 'under' },
      { ...row({ name: 'Task B', id: 't2', method: 'PE', ed: 3 }), framework_aligned: false, source: 'Historical Data PE', completed_at: '2026-11-02', baseline_name: 'B', direction: 'on_target' },
    ] });
    renderPage();
    fireEvent.click(await screen.findByTestId('kpi-tile-efa'));
    const table = await screen.findByTestId('kpi-detail-records');
    // EFA: framework-aligned records only
    expect(within(table).getByText('Task A')).toBeInTheDocument();
    expect(within(table).queryByText('Task B')).toBeNull();
    expect(breakdown).toHaveBeenCalledWith(expect.objectContaining({ groupBy: 'task' }));
  });
});
