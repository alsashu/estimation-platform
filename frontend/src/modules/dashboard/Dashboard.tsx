import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Calculator, TrendingUp, Clock, Target, CheckCircle, AlertCircle, BarChart3, ChevronRight, Sigma } from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, BarChart, Bar, PieChart, Pie, Cell, CartesianGrid } from 'recharts';
import { analysisApi, estimationsApi } from '../../services/api';
import { useProjectStore } from '../../store/projectStore';
import { StatCard, Card, Badge, Skeleton, Button, SPDot, Modal } from '../../components/ui';
import { fmt, accuracyBg, cn } from '../../utils/formatters';
import { SP_COLORS, COMPLEXITY_COLORS, CHART_COLORS } from '../../config/theme';
import type { Estimation } from '../../types';

function PageHeader({ onNewEstimate }: { onNewEstimate: () => void }) {
  return (
    <div className="flex items-center justify-between mb-6">
      <div>
        <h1 className="text-2xl font-display font-bold text-carbon dark:text-white flex items-center gap-2">
          <LayoutDashboard size={22} className="text-carbon dark:text-lgrayblue" /> Dashboard
        </h1>
        <p className="text-sm text-coolslate mt-0.5">Overview of estimation activity and performance</p>
      </div>
      <Button icon={<Calculator size={16} />} onClick={onNewEstimate}>New Estimate</Button>
    </div>
  );
}

function EstimationMethodModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const navigate = useNavigate();

  const handleSelect = (path: string) => {
    onClose();
    navigate(path);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Choose Estimation Method" size="lg">
      <div>
        <p className="text-sm text-coolslate mb-6">Select how you'd like to estimate your project tasks</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

          {/* Storypoint Estimation */}
          <button
            onClick={() => handleSelect('/estimate')}
            className="group text-left p-5 rounded-xl border-2 border-lgrayblue/40 dark:border-slate-600 hover:border-greenline hover:bg-greenline/5 dark:hover:bg-greenline/10 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-greenline/40"
          >
            <div className="w-12 h-12 rounded-xl bg-gradient-primary flex items-center justify-center mb-4 shadow-sm group-hover:scale-105 transition-transform duration-200">
              <Calculator size={22} className="text-white" />
            </div>
            <div className="flex items-start justify-between mb-1">
              <h3 className="font-display font-semibold text-carbon dark:text-white">Storypoint Estimation</h3>
              <Badge variant="success">Available</Badge>
            </div>
            <p className="text-xs text-coolslate leading-relaxed">
              Estimate effort using story points based on complexity, risk, and team competency levels.
            </p>
            <div className="flex items-center gap-1 mt-4 text-greenline text-xs font-semibold">
              <span>Get started</span>
              <ChevronRight size={14} className="group-hover:translate-x-1 transition-transform duration-200" />
            </div>
          </button>

          {/* Parametric Estimation */}
          <button
            onClick={() => handleSelect('/parametric-estimation')}
            className="group text-left p-5 rounded-xl border-2 border-lgrayblue/40 dark:border-slate-600 hover:border-carbon/40 dark:hover:border-lgrayblue/60 hover:bg-carbon/3 dark:hover:bg-white/5 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-carbon/20"
          >
            <div className="relative w-12 h-12 rounded-xl bg-gradient-to-br from-carbon to-carbon/70 dark:from-slate-600 dark:to-slate-700 flex items-center justify-center mb-4 shadow-sm group-hover:scale-105 transition-transform duration-200">
              <Sigma size={22} className="text-white" />
              <span className="absolute -top-1.5 -right-1.5 bg-gold text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase leading-none">Soon</span>
            </div>
            <div className="flex items-start justify-between mb-1">
              <h3 className="font-display font-semibold text-carbon dark:text-white">Parametric Estimation</h3>
              <Badge variant="warning">Coming Soon</Badge>
            </div>
            <p className="text-xs text-coolslate leading-relaxed">
              Parameter-based model using historical data and configurable factors for advanced project forecasting.
            </p>
            <div className="flex items-center gap-1 mt-4 text-coolslate text-xs font-semibold">
              <span>Preview</span>
              <ChevronRight size={14} className="group-hover:translate-x-1 transition-transform duration-200" />
            </div>
          </button>

        </div>
      </div>
    </Modal>
  );
}

