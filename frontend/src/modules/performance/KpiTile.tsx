import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Info, ArrowUpRight, ArrowDownRight, Minus, CheckCircle2, AlertTriangle, XCircle, CircleSlash } from 'lucide-react';
import { cn } from '../../utils/formatters';
import { useTheme } from '../../hooks/useTheme';
import { explainKpi, fmtPct, fmtPp, KPI_DEFS, STATUS_LABEL, trendDelta, type Explanation } from './kpiFormat';
import { KPI_COLORS, STATUS_COLORS } from './palette';
import type { KpiKey, KpiStatus, PerformanceDashboard } from './types';

const STATUS_ICON: Record<KpiStatus, React.ElementType> = {
  good: CheckCircle2, warning: AlertTriangle, critical: XCircle, na: CircleSlash,
};

export function StatusChip({ status }: { status: KpiStatus }) {
  const { isDark } = useTheme();
  const Icon = STATUS_ICON[status];
  const color = status === 'na' ? (isDark ? '#A5AFB9' : '#788291') : STATUS_COLORS[isDark ? 'dark' : 'light'][status];
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-carbon dark:text-lgrayblue" data-testid="kpi-status">
      <Icon size={12} style={{ color }} aria-hidden />
      {STATUS_LABEL[status]}
    </span>
  );
}

