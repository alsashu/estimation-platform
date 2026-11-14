import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { LayoutDashboard, Sigma, TrendingUp, Target, Percent, FileSpreadsheet, BarChart3 } from 'lucide-react';
import { ResponsiveContainer, Tooltip, PieChart, Pie, Cell } from 'recharts';
import { parametricAnalysisApi, parametricEstimationsApi } from '../../services/api';
import { HierarchyFilterBar, usePageHierarchyFilter } from '../../components/hierarchy/HierarchyFilterBar';
import { StatCard, Card, Badge, Button, SPDot } from '../../components/ui';
import { fmt, cn } from '../../utils/formatters';
import { CHART_COLORS } from '../../config/theme';
import type { ParametricEstimation, ParametricTrendPoint } from '../../types';
import { EstimationActivityCard, type ActivitySeries } from '../../components/dashboard/EstimationActivityCard';

const PE_ACTIVITY_SERIES: ActivitySeries<ParametricTrendPoint>[] = [
  { key: 'total', name: 'Estimations', color: { light: '#1E3246', dark: '#D2D7DC' } },
];
import { ParametricActualsKpis } from './ParametricActualsInsights';
import { accuracyTone } from './ParametricActualsPanel';

export default function ParametricDashboard() {
  // Department + Program from the header, Baseline from the page filter
  const { filter, setFilter, params: scope } = usePageHierarchyFilter();
  const projectParam = scope;
  const projectFilter = scope;
  const scopeKey = JSON.stringify(scope);

  const { data: summary, isLoading: sumLoading } = useQuery({ queryKey: ['parametric-analysis-summary', scopeKey], queryFn: () => parametricAnalysisApi.getSummary(projectParam), retry: false });
  const { data: workGroups } = useQuery({ queryKey: ['parametric-work-group', scopeKey], queryFn: () => parametricAnalysisApi.getByWorkGroup(projectParam), retry: false });
  const { data: recentData } = useQuery({ queryKey: ['parametric-recent', scopeKey], queryFn: () => parametricEstimationsApi.getAll({ limit: 8, page: 1, ...projectFilter }), retry: false });

  const recent: ParametricEstimation[] = recentData?.data || [];
  const workGroupPie = (workGroups || []).map((w, i) => ({ name: w.work_group, value: Number(w.count), color: CHART_COLORS[i % CHART_COLORS.length] }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h1 className="text-2xl font-display font-bold text-carbon dark:text-white flex items-center gap-2">
            <LayoutDashboard size={22} className="text-carbon dark:text-lgrayblue" /> Dashboard <Badge variant="info">PE</Badge>
          </h1>
          <p className="text-sm text-coolslate mt-0.5">Overview of Parametric Estimation activity</p>
        </div>
        <Link to="/parametric-estimation"><Button icon={<Sigma size={16} />}>New Estimate</Button></Link>
      </div>

      <HierarchyFilterBar value={filter} onChange={setFilter} depth="baseline" />

      {/* KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard label="Total Estimations" value={sumLoading ? '—' : String(summary?.total_estimations ?? 0)}
          icon={<Target size={18} />} color="bg-gradient-primary" loading={sumLoading} />
        <StatCard label="Avg Final Estimation" value={sumLoading ? '—' : `${(summary?.avg_final_estimation ?? 0).toFixed(1)} PD`}
          icon={<TrendingUp size={18} />} color="bg-gradient-success" loading={sumLoading} />
        <StatCard label="Avg Team Efficiency" value={sumLoading ? '—' : `${((summary?.avg_team_efficiency ?? 0) * 100).toFixed(0)}%`}
          icon={<Percent size={18} />} color="bg-gradient-gold" loading={sumLoading} />
        <StatCard label="Imported via Excel" value={sumLoading ? '—' : String(summary?.import_count ?? 0)}
          icon={<FileSpreadsheet size={18} />} color="bg-gradient-danger" loading={sumLoading} />
      </div>

      {/* Estimated vs Actual (PersonDays) */}
      <ParametricActualsKpis summary={summary} loading={sumLoading} />

      {/* Trend + Work Group split */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <EstimationActivityCard<ParametricTrendPoint>
          queryKey="parametric-trend"
          scope={scope}
          fetchActivity={parametricAnalysisApi.getActivity}
          noun="parametric estimations"
          series={PE_ACTIVITY_SERIES}
          tooltipDetails={(pt) => [{ label: 'Manual', value: pt.manual }, { label: 'Excel import', value: pt.excel_import }]}
          badge={summary && (
            <Badge variant={summary.detailed_basis_pct >= summary.average_basis_pct ? 'success' : 'info'}>
              {summary.detailed_basis_pct >= summary.average_basis_pct ? 'Detailed-driven' : 'Average-driven'}
            </Badge>
          )}
        />

        <Card padding="p-5">
          <h2 className="font-display font-semibold text-carbon dark:text-white mb-1">Work Group Split</h2>
          <p className="text-xs text-coolslate mb-4">Distribution by work group</p>
          {workGroupPie.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-coolslate">
              <BarChart3 size={28} className="opacity-30 mb-2" />
              <p className="text-xs">No data yet</p>
            </div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={150}>
                <PieChart>
                  <Pie data={workGroupPie} cx="50%" cy="50%" innerRadius={40} outerRadius={65} paddingAngle={3} dataKey="value">
                    {workGroupPie.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12, border: '1px solid #D2D7DC' }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-1.5 mt-2">
                {workGroupPie.map((d) => (
                  <div key={d.name} className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-2 text-coolslate"><SPDot color={d.color} />{d.name}</span>
                    <span className="font-semibold text-carbon dark:text-white">{d.value}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </Card>
      </div>

      {/* Recent Estimations */}
      <Card padding="p-0">
        <div className="flex items-center justify-between px-5 py-4 border-b border-lgrayblue/30 dark:border-slate-700">
          <h2 className="font-display font-semibold text-carbon dark:text-white">Recent Parametric Estimations</h2>
          <Link to="/parametric-history"><Button variant="ghost" size="sm">View all</Button></Link>
        </div>
        <div className="divide-y divide-lgrayblue/20 dark:divide-slate-700/50">
          {recent.length === 0 ? (
            <div className="py-10 text-center">
              <Sigma size={24} className="text-coolslate mx-auto mb-2 opacity-40" />
              <p className="text-sm text-coolslate">No parametric estimations yet</p>
              <Link to="/parametric-estimation"><Button size="sm" className="mt-3">Create your first estimate</Button></Link>
            </div>
          ) : (
            recent.map((r) => (
              <Link to="/parametric-history" key={r.id}
                className="flex items-center gap-4 px-5 py-3.5 hover:bg-lgrayblue/10 dark:hover:bg-slate-700/20 transition-colors group"
              >
                <SPDot color="#1E3246" size={10} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-carbon dark:text-white truncate group-hover:text-carbon">{r.task_title}</p>
                  <p className="text-xs text-coolslate">{r.project_name || 'No project'} · {fmt.date(r.created_at)}</p>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <div className="text-right hidden sm:block">
                    <p className="text-xs font-semibold text-carbon dark:text-white">Est. {Number(r.final_estimation).toFixed(2)} PD</p>
                    <p className="text-[10px] text-coolslate">{r.actual_days != null ? `Actual ${Number(r.actual_days).toFixed(2)} PD` : 'Actual not recorded'}</p>
                  </div>
                  {r.accuracy_percent != null
                    ? <Badge variant={accuracyTone(Number(r.accuracy_percent))}>{Number(r.accuracy_percent).toFixed(0)}% acc.</Badge>
                    : <Badge variant={r.source === 'excel_import' ? 'info' : 'neutral'}>{r.source === 'excel_import' ? 'Excel' : 'Manual'}</Badge>}
                </div>
              </Link>
            ))
          )}
        </div>
      </Card>
    </div>
  );
}