export default function Dashboard() {
  const [showModal, setShowModal] = useState(false);
  const { selectedProjectId } = useProjectStore();
  const projectParam = selectedProjectId ? { projectId: selectedProjectId } : {};
  const projectFilter = selectedProjectId ? { project_id: selectedProjectId } : {};

  const { data: summary, isLoading: sumLoading } = useQuery({ queryKey: ['analysis-summary', selectedProjectId], queryFn: () => analysisApi.getSummary(projectParam), retry: false });
  const { data: trend, isLoading: trendLoading } = useQuery({ queryKey: ['trend', selectedProjectId], queryFn: () => analysisApi.getTrend({ days: 30, ...projectParam }), retry: false });
  const { data: complexityData } = useQuery({ queryKey: ['complexity-breakdown', selectedProjectId], queryFn: () => analysisApi.getByComplexity(projectParam), retry: false });
  const { data: recentData } = useQuery({ queryKey: ['estimations-recent', selectedProjectId], queryFn: () => estimationsApi.getAll({ limit: 8, page: 1, ...projectFilter }), retry: false });

  const recentEstimations: Estimation[] = recentData?.data || [];

  const complexityPieData = (complexityData || []).map((c) => ({
    name: c.complexity, value: Number(c.count), color: COMPLEXITY_COLORS[c.complexity] || CHART_COLORS[0],
  }));

  const biasLabel = summary?.bias === 'under-estimate' ? 'Under-estimating' : summary?.bias === 'over-estimate' ? 'Over-estimating' : 'Accurate';
  const biasVariant = summary?.bias === 'accurate' ? 'success' : 'warning';

  return (
    <div className="space-y-6">
      <PageHeader onNewEstimate={() => setShowModal(true)} />

      {/* KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard label="Total Estimations" value={sumLoading ? '—' : String(summary?.total_estimations ?? 0)}
          icon={<Target size={18} />} color="bg-gradient-primary" loading={sumLoading} />
        <StatCard label="Completed" value={sumLoading ? '—' : String(summary?.completed_estimations ?? 0)}
          icon={<CheckCircle size={18} />} color="bg-gradient-success" loading={sumLoading} />
        <StatCard label="Avg Accuracy" value={sumLoading ? '—' : `${summary?.avg_accuracy?.toFixed(1) ?? 0}%`}
          icon={<TrendingUp size={18} />} color="bg-gradient-gold" loading={sumLoading} />
        <StatCard label="Avg Variance" value={sumLoading ? '—' : fmt.variance(summary?.avg_variance ?? 0)}
          icon={<BarChart3 size={18} />} color="bg-gradient-danger" loading={sumLoading} />
      </div>

      {/* Trend + Complexity */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        {/* Area chart */}
        <Card className="xl:col-span-2" padding="p-5">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="font-display font-semibold text-carbon dark:text-white">Estimation Activity</h2>
              <p className="text-xs text-coolslate mt-0.5">Daily estimations over the last 30 days</p>
            </div>
            {summary && <Badge variant={biasVariant}>{biasLabel}</Badge>}
          </div>
          {trendLoading ? <Skeleton className="h-48" /> : (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={trend || []} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="totalGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#1E3246" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#1E3246" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="completedGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#19AA6E" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#19AA6E" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(120,130,145,0.1)" />
                <XAxis dataKey="date" tickFormatter={(v) => new Date(v).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                  tick={{ fontSize: 11, fill: '#788291' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#788291' }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: 'var(--tw-bg-offwhite,#fff)', border: '1px solid #D2D7DC', borderRadius: 10, fontSize: 12 }}
                  labelFormatter={(v) => fmt.date(v)} />
                <Area type="monotone" dataKey="total" name="Total" stroke="#1E3246" strokeWidth={2} fill="url(#totalGrad)" />
                <Area type="monotone" dataKey="completed" name="Completed" stroke="#19AA6E" strokeWidth={2} fill="url(#completedGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </Card>

        {/* Complexity pie */}
        <Card padding="p-5">
          <h2 className="font-display font-semibold text-carbon dark:text-white mb-1">Complexity Split</h2>
          <p className="text-xs text-coolslate mb-4">Distribution by complexity level</p>
          {complexityPieData.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-coolslate">
              <BarChart3 size={28} className="opacity-30 mb-2" />
              <p className="text-xs">No data yet</p>
            </div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={150}>
                <PieChart>
                  <Pie data={complexityPieData} cx="50%" cy="50%" innerRadius={40} outerRadius={65} paddingAngle={3} dataKey="value">
                    {complexityPieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12, border: '1px solid #D2D7DC' }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-1.5 mt-2">
                {complexityPieData.map((d) => (
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
          <h2 className="font-display font-semibold text-carbon dark:text-white">Recent Estimations</h2>
          <Link to="/history"><Button variant="ghost" size="sm">View all</Button></Link>
        </div>
        <div className="divide-y divide-lgrayblue/20 dark:divide-slate-700/50">
          {recentEstimations.length === 0 ? (
            <div className="py-10 text-center">
              <Calculator size={24} className="text-coolslate mx-auto mb-2 opacity-40" />
              <p className="text-sm text-coolslate">No estimations yet</p>
              <button onClick={() => setShowModal(true)} className="mt-3 inline-block">
                <Button size="sm">Create your first estimate</Button>
              </button>
            </div>
          ) : (
            recentEstimations.map((e) => (
              <Link to={`/history?id=${e.id}`} key={e.id}
                className="flex items-center gap-4 px-5 py-3.5 hover:bg-lgrayblue/10 dark:hover:bg-slate-700/20 transition-colors group"
              >
                <SPDot color={SP_COLORS[e.story_points] || '#788291'} size={10} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-carbon dark:text-white truncate group-hover:text-carbon">{e.title}</p>
                  <p className="text-xs text-coolslate">{e.project_name || 'No project'} · {fmt.date(e.created_at)}</p>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <div className="text-right hidden sm:block">
                    <p className="text-xs font-semibold text-carbon dark:text-white">{fmt.range(e.revised_min_hours, e.revised_max_hours, 'hrs')}</p>
                    <p className="text-[10px] text-coolslate">SP {e.story_points} · {e.complexity}</p>
                  </div>
                  <Badge variant={e.status === 'completed' ? 'success' : 'neutral'}>
                    {e.status === 'completed' ? 'Done' : 'Open'}
                  </Badge>
                  {e.accuracy_percent != null && (
                    <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-full border', accuracyBg(e.accuracy_percent))}>
                      {Number(e.accuracy_percent).toFixed(0)}%
                    </span>
                  )}
                </div>
              </Link>
            ))
          )}
        </div>
      </Card>

      <EstimationMethodModal isOpen={showModal} onClose={() => setShowModal(false)} />
    </div>
  );
}
