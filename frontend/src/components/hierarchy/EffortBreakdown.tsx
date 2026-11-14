import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from 'recharts';
import { Layers } from 'lucide-react';
import { hierarchyApi } from '../../services/api';
import { Card, Skeleton, EmptyState } from '../ui';
import { cn } from '../../utils/formatters';
import type { EffortGroupBy, EffortRow } from '../../types';

const LEVELS: { key: EffortGroupBy; label: string }[] = [
  { key: 'department', label: 'Department' },
  { key: 'program', label: 'Program' },
  { key: 'baseline', label: 'Baseline' },
  { key: 'component', label: 'Component' },
  { key: 'subcomponent', label: 'Subcomponent' },
  { key: 'task', label: 'Task' },
];

const fmtNum = (n: number) => (Number.isFinite(n) ? n.toLocaleString(undefined, { maximumFractionDigits: 1 }) : '—');

interface Props {
  module: 'sp' | 'pe';
  /** Context + page filters (departmentId, programId, baselineId, from, …) */
  params: Record<string, unknown>;
  defaultGroupBy?: EffortGroupBy;
}

/**
 * Estimated vs Actual effort aggregated at Department / Program / Baseline / Component / Subcomponent /
 * Task level. SP reports hours, PE reports person-days — the two modules are aggregated independently.
 */
export function EffortBreakdown({ module, params, defaultGroupBy = 'program' }: Props) {
  const [groupBy, setGroupBy] = useState<EffortGroupBy>(defaultGroupBy);
  const { data, isLoading, error } = useQuery({
    queryKey: ['hierarchy-effort', module, groupBy, params],
    queryFn: () => hierarchyApi.effort({ module, groupBy, ...params }),
    retry: false,
  });

  const unit = data?.unit === 'person_days' ? 'PD' : 'hrs';
  // SP: Actual − Estimated · PE: Estimated − Actual. Colour by whether the work overran, not by sign.
  const estMinusAct = data?.variance_convention === 'estimated_minus_actual';
  const overran = (v: number) => (estMinusAct ? v < 0 : v > 0);
  const varianceTone = (v: number) => (Math.abs(v) < 1e-9 ? '' : overran(v) ? 'text-vibrant' : 'text-greenline');
  const varianceHeader = `Variance (${unit}, ${estMinusAct ? 'Est − Act' : 'Act − Est'})`;
  const rows: EffortRow[] = data?.data ?? [];
  const chartRows = rows.slice(0, 15).map(r => ({
    name: r.name.length > 22 ? `${r.name.slice(0, 21)}…` : r.name,
    Estimated: Number(r.estimated_completed.toFixed(2)),
    Actual: Number(r.actual_total.toFixed(2)),
  }));

  return (
    <Card padding="p-5" className="overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="font-display font-semibold text-carbon dark:text-white flex items-center gap-2">
            <Layers size={16} /> Estimated vs Actual by Hierarchy
          </h2>
          <p className="text-xs text-coolslate mt-0.5">
            Effort in {unit === 'PD' ? 'person-days' : 'hours'}. Variance and accuracy use only tasks with recorded actuals.
          </p>
        </div>
        <div className="flex flex-wrap gap-1 bg-lgrayblue/30 dark:bg-slate-700/40 rounded-lg p-1" role="tablist" aria-label="Group by">
          {LEVELS.map(l => (
            <button key={l.key} type="button" role="tab" aria-selected={groupBy === l.key}
              onClick={() => setGroupBy(l.key)}
              className={cn('px-2.5 py-1 rounded-md text-xs font-medium transition-all',
                groupBy === l.key ? 'bg-white dark:bg-carbon-700 text-carbon dark:text-white shadow-sm' : 'text-coolslate hover:text-carbon dark:hover:text-white')}>
              {l.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? <Skeleton className="h-56" /> : error ? (
        <p className="text-sm text-vibrant">{(error as Error).message}</p>
      ) : rows.length === 0 ? (
        <EmptyState icon={<Layers size={28} />} title="No tasks for this selection" message="Create tasks or widen the Department / Program / Baseline filter." />
      ) : (
        <>
          {groupBy !== 'task' && (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartRows} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(120,130,145,0.15)" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="Estimated" fill="#778FA5" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Actual" fill="#19AA6E" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
          <div className="overflow-x-auto mt-3">
            <table className="w-full text-sm" data-testid="effort-table">
              <thead>
                <tr className="border-b border-lgrayblue/30 dark:border-slate-700 text-left">
                  {[LEVELS.find(l => l.key === groupBy)!.label, 'Tasks', 'Completed', `Estimated (${unit})`, `Est. completed (${unit})`, `Actual (${unit})`, varianceHeader, 'Accuracy', 'Deviation'].map(h => (
                    <th key={h} className="px-3 py-2 text-xs font-semibold text-coolslate uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.id ?? `none-${i}`} className="border-b border-lgrayblue/10 dark:border-slate-700/30">
                    <td className="px-3 py-2 min-w-[10rem]">
                      <p className="font-medium text-carbon dark:text-white">{r.name}</p>
                      {groupBy !== 'department' && (
                        <p className="text-[11px] text-coolslate truncate max-w-[18rem]">
                          {[r.department_name, groupBy !== 'program' && r.program_name, ['component', 'subcomponent', 'task'].includes(groupBy) && r.baseline_name, ['subcomponent', 'task'].includes(groupBy) && r.component_name]
                            .filter(Boolean).join(' › ')}
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-2">{r.task_count}</td>
                    <td className="px-3 py-2">{r.completed_count}</td>
                    <td className="px-3 py-2">{fmtNum(r.estimated_total)}</td>
                    <td className="px-3 py-2">{fmtNum(r.estimated_completed)}</td>
                    <td className="px-3 py-2">{r.completed_count ? fmtNum(r.actual_total) : '—'}</td>
                    <td className={cn('px-3 py-2', r.completed_count ? varianceTone(r.variance) : '')}>
                      {r.completed_count ? `${r.variance > 0 ? '+' : ''}${fmtNum(r.variance)}` : '—'}
                    </td>
                    <td className="px-3 py-2">{r.accuracy_percent == null ? '—' : `${r.accuracy_percent.toFixed(1)}%`}</td>
                    <td className="px-3 py-2">{r.deviation_percent == null ? '—' : `${r.deviation_percent.toFixed(1)}%`}</td>
                  </tr>
                ))}
              </tbody>
              {data && (
                <tfoot>
                  <tr className="font-semibold bg-lgrayblue/10 dark:bg-carbon-800/40">
                    <td className="px-3 py-2">Total</td>
                    <td className="px-3 py-2">{data.totals.task_count}</td>
                    <td className="px-3 py-2">{data.totals.completed_count}</td>
                    <td className="px-3 py-2">{fmtNum(data.totals.estimated_total)}</td>
                    <td className="px-3 py-2">{fmtNum(data.totals.estimated_completed)}</td>
                    <td className="px-3 py-2">{fmtNum(data.totals.actual_total)}</td>
                    <td className={cn('px-3 py-2', data.totals.completed_count ? varianceTone(data.totals.variance) : '')}>{data.totals.completed_count ? `${data.totals.variance > 0 ? '+' : ''}${fmtNum(data.totals.variance)}` : '—'}</td>
                    <td className="px-3 py-2">{data.totals.accuracy_percent == null ? '—' : `${data.totals.accuracy_percent.toFixed(1)}%`}</td>
                    <td className="px-3 py-2">{data.totals.deviation_percent == null ? '—' : `${data.totals.deviation_percent.toFixed(1)}%`}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </>
      )}
    </Card>
  );
}
