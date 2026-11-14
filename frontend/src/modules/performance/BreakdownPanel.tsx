import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Download, Layers } from 'lucide-react';
import { Button, Card, Skeleton } from '../../components/ui';
import { cn } from '../../utils/formatters';
import { performanceApi } from '../../services/api';
import { csvNum, downloadCsv, EBI_NA_TEXT, fmtNum, fmtPct, toCsv, type CsvColumn } from './kpiFormat';
import type { GroupRow, PerfGroupBy, TaskRow } from './types';

export interface DrillStep { level: PerfGroupBy; label: string; params: Record<string, string> }

const NEXT: Record<PerfGroupBy, PerfGroupBy | null> = { department: 'program', program: 'baseline', baseline: 'task', task: null };
const LEVEL_LABEL: Record<PerfGroupBy, string> = { department: 'Department', program: 'Program', baseline: 'Baseline', task: 'Task' };

/** Query params that narrow the scope to one row of a level. */
export function drillParams(level: PerfGroupBy, row: GroupRow): Record<string, string> | null {
  if (level === 'department') return row.department_id ? { departmentId: row.department_id } : null;
  if (level === 'program') return row.program_id ? { programIds: row.program_id } : null;
  if (level === 'baseline') return row.id ? { baselineId: row.id } : null;
  return null;
}

const DIRECTION_TEXT = { under: 'Under', over: 'Over', on_target: 'On target' } as const;

export const BREAKDOWN_COLUMNS: CsvColumn<GroupRow | TaskRow>[] = [
  { header: 'Name', value: r => r.name },
  { header: 'Department', value: r => r.department_name ?? '' },
  { header: 'Program', value: r => r.program_name ?? '' },
  { header: 'Method', value: r => r.method ?? '' },
  { header: 'Records', value: r => r.record_count },
  { header: 'Framework records', value: r => r.framework_record_count },
  { header: 'Estimated PD', value: r => csvNum(r.total_estimated_pd) },
  { header: 'Actual PD', value: r => csvNum(r.total_actual_pd) },
  { header: 'Absolute error PD', value: r => csvNum(r.total_abs_error_pd) },
  { header: 'ED %', value: r => csvNum(r.ed) },
  { header: 'Aggregate ED %', value: r => csvNum(r.aggregate_ed) },
  { header: 'EFA %', value: r => csvNum(r.efa) },
  { header: 'EBI %', value: r => csvNum(r.ebi) },
  { header: 'EEI %', value: r => csvNum(r.eei) },
  { header: 'Historical ED %', value: r => csvNum(r.historical_ed) },
  { header: 'Underestimated', value: r => r.under_count },
  { header: 'Overestimated', value: r => r.over_count },
  { header: 'On target', value: r => r.on_target_count },
  { header: 'Framework aligned', value: r => ('framework_aligned' in r ? (r.framework_aligned ? 'yes' : 'no') : '') },
  { header: 'Source', value: r => ('source' in r ? r.source : '') },
  { header: 'Completed at', value: r => ('completed_at' in r ? r.completed_at : '') },
];

interface Props {
  /** Page filters (departmentId, programIds, baselineId, from, to, tz, method). */
  scope: Record<string, unknown>;
  path: DrillStep[];
  onPathChange: (p: DrillStep[]) => void;
  /** Starting level for the current page filter (program when a department is selected, etc.). */
  rootLevel: PerfGroupBy;
  /** Disable live drill-down (e.g. while viewing a snapshot). */
  disabled?: boolean;
}

