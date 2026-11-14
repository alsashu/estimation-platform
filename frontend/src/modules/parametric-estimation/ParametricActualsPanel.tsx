import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Clock, Pencil, TrendingDown, TrendingUp, Target } from 'lucide-react';
import { parametricEstimationsApi } from '../../services/api';
import { useToastStore } from '../../store';
import { useAuthStore } from '../../store/authStore';
import { Badge, Button, Textarea } from '../../components/ui';
import { cn, fmt } from '../../utils/formatters';
import type { ParametricEstimation } from '../../types';

// ─── Pure helpers (exported for unit tests) ──────────────────────────────────

export interface ActualMetrics { variance_days: number; accuracy_percent: number | null; deviation_percent: number | null }

/**
 * Client-side preview of the server's metrics (services/parametricActuals.ts) so users see the effect
 * before saving. The server recomputes and is authoritative.
 *   Variance = Estimated − Actual · Deviation = |E − A| / E × 100 · Accuracy = max(0, 100 − Deviation)
 */
export function previewActualMetrics(estimated: number | null | undefined, actual: number): ActualMetrics | null {
  if (!Number.isFinite(actual) || actual <= 0) return null;
  const est = estimated == null ? NaN : Number(estimated);
  const r2 = (n: number) => Math.round(n * 100) / 100;
  if (!Number.isFinite(est) || est <= 0) {
    return { variance_days: r2((Number.isFinite(est) ? est : 0) - actual), accuracy_percent: null, deviation_percent: null };
  }
  const deviation = (Math.abs(est - actual) / est) * 100;
  return { variance_days: r2(est - actual), accuracy_percent: r2(Math.max(0, 100 - deviation)), deviation_percent: r2(deviation) };
}

/** Mirrors the API validation; returns an error message or null. */
export function validateActualDays(raw: string): string | null {
  if (raw.trim() === '') return 'Enter the actual effort in PersonDays';
  const n = Number(raw);
  if (!Number.isFinite(n)) return 'Actual effort must be a number';
  if (n <= 0) return 'Actual effort must be greater than 0';
  if (n > 100000) return 'Actual effort cannot exceed 100,000 PersonDays';
  if (Math.abs(n * 100 - Math.round(n * 100)) > 1e-6) return 'Use at most 2 decimal places';
  return null;
}

/** Same thresholds as the server notifications: ≥85 good, 70–85 fair, <70 poor. */
export function accuracyTone(acc: number | null | undefined): 'success' | 'warning' | 'danger' | 'neutral' {
  if (acc == null) return 'neutral';
  return acc >= 85 ? 'success' : acc >= 70 ? 'warning' : 'danger';
}

/** "+2.00 PD under estimate" / "−1.50 PD over estimate" / "On estimate" */
export function describeVariance(v: number): string {
  if (Math.abs(v) < 0.005) return 'On estimate';
  return `${v > 0 ? '+' : '−'}${Math.abs(v).toFixed(2)} PD ${v > 0 ? 'under' : 'over'} estimate`;
}

/**
 * One-decimal display that rounds half-up from the stored 2-dp value (85.35 → "85.4").
 * Plain toFixed(1) would print 85.3 because the float 85.35 is really 85.3499….
 */
export function fmt1(n: number | string): string {
  return (Math.round(Math.round(Number(n) * 100) / 10) / 10).toFixed(1);
}

const todayISO = () => new Date().toISOString().slice(0, 10);
const pd = (n: number | string | null | undefined) => (n == null ? '—' : `${Number(n).toFixed(2)} PD`);
const pct = (n: number | string | null | undefined) => (n == null ? 'Not Available' : `${fmt1(n)}%`);

// ─── Component ───────────────────────────────────────────────────────────────

function Metric({ label, value, sub, emphasis, tone }: {
  label: string; value: React.ReactNode; sub?: React.ReactNode; emphasis?: 'estimated' | 'actual'; tone?: string;
}) {
  return (
    <div className={cn('rounded-lg p-2.5 border',
      emphasis === 'estimated' && 'bg-lgrayblue/20 dark:bg-carbon-800/50 border-lgrayblue/40 dark:border-slate-700',
      emphasis === 'actual' && 'bg-greenline/5 dark:bg-greenline/10 border-greenline/30',
      !emphasis && 'bg-white dark:bg-carbon-800/30 border-lgrayblue/30 dark:border-slate-700')}>
      <p className="text-[11px] text-coolslate">{label}</p>
      <p className={cn('text-sm font-bold text-carbon dark:text-white', tone)}>{value}</p>
      {sub && <p className="text-[11px] text-coolslate mt-0.5">{sub}</p>}
    </div>
  );
}

