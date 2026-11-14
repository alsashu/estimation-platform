import { useId, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CalendarRange, RotateCcw, BarChart3, AlertCircle } from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { Card, Button, Skeleton } from '../ui';
import { cn } from '../../utils/formatters';
import { useTheme } from '../../hooks/useTheme';
import type { ActivityBucket, ActivityResponse, ActivityInterval } from '../../types';
import {
  defaultActivityRange, validateActivityRange, hasErrors, isDefaultRange, intervalFor, toISODate,
  browserTimeZone, formatTick, formatPeriod, formatDisplayDate, INTERVAL_ADJECTIVE, type DateRange,
} from './activityRange';

export interface ActivitySeries<P> {
  key: keyof P & string;
  name: string;
  color: { light: string; dark: string };
}

interface Props<P extends ActivityBucket> {
  /** React Query key prefix — keep 'trend' / 'parametric-trend' so existing invalidation still matches. */
  queryKey: string;
  /** Department / Program / Baseline params from the page filter. */
  scope: Record<string, unknown>;
  fetchActivity: (params: Record<string, unknown>) => Promise<ActivityResponse<P>>;
  series: ActivitySeries<P>[];
  /** "estimations" / "parametric estimations" — used in the subtitle and empty state. */
  noun: string;
  badge?: ReactNode;
  /** Extra tooltip lines (e.g. Manual / Excel split). */
  tooltipDetails?: (p: P) => { label: string; value: number | string }[];
}

function errorMessage(err: unknown): string {
  const e = err as { response?: { data?: { error?: string } }; message?: string };
  return e?.response?.data?.error || e?.message || 'Could not load estimation activity';
}

const inputCls = (err?: string) => cn(
  'w-full sm:w-40 rounded-lg border text-sm px-3 py-1.5 bg-white dark:bg-carbon-800 text-carbon dark:text-white focus:outline-none focus:ring-2 transition-colors [color-scheme:light] dark:[color-scheme:dark]',
  err ? 'border-vibrant focus:ring-vibrant/30' : 'border-lgrayblue dark:border-slate-600 focus:border-carbon dark:focus:border-lgrayblue focus:ring-carbon/20',
);

