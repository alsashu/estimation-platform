import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { EstimationActivityCard, type ActivitySeries } from '../../components/dashboard/EstimationActivityCard';
import {
  defaultActivityRange, validateActivityRange, intervalFor, formatPeriod, formatTick, addDaysISO, spanDays,
  parseISODate, toISODate, isDefaultRange,
} from '../../components/dashboard/activityRange';
import type { ActivityResponse, TrendPoint, ParametricTrendPoint } from '../../types';

// recharts' ResponsiveContainer measures 0×0 in jsdom; the chart body is covered by the live UI check.
const TODAY = '2026-11-14';

describe('activityRange helpers', () => {
  it('defaults to the last 30 days including today', () => {
    expect(defaultActivityRange(TODAY)).toEqual({ from: '2026-10-16', to: TODAY });
    expect(spanDays('2026-10-16', TODAY)).toBe(30);
    expect(isDefaultRange({ from: '2026-10-16', to: TODAY }, TODAY)).toBe(true);
    expect(isDefaultRange({ from: '2026-10-01', to: TODAY }, TODAY)).toBe(false);
  });

  it('treats YYYY-MM-DD as a local date', () => {
    expect(toISODate(parseISODate('2026-03-01'))).toBe('2026-03-01');
    expect(addDaysISO('2028-03-01', -1)).toBe('2028-02-29');
  });

  it('accepts valid ranges, including the same From and To date', () => {
    expect(validateActivityRange({ from: '2026-11-01', to: '2026-11-10' }, TODAY)).toEqual({});
    expect(validateActivityRange({ from: TODAY, to: TODAY }, TODAY)).toEqual({});
  });

  it('rejects From later than To (both fields flagged)', () => {
    expect(validateActivityRange({ from: '2026-11-10', to: '2026-11-01' }, TODAY)).toEqual({
      from: 'From Date must not be later than To Date',
      to: 'To Date must not be earlier than From Date',
    });
  });

  it('rejects future dates, missing dates and over-long ranges', () => {
    expect(validateActivityRange({ from: '2026-11-01', to: '2026-11-15' }, TODAY)).toEqual({ to: 'To Date cannot be in the future' });
    expect(validateActivityRange({ from: '', to: TODAY }, TODAY)).toEqual({ from: 'From Date is required' });
    expect(validateActivityRange({ from: '2000-01-01', to: TODAY }, TODAY).to).toMatch(/cannot exceed/);
  });

  it('chooses daily / weekly / monthly intervals like the backend', () => {
    expect(intervalFor({ from: '2026-10-16', to: TODAY })).toBe('day');
    expect(intervalFor({ from: '2026-01-01', to: TODAY })).toBe('week');
    expect(intervalFor({ from: '2020-01-01', to: TODAY })).toBe('month');
  });

  it('formats ticks and tooltip periods per interval', () => {
    expect(formatTick('2026-11-14', 'day')).toBe('14 Nov');
    expect(formatTick('2026-11-01', 'month')).toBe('Nov 26');
    expect(formatPeriod({ date: '2026-11-14', period_start: '2026-11-14', period_end: '2026-11-14' }, 'day')).toBe('14 Nov 2026');
    expect(formatPeriod({ date: '2026-11-09', period_start: '2026-11-09', period_end: '2026-11-15' }, 'week')).toBe('09 Nov 2026 – 15 Nov 2026');
    expect(formatPeriod({ date: '2026-09-01', period_start: '2026-09-01', period_end: '2026-09-30' }, 'month')).toBe('September 2026');
    expect(formatPeriod({ date: '2026-11-01', period_start: '2026-11-01', period_end: '2026-11-14' }, 'month')).toBe('1–14 Nov 2026');
  });
});

// ─── Component ───────────────────────────────────────────────────────────────
const meta = (from: string, to: string, interval: 'day' | 'week' | 'month' = 'day') =>
  ({ from, to, timezone: 'UTC', interval, days: spanDays(from, to) });
const bucket = (date: string, extra: Partial<TrendPoint> = {}): TrendPoint =>
  ({ date, period_start: date, period_end: date, total: 0, completed: 0, avg_accuracy: 0, ...extra });

const SP_SERIES: ActivitySeries<TrendPoint>[] = [
  { key: 'total', name: 'Created', color: { light: '#1E3246', dark: '#D2D7DC' } },
  { key: 'completed', name: 'Completed', color: { light: '#19AA6E', dark: '#19AA6E' } },
];

function renderCard(fetchActivity: (p: Record<string, unknown>) => Promise<ActivityResponse<TrendPoint>>, scope: Record<string, unknown> = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <EstimationActivityCard<TrendPoint> queryKey="trend" scope={scope} fetchActivity={fetchActivity} noun="estimations" series={SP_SERIES} />
    </QueryClientProvider>,
  );
}

