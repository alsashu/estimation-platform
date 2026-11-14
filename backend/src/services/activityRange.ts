/**
 * Date-range handling for the dashboard "Estimation Activity" graphs (SP and PE).
 *
 * Dates are calendar days (YYYY-MM-DD) in the caller's IANA time zone, so "14 Nov" means 14 Nov where the
 * user is, not in UTC. The SQL converts the day bounds to instants with `AT TIME ZONE`, filters in the
 * database, buckets by day / week / month and zero-fills empty buckets with generate_series.
 */

export type ActivityInterval = 'day' | 'week' | 'month';

export interface ActivityRange {
  from: string;          // inclusive, YYYY-MM-DD
  to: string;            // inclusive, YYYY-MM-DD
  timezone: string;
  interval: ActivityInterval;
  days: number;          // inclusive span
}

export type ActivityRangeResult = { ok: true; range: ActivityRange } | { ok: false; error: string };

export const DEFAULT_ACTIVITY_DAYS = 30;
/** ~10 years. Keeps the bucket count bounded (monthly beyond a year → ≤ 121 points). */
export const MAX_ACTIVITY_DAYS = 3660;
const DAILY_MAX_DAYS = 62;
const WEEKLY_MAX_DAYS = 366;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const TZ_SHAPE = /^[A-Za-z][A-Za-z0-9_+\-]*(\/[A-Za-z0-9_+\-]+)*$/;

export function isValidIsoDate(s: unknown): s is string {
  if (typeof s !== 'string' || !ISO_DATE.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export function isValidTimeZone(tz: unknown): tz is string {
  if (typeof tz !== 'string' || tz.length > 64 || !TZ_SHAPE.test(tz)) return false;
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch { return false; }
}

/** Today's calendar date in `tz`. */
export function todayIn(tz: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** Inclusive number of calendar days from `from` to `to`. */
export function spanDays(from: string, to: string): number {
  const ms = Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`);
  return Math.round(ms / 86_400_000) + 1;
}

export function pickInterval(days: number): ActivityInterval {
  if (days <= DAILY_MAX_DAYS) return 'day';
  if (days <= WEEKLY_MAX_DAYS) return 'week';
  return 'month';
}

/**
 * Resolve `from` / `to` / `tz` (or the legacy `days`) query params.
 * Without from/to the range is the last `days` calendar days including today (default 30).
 */
export function resolveActivityRange(q: Record<string, unknown>, now: Date = new Date()): ActivityRangeResult {
  const tzRaw = q.tz ?? q.timezone;
  if (tzRaw !== undefined && tzRaw !== '' && !isValidTimeZone(tzRaw)) return { ok: false, error: 'tz must be a valid IANA time zone (e.g. Asia/Kolkata)' };
  const timezone = (tzRaw as string) || 'UTC';
  const today = todayIn(timezone, now);

  const hasFrom = q.from !== undefined && q.from !== '';
  const hasTo = q.to !== undefined && q.to !== '';
  let from: string;
  let to: string;

  if (hasFrom || hasTo) {
    if (!hasFrom || !hasTo) return { ok: false, error: 'Both From Date and To Date are required' };
    if (!isValidIsoDate(q.from)) return { ok: false, error: 'From Date must be a valid date (YYYY-MM-DD)' };
    if (!isValidIsoDate(q.to)) return { ok: false, error: 'To Date must be a valid date (YYYY-MM-DD)' };
    from = q.from; to = q.to;
    if (from > to) return { ok: false, error: 'From Date must not be later than To Date' };
    if (to > today) return { ok: false, error: 'To Date cannot be in the future' };
    if (spanDays(from, to) > MAX_ACTIVITY_DAYS) return { ok: false, error: `Date range cannot exceed ${MAX_ACTIVITY_DAYS} days` };
  } else {
    const n = Number.parseInt(String(q.days ?? DEFAULT_ACTIVITY_DAYS), 10);
    const days = Number.isFinite(n) ? Math.min(Math.max(n, 1), MAX_ACTIVITY_DAYS) : DEFAULT_ACTIVITY_DAYS;
    to = today;
    from = addDays(today, -(days - 1));
  }

  const days = spanDays(from, to);
  return { ok: true, range: { from, to, timezone, interval: pickInterval(days), days } };
}

/**
 * SQL fragments shared by the SP and PE activity queries. `bounds` pins the range; `buckets` is the
 * zero-filled series; `inRange(col)` is a sargable filter on a timestamptz column; `bucketOf(col)`
 * maps a timestamptz to its local bucket start date.
 */
export function activitySql(range: ActivityRange, params: unknown[], i: number) {
  const pFrom = i++, pTo = i++, pTz = i++, pUnit = i++;
  params.push(range.from, range.to, range.timezone, range.interval);
  return {
    i,
    ctes: `bounds AS (
        SELECT $${pFrom}::date AS d_from, $${pTo}::date AS d_to, $${pTz}::text AS tz, $${pUnit}::text AS unit
      ),
      buckets AS (
        SELECT gs::date AS bucket
        FROM bounds, generate_series(date_trunc(bounds.unit, bounds.d_from::timestamp),
                                     date_trunc(bounds.unit, bounds.d_to::timestamp),
                                     ('1 ' || bounds.unit)::interval) gs
      )`,
    inRange: (col: string) =>
      `${col} >= (b.d_from::timestamp AT TIME ZONE b.tz) AND ${col} < ((b.d_to + 1)::timestamp AT TIME ZONE b.tz)`,
    bucketOf: (col: string) => `date_trunc(b.unit, ${col} AT TIME ZONE b.tz)::date`,
    periodCols: `to_char(k.bucket, 'YYYY-MM-DD') AS date,
       to_char(GREATEST(k.bucket, b.d_from), 'YYYY-MM-DD') AS period_start,
       to_char(LEAST((k.bucket + ('1 ' || b.unit)::interval - INTERVAL '1 day')::date, b.d_to), 'YYYY-MM-DD') AS period_end`,
  };
}

export function activityMeta(range: ActivityRange) {
  return { from: range.from, to: range.to, timezone: range.timezone, interval: range.interval, days: range.days };
}
