import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ClipboardList, FileSpreadsheet, User } from 'lucide-react';
import { parametricEstimationsApi } from '../../services/api';
import { useProjectStore } from '../../store/projectStore';
import { Card, Badge, Drawer, EmptyState, SearchInput, Skeleton, Button } from '../../components/ui';
import { fmt } from '../../utils/formatters';
import type { ParametricEstimation } from '../../types';

function SizeBadge({ size }: { size: string }) {
  return <Badge variant={size === 'NA' ? 'neutral' : 'default'}>{size}</Badge>;
}

export function ParametricHistory() {
  const { selectedProjectId } = useProjectStore();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [drawerRow, setDrawerRow] = useState<ParametricEstimation | null>(null);

  const params = {
    search: search || undefined,
    project_id: selectedProjectId ?? undefined,
    page, limit: 15,
  };

  const { data, isLoading } = useQuery({
    queryKey: ['parametric-estimations', params],
    queryFn: () => parametricEstimationsApi.getAll(params as Record<string, unknown>),
    retry: false,
  });

  const rows: ParametricEstimation[] = data?.data || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / 15);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="text-sm text-coolslate">{total} parametric estimation{total !== 1 ? 's' : ''} recorded</p>
        <div className="w-64"><SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search task, project…" /></div>
      </div>

      <Card padding="p-0">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-lgrayblue/30 dark:border-slate-700">
                {['Task', 'Project', 'Inputs', 'Team Eff.', 'Detailed', 'Average', 'Final', 'Source', 'Date', ''].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-coolslate uppercase tracking-wide first:pl-5">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="border-b border-lgrayblue/20 dark:border-slate-700/40">
                    {Array.from({ length: 10 }).map((_, j) => <td key={j} className="px-4 py-3.5"><Skeleton className="h-4 w-full" /></td>)}
                  </tr>
                ))
              ) : rows.length === 0 ? (
                <tr><td colSpan={10}>
                  <EmptyState icon={<ClipboardList size={28} />} title="No parametric estimations yet"
                    message="Save an estimation or import one via Excel to see it here." />
                </td></tr>
              ) : rows.map((r) => (
                <tr key={r.id} className="group hover:bg-lgrayblue/10 dark:hover:bg-slate-700/20 transition-colors border-b border-lgrayblue/20 dark:border-slate-700/40 last:border-0 cursor-pointer"
                  onClick={() => setDrawerRow(r)}>
                  <td className="px-5 py-3.5">
                    <p className="text-sm font-medium text-carbon dark:text-white truncate max-w-[200px]">{r.task_title}</p>
                    {r.work_group && <p className="text-xs text-coolslate">{r.work_group}</p>}
                  </td>
                  <td className="px-4 py-3.5 text-sm text-coolslate">{r.project_name || '—'}</td>
                  <td className="px-4 py-3.5">
                    <div className="flex flex-wrap gap-1 max-w-[180px]">
                      {[r.middleware_inputs, r.application, r.system_configuration, r.data_and_control_flow, r.use_case].map((s, i) => (
                        <SizeBadge key={i} size={s} />
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3.5 text-sm text-carbon dark:text-white">{Number(r.team_efficiency) * 100}%</td>
                  <td className="px-4 py-3.5 text-sm text-carbon dark:text-white">{Number(r.detailed_estimation).toFixed(2)}</td>
                  <td className="px-4 py-3.5 text-sm text-carbon dark:text-white">{Number(r.average_estimation).toFixed(2)}</td>
                  <td className="px-4 py-3.5"><span className="text-sm font-bold text-carbon dark:text-white">{Number(r.final_estimation).toFixed(2)} PD</span></td>
                  <td className="px-4 py-3.5">
                    <Badge variant={r.source === 'excel_import' ? 'info' : 'neutral'}>{r.source === 'excel_import' ? 'Excel' : 'Manual'}</Badge>
                  </td>
                  <td className="px-4 py-3.5 text-xs text-coolslate">{fmt.date(r.created_at)}</td>
                  <td className="px-4 py-3.5" />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-lgrayblue/30 dark:border-slate-700">
            <p className="text-xs text-coolslate">Page {page} of {totalPages} ({total} records)</p>
            <div className="flex gap-2">
              <Button variant="outline" size="xs" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
              <Button variant="outline" size="xs" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>Next</Button>
            </div>
          </div>
        )}
      </Card>

      <Drawer isOpen={!!drawerRow} onClose={() => setDrawerRow(null)} title={drawerRow?.task_title || ''} subtitle={drawerRow?.project_name}>
        {drawerRow && (
          <div className="p-5 space-y-5">
            <div className="grid grid-cols-2 gap-3">
              {[
                { l: 'Middleware Inputs', v: drawerRow.middleware_inputs },
                { l: 'Application', v: drawerRow.application },
                { l: 'System Configuration', v: drawerRow.system_configuration },
                { l: 'Data and Control Flow', v: drawerRow.data_and_control_flow },
                { l: 'Use Case', v: drawerRow.use_case },
                { l: 'Team Efficiency', v: `${Number(drawerRow.team_efficiency) * 100}%` },
              ].map(({ l, v }) => (
                <div key={l} className="bg-lgrayblue/20 dark:bg-carbon-800/50 rounded-lg p-2.5">
                  <p className="text-xs text-coolslate">{l}</p>
                  <p className="text-sm font-semibold text-carbon dark:text-white">{v}</p>
                </div>
              ))}
            </div>

            {drawerRow.breakdown && (
              <div>
                <p className="text-xs font-semibold text-coolslate uppercase tracking-wide mb-2">Calculation Breakdown</p>
                <div className="overflow-x-auto rounded-lg border border-lgrayblue/20 dark:border-slate-700">
                  <table className="w-full text-xs">
                    <thead className="bg-lgrayblue/20 dark:bg-carbon-800/50">
                      <tr>{['Field', 'Size', 'Detailed', 'Average'].map(h => <th key={h} className="px-2.5 py-2 text-left font-semibold text-coolslate">{h}</th>)}</tr>
                    </thead>
                    <tbody>
                      {drawerRow.breakdown.map((b) => (
                        <tr key={b.field} className="border-t border-lgrayblue/10 dark:border-slate-700/40">
                          <td className="px-2.5 py-2 text-carbon dark:text-white">{b.label}</td>
                          <td className="px-2.5 py-2"><SizeBadge size={b.size} /></td>
                          <td className="px-2.5 py-2 text-carbon dark:text-white">{b.detailed_value}</td>
                          <td className="px-2.5 py-2 text-carbon dark:text-white">{b.average_value}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div>
              <p className="text-xs font-semibold text-coolslate uppercase tracking-wide mb-2">Result</p>
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-lgrayblue/20 dark:bg-carbon-800/50 rounded-lg p-2.5 text-center">
                  <p className="text-xs text-coolslate">Detailed</p>
                  <p className="text-sm font-bold text-carbon dark:text-white">{Number(drawerRow.detailed_estimation).toFixed(2)}</p>
                </div>
                <div className="bg-lgrayblue/20 dark:bg-carbon-800/50 rounded-lg p-2.5 text-center">
                  <p className="text-xs text-coolslate">Average</p>
                  <p className="text-sm font-bold text-carbon dark:text-white">{Number(drawerRow.average_estimation).toFixed(2)}</p>
                </div>
                <div className="bg-carbon dark:bg-carbon-800 rounded-lg p-2.5 text-center">
                  <p className="text-xs text-white/60">Final</p>
                  <p className="text-sm font-bold text-white">{Number(drawerRow.final_estimation).toFixed(2)}</p>
                </div>
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold text-coolslate uppercase tracking-wide mb-2">Master Data Used</p>
              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between"><span className="text-coolslate">Expert Judgement</span><span className="font-medium text-carbon dark:text-white">{drawerRow.expert_config_name || '—'}</span></div>
                <div className="flex justify-between"><span className="text-coolslate">Average Estimation</span><span className="font-medium text-carbon dark:text-white">{drawerRow.average_config_name || '—'}</span></div>
              </div>
              <p className="text-[11px] text-coolslate mt-2">A snapshot of these values is stored with this record, so it stays reproducible even if the master data changes later.</p>
            </div>

            {drawerRow.description && (
              <div>
                <p className="text-xs font-semibold text-coolslate uppercase tracking-wide mb-1">Description</p>
                <p className="text-sm text-carbon dark:text-lgrayblue">{drawerRow.description}</p>
              </div>
            )}

            <div className="flex items-center gap-3 text-xs text-coolslate pt-2 border-t border-lgrayblue/20 dark:border-slate-700">
              {drawerRow.source === 'excel_import' ? <FileSpreadsheet size={12} /> : <User size={12} />}
              <span>{drawerRow.source === 'excel_import' ? 'Imported via Excel' : 'Manually entered'}</span>
              <span>·</span>
              <span>{fmt.datetime(drawerRow.created_at)}</span>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}