export function BreakdownPanel({ scope, path, onPathChange, rootLevel, disabled }: Props) {
  const level: PerfGroupBy = path.length ? (NEXT[path[path.length - 1].level] ?? 'task') : rootLevel;
  const params = useMemo(() => Object.assign({}, scope, ...path.map(p => p.params), { groupBy: level }),
    [scope, path, level]);
  const [sortKey, setSortKey] = useState<'name' | 'aggregate_ed' | 'ed' | 'eei'>('name');

  const { data, isLoading, isError } = useQuery({
    queryKey: ['performance', 'breakdown', JSON.stringify(params)],
    queryFn: () => performanceApi.breakdown<GroupRow | TaskRow>(params as Record<string, unknown> & { groupBy: PerfGroupBy }),
    enabled: !disabled,
    placeholderData: (prev) => prev,
  });

  const rows = useMemo(() => {
    const list = [...(data?.data ?? [])];
    if (sortKey === 'name') return list;
    return list.sort((a, b) => {
      const va = a[sortKey], vb = b[sortKey];
      if (va == null) return 1;
      if (vb == null) return -1;
      return sortKey === 'eei' ? vb - va : Math.abs(vb) - Math.abs(va);
    });
  }, [data, sortKey]);

  const drill = (row: GroupRow) => {
    const p = drillParams(level, row);
    if (!p || !NEXT[level]) return;
    onPathChange([...path, { level, label: row.name, params: p }]);
  };

  const exportCsv = () => {
    const name = ['estimation-performance', level, ...path.map(p => p.label)].join('-').replace(/[^\w-]+/g, '_');
    downloadCsv(`${name}.csv`, toCsv(rows, BREAKDOWN_COLUMNS));
  };

  const isTask = level === 'task';
  return (
    <Card padding="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <h3 className="font-display font-semibold text-carbon dark:text-white">Drill-down</h3>
          <nav aria-label="Drill-down path" className="flex flex-wrap items-center gap-1 text-xs mt-1">
            <button type="button" onClick={() => onPathChange([])} className={cn('font-medium', path.length ? 'text-carbon dark:text-lgrayblue underline underline-offset-2' : 'text-coolslate')}>
              All {LEVEL_LABEL[rootLevel]}s
            </button>
            {path.map((p, i) => (
              <span key={i} className="inline-flex items-center gap-1">
                <ChevronRight size={12} className="text-coolslate" />
                <button type="button" onClick={() => onPathChange(path.slice(0, i + 1))}
                  className={cn('font-medium', i < path.length - 1 ? 'text-carbon dark:text-lgrayblue underline underline-offset-2' : 'text-coolslate')}>
                  {p.label}
                </button>
              </span>
            ))}
            <ChevronRight size={12} className="text-coolslate" />
            <span className="text-coolslate">{LEVEL_LABEL[level]}s</span>
          </nav>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs text-coolslate flex items-center gap-1.5">
            Sort
            <select value={sortKey} onChange={e => setSortKey(e.target.value as typeof sortKey)}
              className="text-xs rounded-md border border-lgrayblue dark:border-slate-600 bg-white dark:bg-carbon-800 text-carbon dark:text-white px-2 py-1">
              <option value="name">Name</option>
              <option value="aggregate_ed">Highest deviation</option>
              <option value="ed">Largest signed ED</option>
              <option value="eei">Best EEI</option>
            </select>
          </label>
          <Button size="xs" variant="outline" icon={<Download size={13} />} onClick={exportCsv} disabled={!rows.length} data-testid="export-breakdown">
            Export CSV
          </Button>
        </div>
      </div>

      {disabled ? (
        <p className="text-xs text-coolslate py-6 text-center">Drill-down uses live data — return to the live dashboard to explore.</p>
      ) : isLoading ? <Skeleton className="h-40" /> : isError ? (
        <p className="text-xs text-vibrant py-6 text-center">Could not load the breakdown.</p>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center py-10 text-coolslate text-center">
          <Layers size={24} className="opacity-30 mb-2" />
          <p className="text-sm">No eligible records at this level for the selected filters.</p>
        </div>
      ) : (
        <div className="overflow-x-auto -mx-5 px-5">
          <table className="w-full text-xs" data-testid="breakdown-table">
            <thead>
              <tr className="text-left text-coolslate border-b border-lgrayblue/40 dark:border-slate-700">
                <th className="py-2 pr-3 font-medium">{LEVEL_LABEL[level]}</th>
                {isTask && <th className="py-2 pr-3 font-medium">Method</th>}
                <th className="py-2 pr-3 font-medium text-right">Records</th>
                <th className="py-2 pr-3 font-medium text-right">Est. PD</th>
                <th className="py-2 pr-3 font-medium text-right">Actual PD</th>
                <th className="py-2 pr-3 font-medium text-right">|Error| PD</th>
                <th className="py-2 pr-3 font-medium text-right">ED</th>
                <th className="py-2 pr-3 font-medium text-right">EFA</th>
                <th className="py-2 pr-3 font-medium text-right">EBI</th>
                <th className="py-2 pr-3 font-medium text-right">EEI</th>
                {isTask && <th className="py-2 pr-3 font-medium">Direction</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const canDrill = !isTask && !!drillParams(level, r);
                const t = r as TaskRow;
                return (
                  <tr key={`${r.id}-${i}`} className="border-b border-lgrayblue/20 dark:border-slate-700/60 hover:bg-lgrayblue/10 dark:hover:bg-white/5">
                    <td className="py-2 pr-3">
                      {canDrill ? (
                        <button type="button" onClick={() => drill(r)} className="font-medium text-carbon dark:text-white hover:underline underline-offset-2 inline-flex items-center gap-1 text-left">
                          {r.name}<ChevronRight size={12} className="text-coolslate" />
                        </button>
                      ) : (
                        <span className="font-medium text-carbon dark:text-white">{r.name}</span>
                      )}
                      {level === 'program' && r.department_name && <span className="block text-[10.5px] text-coolslate">{r.department_name}</span>}
                      {isTask && (
                        <span className="block text-[10.5px] text-coolslate">
                          {t.source}{t.framework_aligned ? '' : ' · overridden outside framework range'}
                        </span>
                      )}
                    </td>
                    {isTask && <td className="py-2 pr-3">{r.method}</td>}
                    <td className="py-2 pr-3 text-right tabular-nums">{r.record_count}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{fmtNum(r.total_estimated_pd)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{fmtNum(r.total_actual_pd)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{fmtNum(r.total_abs_error_pd)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{fmtPct(r.ed, 2, true)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{fmtPct(r.efa)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums" title={r.ebi == null && r.ebi_na_reason ? EBI_NA_TEXT[r.ebi_na_reason] : undefined}>{fmtPct(r.ebi)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{fmtPct(r.eei)}</td>
                    {isTask && <td className="py-2 pr-3">{t.direction ? DIRECTION_TEXT[t.direction] : 'N/A'}</td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {!disabled && !!data?.meta.excluded_records && (
        <p className="text-[11px] text-coolslate mt-2">{data.meta.excluded_records} completed record(s) excluded: no positive estimate or no actual effort.</p>
      )}
    </Card>
  );
}