describe('EstimationActivityCard', () => {
  beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(2026, 10, 14, 12, 0, 0)); });
  afterEach(() => vi.useRealTimers());

  it('loads the last 30 days by default with the scope filters and time zone', async () => {
    const fetch = vi.fn().mockResolvedValue({ data: [bucket('2026-11-14', { total: 2 })], meta: meta('2026-10-16', TODAY) });
    renderCard(fetch, { departmentId: 'D1', programId: 'P1', baselineId: 'B1' });
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    expect(fetch.mock.calls[0][0]).toMatchObject({ departmentId: 'D1', programId: 'P1', baselineId: 'B1', from: '2026-10-16', to: TODAY });
    expect(typeof fetch.mock.calls[0][0].tz).toBe('string');
    expect((screen.getByLabelText('From Date') as HTMLInputElement).value).toBe('2026-10-16');
    expect((screen.getByLabelText('To Date') as HTMLInputElement).value).toBe(TODAY);
    expect(screen.getByTestId('activity-subtitle').textContent).toMatch(/^Daily estimations over the selected period/);
  });

  it('applies a custom range only when Apply is pressed', async () => {
    const fetch = vi.fn().mockImplementation(async (p) => ({ data: [bucket(p.from as string, { total: 1 })], meta: meta(p.from as string, p.to as string) }));
    renderCard(fetch);
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByLabelText('From Date'), { target: { value: '2026-09-01' } });
    fireEvent.change(screen.getByLabelText('To Date'), { target: { value: '2026-09-30' } });
    expect(fetch).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: /apply/i }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(fetch.mock.calls[1][0]).toMatchObject({ from: '2026-09-01', to: '2026-09-30' });
  });

  it('shows a validation message and blocks Apply for an inverted range', async () => {
    const fetch = vi.fn().mockResolvedValue({ data: [bucket(TODAY, { total: 1 })], meta: meta('2026-10-16', TODAY) });
    renderCard(fetch);
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    fireEvent.change(screen.getByLabelText('From Date'), { target: { value: '2026-11-10' } });
    fireEvent.change(screen.getByLabelText('To Date'), { target: { value: '2026-11-01' } });
    expect(screen.getByRole('alert').textContent).toBe('From Date must not be later than To Date');
    expect(screen.getByRole('button', { name: /apply/i })).toBeDisabled();
    expect(screen.getByLabelText('From Date')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('To Date')).toHaveAttribute('aria-invalid', 'true');
    // the To picker cannot go past today or before From
    expect(screen.getByLabelText('To Date')).toHaveAttribute('max', TODAY);
    expect(screen.getByLabelText('To Date')).toHaveAttribute('min', '2026-11-10');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('Reset restores the last 30 days', async () => {
    const fetch = vi.fn().mockImplementation(async (p) => ({ data: [bucket(p.from as string, { total: 1 })], meta: meta(p.from as string, p.to as string) }));
    renderCard(fetch);
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    const reset = screen.getByRole('button', { name: /reset/i });
    expect(reset).toBeDisabled();
    fireEvent.change(screen.getByLabelText('From Date'), { target: { value: '2026-11-14' } });
    fireEvent.click(screen.getByRole('button', { name: /apply/i }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    fireEvent.click(reset);
    expect((screen.getByLabelText('From Date') as HTMLInputElement).value).toBe('2026-10-16');
    await waitFor(() => expect(screen.getByRole('button', { name: /reset/i })).toBeDisabled());
  });

  it('shows an empty state for a period without estimations', async () => {
    const fetch = vi.fn().mockResolvedValue({ data: [bucket('2026-10-16'), bucket(TODAY)], meta: meta('2026-10-16', TODAY) });
    renderCard(fetch);
    expect((await screen.findByTestId('activity-empty')).textContent).toMatch(/No estimations between 16 Oct 2026 and 14 Nov 2026/);
  });

  it('labels weekly / monthly buckets in the subtitle for large ranges', async () => {
    const fetch = vi.fn().mockResolvedValue({ data: [bucket('2024-01-01', { total: 3 })], meta: meta('2024-01-01', TODAY, 'month') });
    renderCard(fetch);
    await waitFor(() => expect(screen.getByTestId('activity-subtitle').textContent).toMatch(/^Monthly estimations/));
  });

  it('surfaces a server-side validation error', async () => {
    const fetch = vi.fn().mockRejectedValue({ response: { data: { error: 'To Date cannot be in the future' } } });
    renderCard(fetch);
    expect(await screen.findByText('To Date cannot be in the future')).toBeInTheDocument();
  });
});

describe('PE series typing', () => {
  it('accepts manual / excel breakdown points', () => {
    const p: ParametricTrendPoint = { date: TODAY, period_start: TODAY, period_end: TODAY, total: 3, manual: 2, excel_import: 1, avg_final_estimation: 10 };
    expect(p.manual + p.excel_import).toBe(p.total);
  });
});