/** The calculation card rendered inside the tooltip (and at the top of the KPI detail drawer). */
export function KpiCalculation({ ex, compact }: { ex: Explanation; compact?: boolean }) {
  return (
    <div className={cn('text-left', compact ? 'space-y-2.5' : 'space-y-3')} data-testid="kpi-calculation">
      <div className="rounded-lg bg-lgrayblue/25 dark:bg-white/5 px-3 py-2 font-mono text-[11.5px] leading-relaxed text-carbon dark:text-white">
        {ex.formula.map(f => <div key={f}>{f}</div>)}
      </div>
      {ex.inputs.length > 0 && (
        <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-xs">
          {ex.inputs.map(i => (
            <div key={i.label} className="contents">
              <dt className="text-coolslate">{i.label}</dt>
              <dd className="font-semibold tabular-nums text-carbon dark:text-white text-right">{i.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {ex.na ? (
        <div className="rounded-lg border border-dashed border-lgrayblue dark:border-slate-600 px-3 py-2 text-xs" role="note">
          <p className="font-semibold text-carbon dark:text-white">Result: N/A</p>
          <p className="text-coolslate mt-0.5">{ex.na}</p>
        </div>
      ) : (
        <div className="font-mono text-[11.5px] leading-relaxed text-carbon dark:text-lgrayblue border-l-2 border-lgrayblue dark:border-slate-600 pl-3">
          {ex.steps.map((s, i) => <div key={i}>{s}</div>)}
          <div className="mt-1 font-sans text-sm font-bold text-carbon dark:text-white" data-testid="kpi-calc-result">= {ex.result}</div>
        </div>
      )}
      {!ex.na && <p className="text-xs text-coolslate leading-snug">{ex.interpretation}</p>}
      <dl className="pt-2 border-t border-lgrayblue/40 dark:border-slate-700 space-y-0.5 text-[11px]">
        {ex.sources.map(s => (
          <div key={s.label} className="flex gap-2">
            <dt className="text-coolslate flex-shrink-0">{s.label}:</dt>
            <dd className="text-carbon dark:text-lgrayblue">{s.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

interface PopoverProps {
  anchor: HTMLElement | null;
  open: boolean;
  id: string;
  children: React.ReactNode;
  onPointerEnter: () => void;
  onPointerLeave: () => void;
}

/** Portal popover positioned against the viewport so it is never clipped by cards or scroll containers. */
function Popover({ anchor, open, id, children, onPointerEnter, onPointerLeave }: PopoverProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);

  useLayoutEffect(() => {
    if (!open || !anchor) { setPos(null); return; }
    const place = () => {
      const r = anchor.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const width = Math.min(400, vw - 24);
      const h = ref.current?.offsetHeight ?? 320;
      let left = r.left + r.width / 2 - width / 2;
      left = Math.max(12, Math.min(left, vw - width - 12));
      const below = r.bottom + 8;
      const top = below + h <= vh - 8 || r.top - h - 8 < 8 ? Math.min(below, Math.max(8, vh - h - 8)) : r.top - h - 8;
      setPos({ top, left, width });
    };
    place();
    const raf = requestAnimationFrame(place); // re-measure with real height
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
  }, [open, anchor]);

  if (!open) return null;
  return createPortal(
    <div
      ref={ref}
      id={id}
      role="tooltip"
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      style={{ position: 'fixed', top: pos?.top ?? -9999, left: pos?.left ?? -9999, width: pos?.width ?? 380, zIndex: 9999 }}
      className="max-h-[80vh] overflow-y-auto rounded-xl bg-white dark:bg-carbon-800 border border-lgrayblue/60 dark:border-slate-600 shadow-modal p-4 animate-fade-in"
    >
      {children}
    </div>,
    document.body,
  );
}

interface TileProps {
  kpi: KpiKey;
  data: PerformanceDashboard;
  onOpen: (k: KpiKey) => void;
}

export function KpiTile({ kpi, data, onOpen }: TileProps) {
  const { isDark } = useTheme();
  const def = KPI_DEFS[kpi];
  const summary = data.summary[kpi];
  const value = summary.value;
  const prev = data.previous[kpi];
  const delta = trendDelta(value, prev, kpi);
  const accent = KPI_COLORS[kpi][isDark ? 'dark' : 'light'];
  const tipId = useId();

  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const tileRef = useRef<HTMLDivElement>(null);
  const timer = useRef<number>();

  const show = useCallback(() => { window.clearTimeout(timer.current); timer.current = window.setTimeout(() => setOpen(true), 120); }, []);
  const hide = useCallback(() => {
    window.clearTimeout(timer.current);
    if (pinned) return;
    timer.current = window.setTimeout(() => setOpen(false), 140);
  }, [pinned]);
  const keep = useCallback(() => window.clearTimeout(timer.current), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); setPinned(false); } };
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (tileRef.current?.contains(t) || document.getElementById(tipId)?.contains(t)) return;
      setOpen(false); setPinned(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('pointerdown', onDown); };
  }, [open, tipId]);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const display = kpi === 'ed' ? fmtPct(value, 2, true) : fmtPct(value, 2);
  const sub = kpi === 'ed'
    ? `Absolute ${fmtPct(data.summary.ed.absolute)} · ${data.summary.ed.under_count} under / ${data.summary.ed.over_count} over`
    : kpi === 'ebi'
      ? `Historical ${fmtPct(data.summary.ebi.historical_ed)} → Current ${fmtPct(data.summary.ebi.current_ed)}`
      : kpi === 'efa'
        ? `Framework ED ${fmtPct(data.summary.efa.framework_aggregate_ed)} · ${data.summary.framework.record_count} records`
        : `Aggregate ED ${fmtPct(data.summary.eei.aggregate_ed)} · ${data.summary.eligible.record_count} records`;

  const TrendIcon = !delta || delta.flat ? Minus : delta.delta > 0 ? ArrowUpRight : ArrowDownRight;

  return (
    <div
      ref={tileRef}
      onPointerEnter={(e) => { if (e.pointerType === 'mouse') show(); }}
      onPointerLeave={(e) => { if (e.pointerType === 'mouse') hide(); }}
      className="relative"
    >
      <button
        type="button"
        onClick={() => onOpen(kpi)}
        aria-describedby={open ? tipId : undefined}
        data-testid={`kpi-tile-${kpi}`}
        className="w-full text-left rounded-2xl bg-white dark:bg-carbon-700 border border-lgrayblue/40 dark:border-slate-700 shadow-card hover:shadow-card-hover hover:border-lgrayblue dark:hover:border-slate-500 transition-all p-4 pr-11 focus:outline-none focus-visible:ring-2 focus-visible:ring-carbon/30"
        style={{ borderTop: `3px solid ${accent}` }}
      >
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold tracking-wide" style={{ color: accent }}>{def.short}</span>
          <span className="text-[11px] text-coolslate truncate">{def.name}</span>
        </div>
        <p className={cn('mt-1.5 text-3xl font-display font-bold tabular-nums', value == null ? 'text-coolslate' : 'text-carbon dark:text-white')} data-testid={`kpi-value-${kpi}`}>
          {display}
        </p>
        <p className="text-xs font-medium text-carbon dark:text-lgrayblue">{def.caption}</p>
        <p className="text-[11px] text-coolslate mt-0.5 truncate" title={sub}>{sub}</p>
        <div className="flex items-center justify-between gap-2 mt-3 pt-2.5 border-t border-lgrayblue/30 dark:border-slate-700">
          <StatusChip status={summary.status} />
          <span className="inline-flex items-center gap-0.5 text-[11px] text-coolslate tabular-nums" data-testid={`kpi-trend-${kpi}`}
            title={`Previous period ${data.meta.previous.from} – ${data.meta.previous.to}: ${fmtPct(prev)}`}>
            {delta ? (
              <>
                <TrendIcon size={12} className={cn(delta.flat ? '' : delta.improved ? 'text-greenline-700 dark:text-greenline' : 'text-vibrant-600 dark:text-vibrant-300')} aria-hidden />
                {fmtPp(delta.delta)} <span className="hidden sm:inline">vs prev.</span>
              </>
            ) : 'No previous data'}
          </span>
        </div>
      </button>
      <button
        type="button"
        aria-label={`How ${def.short} is calculated`}
        aria-expanded={open}
        aria-controls={open ? tipId : undefined}
        data-testid={`kpi-info-${kpi}`}
        onClick={(e) => { e.stopPropagation(); const next = !(open && pinned); setPinned(next); setOpen(next); }}
        className="absolute top-3 right-3 p-1.5 rounded-lg text-coolslate hover:text-carbon dark:hover:text-white hover:bg-lgrayblue/40 dark:hover:bg-slate-600 transition-colors"
      >
        <Info size={15} />
      </button>
      <Popover anchor={tileRef.current} open={open} id={tipId} onPointerEnter={keep} onPointerLeave={hide}>
        <p className="text-sm font-display font-semibold text-carbon dark:text-white">{def.name} ({def.short})</p>
        <p className="text-xs text-coolslate mt-0.5 mb-3">{def.purpose}</p>
        <KpiCalculation ex={explainKpi(data, kpi)} compact />
      </Popover>
    </div>
  );
}
