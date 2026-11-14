import type { ActivityBucket, ActivityInterval } from '../../types';

/** Pure helpers for the dashboard Estimation Activity date-range filter (shared by SP and PE). */

export const DEFAULT_ACTIVITY_DAYS = 30;
/** Mirrors the backend limit (services/activityRange.ts). */
export const MAX_ACTIVITY_DAYS = 3660;

export interface DateRange { from: string; to: string }
export interface RangeErrors { from?: string; to?: string }

const pad = (n: number) => String(n).padStart(2, '0');

/** Local calendar date as YYYY-MM-DD (not UTC — "today" is where the user is). */
export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Parse YYYY-MM-DD as a LOCAL date (new Date('2026-11-14') would be UTC midnight). */
export function parseISODate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDaysISO(iso: string, n: number): string {
  const d = parseISODate(iso);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

export function spanDays(from: string, to: string): number {
  return Math.round((Date.UTC(...ymd(to)) - Date.UTC(...ymd(from))) / 86_400_000) + 1;
}
function ymd(s: string): [number, number, number] {
  const [y, m, d] = s.split('-').map(Number);
  return [y, m - 1, d];
}

export function browserTimeZone(): string {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; }
}

/** Last 30 days including today. */
export function defaultActivityRange(today: string = toISODate(new Date())): DateRange {
  return { from: addDaysISO(today, -(DEFAULT_ACTIVITY_DAYS - 1)), to: today };
}

export function isDefaultRange(r: DateRange, today: string = toISODate(new Date())): boolean {
  const d = defaultActivityRange(today);
  return r.from === d.from && r.to === d.to;
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export function validateActivityRange(r: DateRange, today: string = toISODate(new Date())): RangeErrors {
  const e: RangeErrors = {};
  if (!r.from) e.from = 'From Date is required';
  else if (!ISO.test(r.from)) e.from = 'Enter a valid From Date';
  if (!r.to) e.to = 'To Date is required';
  else if (!ISO.test(r.to)) e.to = 'Enter a valid To Date';
  if (e.from || e.to) return e;

  if (r.from > today) e.from = 'From Date cannot be in the future';
  if (r.to > today) e.to = 'To Date cannot be in the future';
  if (!e.from && !e.to && r.from > r.to) {
    e.from = 'From Date must not be later than To Date';
    e.to = 'To Date must not be earlier than From Date';
  }
  if (!e.from && !e.to && spanDays(r.from, r.to) > MAX_ACTIVITY_DAYS) {
    e.to = `Date range cannot exceed ${MAX_ACTIVITY_DAYS} days (~10 years)`;
  }
  return e;
}

export const hasErrors = (e: RangeErrors) => Boolean(e.from || e.to);

/** Same thresholds as the backend: ≤ 62 days daily, ≤ 366 weekly, otherwise monthly. */
export function intervalFor(r: DateRange): ActivityInterval {
  const n = spanDays(r.from, r.to);
  return n <= 62 ? 'day' : n <= 366 ? 'week' : 'month';
}

export const INTERVAL_ADJECTIVE: Record<ActivityInterval, string> = { day: 'Daily', week: 'Weekly', month: 'Monthly' };

export function formatDisplayDate(iso: string): string {
  return parseISODate(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

/** X-axis tick label for a bucket start date. */
export function formatTick(iso: string, interval: ActivityInterval): string {
  const d = parseISODate(iso);
  if (interval === 'month') return d.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

/** Tooltip heading: the day, or the (range-clamped) week / month the bucket covers. */
export function formatPeriod(p: Pick<ActivityBucket, 'date' | 'period_start' | 'period_end'>, interval: ActivityInterval): string {
  const start = p.period_start || p.date;
  const end = p.period_end || p.date;
  if (interval === 'day' || start === end) return formatDisplayDate(start);
  if (interval === 'month') {
    const s = parseISODate(start), e = parseISODate(end);
    const fullMonth = s.getDate() === 1 && addDaysISO(end, 1).endsWith('-01');
    if (fullMonth) return s.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
    if (s.getMonth() === e.getMonth()) return `${s.getDate()}–${formatDisplayDate(end)}`;
  }
  return `${formatDisplayDate(start)} – ${formatDisplayDate(end)}`;
}
