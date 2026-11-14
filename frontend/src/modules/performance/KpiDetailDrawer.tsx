import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { Button, Drawer, Skeleton } from '../../components/ui';
import { performanceApi } from '../../services/api';
import { KpiCalculation, StatusChip } from './KpiTile';
import { BREAKDOWN_COLUMNS } from './BreakdownPanel';
import { downloadCsv, explainKpi, fmtNum, fmtPct, KPI_DEFS, toCsv } from './kpiFormat';
import type { KpiKey, PerformanceDashboard, TaskRow } from './types';

export const RECOMMENDED_ACTIONS: Record<KpiKey, string[]> = {
  efa: [
    'Review complexity and risk mapping.',
    'Review reference stories and estimation parameters.',
    'Identify areas requiring point-to-effort calibration.',
    'Investigate estimation inconsistencies across programs.',
  ],
  ed: [
    'Review assumptions and estimation inputs.',
    'Identify missing scope and investigate risk treatment.',
    'Review reference data.',
    'Compare estimates and actuals to ensure equivalent scope.',
  ],
  ebi: [
    'Continue effective improvement actions.',
    'Investigate stagnation or deterioration by cause and segment.',
    'Identify programs with significant improvement.',
    'Compare historical and current estimation performance.',
  ],
  eei: [
    'Drill down into programs and framework components.',
    'Identify size and risk segments contributing most to absolute deviation.',
    'Use signed ED to understand the direction of deviation.',
    'Identify areas requiring calibration.',
  ],
};

interface Props {
  kpi: KpiKey | null;
  data: PerformanceDashboard;
  scope: Record<string, unknown>;
  live: boolean;
  onClose: () => void;
}

export function KpiDetailDrawer({ kpi, data, scope, live, onClose }: Props) {
  const tasks = useQuery({
    queryKey: ['performance', 'breakdown', 'kpi-detail', JSON.stringify(scope)],
    queryFn: () => performanceApi.breakdown<TaskRow>({ ...scope, groupBy: 'task' }),
    enabled: !!kpi && live,
  });

  const rows = useMemo(() => {
    const all = tasks.data?.data ?? [];
    // EFA and the current side of EBI are framework records only; ED and EEI use every eligible record.
    const list = kpi === 'efa' || kpi === 'ebi' ? all.filter(r => r.framework_aligned) : all;
    return [...list].sort((a, b) => Math.abs(b.ed ?? 0) - Math.abs(a.ed ?? 0));
  }, [tasks.data, kpi]);

  if (!kpi) return null;
  const def = KPI_DEFS[kpi];
  const ebi = data.summary.ebi;

  return (
    <Drawer isOpen={!!kpi} onClose={onClose} title={`${def.name} (${def.short})`} subtitle={def.question}>
      <div className="px-6 py-5 space-y-6" data-testid="kpi-detail">
        <section>
          <div className="flex items-center justify-between gap-3">
            <p className="text-3xl font-display font-bold tabular-nums text-carbon dark:text-white">
              {kpi === 'ed' ? fmtPct(data.summary.ed.value, 2, true) : fmtPct(data.summary[kpi].value)}
            </p>
            <StatusChip status={data.summary[kpi].status} />
          </div>
          <p className="text-xs text-coolslate mt-1">{def.purpose}</p>
        </section>

        <section>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-coolslate mb-2">Calculation</h4>
          <KpiCalculation ex={explainKpi(data, kpi)} />
        </section>

        {kpi === 'ebi' && (
          <section className="space-y-2 text-xs">
            <h4 className="font-semibold uppercase tracking-wide text-coolslate">Historical baselines used (without framework)</h4>
            {ebi.baselines_used.length === 0 ? <p className="text-coolslate">None in this scope.</p> : (
              <ul className="space-y-1">
                {ebi.baselines_used.map(b => (
                  <li key={b.id} className="text-carbon dark:text-lgrayblue">{b.label} <span className="text-coolslate">· {b.estimation_method} · v{b.version}</span></li>
                ))}
              </ul>
            )}
            {ebi.missing_scope.length > 0 && (
              <>
                <h4 className="font-semibold uppercase tracking-wide text-coolslate pt-2">Current records without a comparable baseline</h4>
                <ul className="space-y-1">
                  {ebi.missing_scope.map((m, i) => (
                    <li key={i} className="text-carbon dark:text-lgrayblue">
                      {m.program_name ?? m.department_name ?? 'Unassigned (pre-hierarchy)'} <span className="text-coolslate">· {m.method} · {m.record_count} record(s)</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
            {ebi.unmatched_baselines.length > 0 && (
              <p className="text-coolslate pt-1">{ebi.unmatched_baselines.length} baseline(s) in scope had no current records in this period and were left out of the comparison.</p>
            )}
          </section>
        )}

        <section>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-coolslate mb-2">Recommended actions</h4>
          <ul className="list-disc pl-4 space-y-1 text-xs text-carbon dark:text-lgrayblue">
            {RECOMMENDED_ACTIONS[kpi].map(a => <li key={a}>{a}</li>)}
          </ul>
        </section>

        <section>
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-coolslate">
              Supporting records {kpi === 'efa' || kpi === 'ebi' ? '(framework-aligned)' : '(all eligible)'}
            </h4>
            <Button size="xs" variant="outline" icon={<Download size={12} />} disabled={!rows.length}
              onClick={() => downloadCsv(`${def.short.toLowerCase()}-supporting-records.csv`, toCsv(rows, BREAKDOWN_COLUMNS))}>
              CSV
            </Button>
          </div>
          {!live ? <p className="text-xs text-coolslate">Supporting records are loaded live; return to the live dashboard to view them.</p>
            : tasks.isLoading ? <Skeleton className="h-32" /> : rows.length === 0 ? (
              <p className="text-xs text-coolslate">No eligible records.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs" data-testid="kpi-detail-records">
                  <thead>
                    <tr className="text-left text-coolslate border-b border-lgrayblue/40 dark:border-slate-700">
                      <th className="py-1.5 pr-2 font-medium">Task</th>
                      <th className="py-1.5 pr-2 font-medium text-right">Est.</th>
                      <th className="py-1.5 pr-2 font-medium text-right">Actual</th>
                      <th className="py-1.5 font-medium text-right">ED</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 200).map(r => (
                      <tr key={`${r.method}-${r.id}`} className="border-b border-lgrayblue/20 dark:border-slate-700/60">
                        <td className="py-1.5 pr-2">
                          <span className="text-carbon dark:text-white">{r.name}</span>
                          <span className="block text-[10.5px] text-coolslate">{r.method} · {r.program_name ?? 'Unassigned'}{r.framework_aligned ? '' : ' · override'}</span>
                        </td>
                        <td className="py-1.5 pr-2 text-right tabular-nums">{fmtNum(r.total_estimated_pd)}</td>
                        <td className="py-1.5 pr-2 text-right tabular-nums">{fmtNum(r.total_actual_pd)}</td>
                        <td className="py-1.5 text-right tabular-nums">{fmtPct(r.ed, 1, true)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="text-[10.5px] text-coolslate mt-1">PersonDays. SP hours ÷ {data.meta.sp_hours_per_pd}. Sorted by largest deviation.</p>
              </div>
            )}
        </section>
      </div>
    </Drawer>
  );
}