export function EstimationActivityCard<P extends ActivityBucket>({
  queryKey, scope, fetchActivity, series, noun, badge, tooltipDetails,
}: Props<P>) {
  const { isDark } = useTheme();
  const gid = useId().replace(/:/g, '');
  const today = toISODate(new Date());
  const tz = useMemo(browserTimeZone, []);

  const [draft, setDraft] = useState<DateRange>(() => defaultActivityRange(today));
  const [applied, setApplied] = useState<DateRange>(() => defaultActivityRange(today));
  const [touched, setTouched] = useState(false);

  const errors = validateActivityRange(draft, today);
  const invalid = hasErrors(errors);
  const dirty = draft.from !== applied.from || draft.to !== applied.to;

  const { data, isLoading, isError, error, isFetching } = useQuery({
    queryKey: [queryKey, JSON.stringify(scope), applied.from, applied.to, tz],
    queryFn: () => fetchActivity({ ...scope, from: applied.from, to: applied.to, tz }),
    retry: false,
    placeholderData: (prev) => prev,
  });

  const points = data?.data ?? [];
  const interval: ActivityInterval = data?.meta.interval ?? intervalFor(applied);
  const isEmpty = points.length > 0 && points.every((p) => series.every((s) => !Number(p[s.key])));

  const apply = (e?: FormEvent) => {
    e?.preventDefault();
    setTouched(true);
    if (invalid) return;
    setApplied(draft);
  };
  const reset = () => {
    const d = defaultActivityRange(toISODate(new Date()));
    setDraft(d); setApplied(d); setTouched(false);
  };
  const showErr = (k: 'from' | 'to') => (touched || dirty) && errors[k];
  const fromErr = showErr('from') || undefined;
  const toErr = showErr('to') || undefined;
  const rangeMessage = fromErr || toErr; // an inverted range sets both; one message is enough

  const axis = isDark ? '#A5AFB9' : '#788291';
  const colorOf = (s: ActivitySeries<P>) => (isDark ? s.color.dark : s.color.light);

  return (
    <Card className="xl:col-span-2" padding="p-5">
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2 mb-3">
        <div className="min-w-0">
          <h2 className="font-display font-semibold text-carbon dark:text-white">Estimation Activity</h2>
          <p className="text-xs text-coolslate mt-0.5" data-testid="activity-subtitle">
            {INTERVAL_ADJECTIVE[interval]} {noun} over the selected period
            <span className="hidden sm:inline"> · {formatDisplayDate(applied.from)} – {formatDisplayDate(applied.to)}</span>
          </p>
        </div>
        {badge}
      </div>

      <form onSubmit={apply} noValidate className="flex flex-wrap items-end gap-2 mb-1" aria-label="Estimation activity date range">
        <label className="flex flex-col gap-1 text-[11px] font-medium text-coolslate w-full sm:w-auto">
          From Date
          <input type="date" aria-label="From Date" value={draft.from} max={draft.to && draft.to < today ? draft.to : today}
            aria-invalid={Boolean(fromErr)} className={inputCls(fromErr)}
            onChange={(e) => setDraft((d) => ({ ...d, from: e.target.value }))} />
        </label>
        <label className="flex flex-col gap-1 text-[11px] font-medium text-coolslate w-full sm:w-auto">
          To Date
          <input type="date" aria-label="To Date" value={draft.to} min={draft.from || undefined} max={today}
            aria-invalid={Boolean(toErr)} className={inputCls(toErr)}
            onChange={(e) => setDraft((d) => ({ ...d, to: e.target.value }))} />
        </label>
        <div className="flex gap-2">
          <Button type="submit" size="xs" icon={<CalendarRange size={13} />} disabled={invalid || !dirty} loading={isFetching && !isLoading}>
            Apply
          </Button>
          <Button type="button" size="xs" variant="outline" icon={<RotateCcw size={13} />} onClick={reset}
            disabled={isDefaultRange(applied, today) && isDefaultRange(draft, today)}>
            Reset
          </Button>
        </div>
      </form>
      <div className="min-h-[18px] mb-2">
        {rangeMessage && (
          <p role="alert" className="text-xs text-vibrant flex items-center gap-1"><AlertCircle size={12} />{rangeMessage}</p>
        )}
      </div>

      {series.length > 1 && (
        <div className="flex items-center gap-4 mb-2 text-xs text-coolslate" aria-hidden>
          {series.map((s) => (
            <span key={s.key} className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-0.5 rounded" style={{ background: colorOf(s) }} />{s.name}
            </span>
          ))}
        </div>
      )}

      {isLoading ? <Skeleton className="h-48" /> : isError ? (
        <div className="flex flex-col items-center justify-center h-[200px] text-vibrant text-xs gap-2">
          <AlertCircle size={24} className="opacity-60" />{errorMessage(error)}
        </div>
      ) : isEmpty ? (
        <div className="flex flex-col items-center justify-center h-[200px] text-coolslate text-center" data-testid="activity-empty">
          <BarChart3 size={28} className="opacity-30 mb-2" />
          <p className="text-sm">No {noun} between {formatDisplayDate(applied.from)} and {formatDisplayDate(applied.to)}</p>
          <p className="text-xs mt-1">Try a wider date range or different filters.</p>
        </div>
      ) : (
        <div className={cn('transition-opacity', isFetching && 'opacity-60')}>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={points} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
              <defs>
                {series.map((s) => (
                  <linearGradient key={s.key} id={`${gid}-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={colorOf(s)} stopOpacity={0.15} />
                    <stop offset="95%" stopColor={colorOf(s)} stopOpacity={0} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(120,130,145,0.1)" />
              <XAxis dataKey="date" tickFormatter={(v) => formatTick(String(v), interval)} minTickGap={18}
                tick={{ fontSize: 11, fill: axis }} axisLine={false} tickLine={false} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: axis }} axisLine={false} tickLine={false} />
              <Tooltip
                cursor={{ stroke: axis, strokeOpacity: 0.4 }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const p = payload[0].payload as P;
                  return (
                    <div className="rounded-[10px] border border-lgrayblue dark:border-slate-600 bg-white dark:bg-carbon-800 px-3 py-2 text-xs shadow-card">
                      <p className="font-semibold text-carbon dark:text-white mb-1">{formatPeriod(p, interval)}</p>
                      {series.map((s) => (
                        <p key={s.key} className="flex items-center justify-between gap-4 text-coolslate">
                          <span className="flex items-center gap-1.5">
                            <span className="inline-block w-2 h-2 rounded-full" style={{ background: colorOf(s) }} />{s.name}
                          </span>
                          <span className="font-semibold text-carbon dark:text-white">{Number(p[s.key])}</span>
                        </p>
                      ))}
                      {tooltipDetails?.(p).map((d) => (
                        <p key={d.label} className="flex items-center justify-between gap-4 text-coolslate pl-3.5">
                          <span>{d.label}</span><span className="text-carbon dark:text-white">{d.value}</span>
                        </p>
                      ))}
                    </div>
                  );
                }}
              />
              {series.map((s) => (
                <Area key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={colorOf(s)} strokeWidth={2}
                  fill={`url(#${gid}-${s.key})`} dot={points.length <= 2 ? { r: 4, fill: colorOf(s) } : false}
                  activeDot={{ r: 4 }} isAnimationActive={false} />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}