export function ParametricActualsPanel({ row, onSaved }: { row: ParametricEstimation; onSaved: (r: ParametricEstimation) => void }) {
  const me = useAuthStore(s => s.user?.id);
  const canRecord = useAuthStore(s => s.hasPermission('parametric.create'));
  const canCorrectAny = useAuthStore(s => s.hasPermission('parametric.actuals.correct'));
  const recorded = row.actual_days != null;
  const canCorrect = canRecord && (canCorrectAny || (!!me && row.actuals_recorded_by === me));

  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(recorded ? String(Number(row.actual_days)) : '');
  const [notes, setNotes] = useState(row.actual_notes ?? '');
  const [completedOn, setCompletedOn] = useState(row.completed_at ? row.completed_at.slice(0, 10) : todayISO());
  const [touched, setTouched] = useState(false);

  const qc = useQueryClient();
  const { addToast } = useToastStore();
  const estimated = Number(row.final_estimation);
  const error = validateActualDays(value);
  const preview = error ? null : previewActualMetrics(estimated, Number(value));
  const createdOn = row.created_at?.slice(0, 10);

  const mut = useMutation({
    mutationFn: () => parametricEstimationsApi.recordActuals(row.id, {
      actual_days: Number(value),
      notes: notes.trim() === '' ? null : notes.trim(),
      completed_at: completedOn,
    }),
    onSuccess: (saved) => {
      addToast({
        type: 'success',
        title: recorded ? 'Actual effort corrected' : 'Actual effort recorded',
        message: saved.accuracy_percent != null ? `${fmt1(saved.accuracy_percent)}% accuracy` : undefined,
      });
      // History, dashboard, analytics and effort-breakdown queries all depend on actuals
      qc.invalidateQueries({ predicate: q => { const k = String(q.queryKey[0] ?? ''); return k.startsWith('parametric') || k === 'hierarchy-effort'; } });
      setEditing(false);
      setTouched(false);
      onSaved({ ...row, ...saved });
    },
    onError: (e: Error) => addToast({ type: 'error', title: 'Failed to save actual effort', message: e.message }),
  });

  const showForm = canRecord && (!recorded || editing);
  const acc = row.accuracy_percent == null ? null : Number(row.accuracy_percent);
  const variance = row.variance_days == null ? null : Number(row.variance_days);

  return (
    <section aria-label="Estimated vs Actual" data-testid="pe-actuals-panel">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-coolslate uppercase tracking-wide">Estimated vs Actual (PersonDays)</p>
        {recorded
          ? <Badge variant="success"><CheckCircle2 size={11} /> Completed</Badge>
          : <Badge variant="neutral"><Clock size={11} /> Awaiting actuals</Badge>}
      </div>

      {/* Summary — before actuals: Estimated / Not Recorded / Not Available */}
      <div className={cn('grid gap-2 mb-3', recorded ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-3')}>
        <Metric emphasis="estimated" label="Estimated PersonDays" value={pd(estimated)} sub="Final Estimation" />
        <Metric emphasis="actual" label="Actual PersonDays" value={recorded ? pd(row.actual_days) : 'Not Recorded'}
          tone={recorded ? undefined : 'text-coolslate font-medium'} />
        <Metric label="Accuracy" value={recorded ? pct(acc) : 'Not Available'}
          tone={recorded ? { success: 'text-greenline', warning: 'text-gold-600 dark:text-mutedgold', danger: 'text-vibrant', neutral: '' }[accuracyTone(acc)] : 'text-coolslate font-medium'} />
        {recorded && (
          <>
            <Metric label="Variance (PD)" value={variance == null ? '—' : `${variance > 0 ? '+' : ''}${variance.toFixed(2)}`}
              sub={variance == null ? undefined : describeVariance(variance)}
              tone={variance == null ? '' : variance >= 0 ? 'text-greenline' : 'text-vibrant'} />
            <Metric label="Deviation" value={pct(row.deviation_percent)} sub="|Estimated − Actual| / Estimated" />
            <Metric label="Completed on" value={row.completed_at ? fmt.date(row.completed_at) : '—'} />
          </>
        )}
      </div>

      {recorded && !editing && (
        <div className="space-y-2 mb-3">
          {row.actual_notes && (
            <div className="rounded-lg bg-lgrayblue/10 dark:bg-carbon-800/40 p-2.5">
              <p className="text-[11px] text-coolslate mb-0.5">Notes</p>
              <p className="text-sm text-carbon dark:text-lgrayblue whitespace-pre-wrap">{row.actual_notes}</p>
            </div>
          )}
          <div className="text-[11px] text-coolslate space-y-0.5" data-testid="pe-actuals-audit">
            {row.actuals_recorded_at && (
              <p>Recorded by <span className="font-medium text-carbon dark:text-lgrayblue">{row.actuals_recorded_by_name ?? 'Unknown user'}</span> on {fmt.datetime(row.actuals_recorded_at)}</p>
            )}
            {row.actuals_updated_at && (
              <p>Last corrected by <span className="font-medium text-carbon dark:text-lgrayblue">{row.actuals_updated_by_name ?? 'Unknown user'}</span> on {fmt.datetime(row.actuals_updated_at)}</p>
            )}
          </div>
          {canCorrect && (
            <Button size="sm" variant="outline" icon={<Pencil size={13} />} onClick={() => setEditing(true)}>Correct actuals</Button>
          )}
          {canRecord && !canCorrect && (
            <p className="text-[11px] text-coolslate">Only the user who recorded these actuals or an administrator can correct them.</p>
          )}
        </div>
      )}

      {showForm && (
        <form className="space-y-3 rounded-lg border border-lgrayblue/40 dark:border-slate-700 p-3"
          onSubmit={(e) => { e.preventDefault(); setTouched(true); if (!error) mut.mutate(); }}>
          <p className="text-xs font-semibold text-carbon dark:text-white">{recorded ? 'Correct actual effort' : 'Record actual effort'}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-sm font-medium text-carbon dark:text-lgrayblue">
              Actual effort (PD) <span className="sr-only">required</span>
              <input type="number" inputMode="decimal" min="0.01" step="0.01" value={value}
                onChange={e => setValue(e.target.value)} onBlur={() => setTouched(true)}
                aria-label="Actual effort in PersonDays" aria-invalid={touched && !!error}
                placeholder="e.g. 12.5"
                className={cn('px-3 py-2 rounded-lg border bg-white dark:bg-carbon-800 text-sm text-carbon dark:text-white font-normal',
                  touched && error ? 'border-vibrant' : 'border-lgrayblue dark:border-slate-600')} />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium text-carbon dark:text-lgrayblue">
              Completed on
              <input type="date" value={completedOn} max={todayISO()} min={createdOn}
                onChange={e => setCompletedOn(e.target.value)} aria-label="Completion date"
                className="px-3 py-2 rounded-lg border border-lgrayblue dark:border-slate-600 bg-white dark:bg-carbon-800 text-sm text-carbon dark:text-white font-normal" />
            </label>
          </div>
          {touched && error && <p className="text-xs text-vibrant" role="alert">{error}</p>}

          {preview && (
            <div className="flex flex-wrap items-center gap-2 text-xs" data-testid="pe-actuals-preview">
              <span className="text-coolslate">Preview:</span>
              <Badge variant={accuracyTone(preview.accuracy_percent)}><Target size={11} /> {pct(preview.accuracy_percent)} accuracy</Badge>
              <Badge variant={preview.variance_days >= 0 ? 'success' : 'danger'}>
                {preview.variance_days >= 0 ? <TrendingDown size={11} /> : <TrendingUp size={11} />} {describeVariance(preview.variance_days)}
              </Badge>
              {preview.deviation_percent != null && <Badge variant="neutral">{fmt1(preview.deviation_percent)}% deviation</Badge>}
            </div>
          )}

          <Textarea label="Notes (optional)" rows={2} maxLength={2000} value={notes} onChange={e => setNotes(e.target.value)}
            placeholder="What drove the difference from the estimate?" />

          <div className="flex gap-2 justify-end">
            {editing && <Button type="button" size="sm" variant="ghost" onClick={() => { setEditing(false); setValue(String(Number(row.actual_days))); setNotes(row.actual_notes ?? ''); }}>Cancel</Button>}
            <Button type="submit" size="sm" loading={mut.isPending} disabled={!!error && touched}>
              {recorded ? 'Save correction' : 'Save Actual'}
            </Button>
          </div>
          <p className="text-[11px] text-coolslate">The original estimate and its calculation breakdown are never changed by recording actuals.</p>
        </form>
      )}

      {!canRecord && !recorded && (
        <p className="text-[11px] text-coolslate">You do not have permission to record actual effort.</p>
      )}
    </section>
  );
}
