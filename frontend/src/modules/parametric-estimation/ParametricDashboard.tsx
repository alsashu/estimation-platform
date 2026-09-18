import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { LayoutDashboard, Sigma, TrendingUp, Target, Percent, FileSpreadsheet, BarChart3 } from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, PieChart, Pie, Cell, CartesianGrid } from 'recharts';
import { parametricAnalysisApi, parametricEstimationsApi } from '../../services/api';
import { useProjectStore } from '../../store/projectStore';
import { StatCard, Card, Badge, Skeleton, Button, SPDot } from '../../components/ui';
import { fmt, cn } from '../../utils/formatters';
import { CHART_COLORS } from '../../config/theme';
import type { ParametricEstimation } from '../../types';

export default function ParametricDashboard() {
  const { selectedProjectId } = useProjectStore();
  const projectParam = selectedProjectId ? { projectId: selectedProjectId } : {};
  const projectFilter = selectedProjectId ? { project_id: selectedProjectId } : {};

  const { data: summary, isLoading: sumLoading } = useQuery({ queryKey: ['parametric-analysis-summary', selectedProjectId], queryFn: () => parametricAnalysisApi.getSummary(projectParam), retry: false });
  const { data: trend, isLoading: trendLoading } = useQuery({ queryKey: ['parametric-trend', selectedProjectId], queryFn: () => parametricAnalysisApi.getTrend({ days: 30, ...projectParam }), retry: false });
  const { data: workGroups } = useQuery({ queryKey: ['parametric-work-group', selectedProjectId], queryFn: () => parametricAnalysisApi.getByWorkGroup(projectParam), retry: false });
  const { data: recentData } = useQuery({ queryKey: ['parametric-recent', selectedProjectId], queryFn: () => parametricEstimationsApi.getAll({ limit: 8, page: 1, ...projectFilter }), retry: false });

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

      {/* Trend + Work Group split */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <Card className="xl:col-span-2" padding="p-5">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="font-display font-semibold text-carbon dark:text-white">Estimation Activity</h2>
              <p className="text-xs text-coolslate mt-0.5">Daily parametric estimations over the last 30 days</p>
            </div>
            {summary && (
              <Badge variant={summary.detailed_basis_pct >= summary.average_basis_pct ? 'success' : 'info'}>
                {summary.detailed_basis_pct >= summary.average_basis_pct ? 'Detailed-driven' : 'Average-driven'}
              </Badge>
            )}
          </div>
          {trendLoading ? <Skeleton className="h-48" /> : (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={trend || []} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="peTotalGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#1E3246" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#1E3246" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(120,130,145,0.1)" />
                <XAxis dataKey="date" tickFormatter={(v) => new Date(v).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                  tick={{ fontSize: 11, fill: '#788291' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#788291' }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: '#fff', border: '1px solid #D2D7DC', borderRadius: 10, fontSize: 12 }}
                  labelFormatter={(v) => fmt.date(v)} />
                <Area type="monotone" dataKey="total" name="Estimations" stroke="#1E3246" strokeWidth={2} fill="url(#peTotalGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </Card>

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
                    <p className="text-xs font-semibold text-carbon dark:text-white">{Number(r.final_estimation).toFixed(2)} PD</p>
                    <p className="text-[10px] text-coolslate">TE {Number(r.team_efficiency) * 100}%</p>
                  </div>
                  <Badge variant={r.source === 'excel_import' ? 'info' : 'neutral'}>{r.source === 'excel_import' ? 'Excel' : 'Manual'}</Badge>
                </div>
              </Link>
            ))
          )}
        </div>
      </Card>
    </div>
  );
}
