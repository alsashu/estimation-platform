import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BarChart3, TrendingUp, Target, Percent, Sigma, Layers } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, PieChart, Pie, Cell, Legend } from 'recharts';
import { parametricAnalysisApi } from '../../services/api';
import { useProjectStore } from '../../store/projectStore';
import { StatCard, Card, Badge, EmptyState } from '../../components/ui';
import { cn } from '../../utils/formatters';
import { PARAMETRIC_SIZE_COLORS, CHART_COLORS } from '../../config/theme';

const PERIOD_OPTIONS = [
  { label: '30 days', days: 30 },
  { label: '90 days', days: 90 },
  { label: '1 year', days: 365 },
  { label: 'All time', days: 3650 },
];

const FIELD_LABELS: Record<string, string> = {
  middleware_inputs: 'Middleware Inputs',
  application: 'Application',
  system_configuration: 'System Configuration',
  data_and_control_flow: 'Data and Control Flow',
  use_case: 'Use Case',
};

export default function ParametricAnalysisPage() {
  const [period, setPeriod] = useState(90);
  const { selectedProjectId } = useProjectStore();

  const dateFrom = new Date(Date.now() - period * 24 * 60 * 60 * 1000).toISOString();
  const params = { from: dateFrom, ...(selectedProjectId ? { projectId: selectedProjectId } : {}) };

  const { data: summary, isLoading: sumLoading } = useQuery({ queryKey: ['parametric-analysis-summary-full', period, selectedProjectId], queryFn: () => parametricAnalysisApi.getSummary(params), retry: false });
  const { data: sizeDist } = useQuery({ queryKey: ['parametric-size-dist', period, selectedProjectId], queryFn: () => parametricAnalysisApi.getSizeDistribution(params), retry: false });
  const { data: workGroups } = useQuery({ queryKey: ['parametric-work-group-full', period, selectedProjectId], queryFn: () => parametricAnalysisApi.getByWorkGroup(params), retry: false });
  const { data: configs } = useQuery({ queryKey: ['parametric-config-breakdown', period, selectedProjectId], queryFn: () => parametricAnalysisApi.getByConfig(params), retry: false });

  const sizeChartData = (sizeDist || []).map(d => ({ ...d, label: FIELD_LABELS[d.field] || d.field }));
  const configPie = (configs || []).map((c, i) => ({ name: c.expert_config_name, value: Number(c.count), color: CHART_COLORS[i % CHART_COLORS.length] }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-display font-bold text-carbon dark:text-white flex items-center gap-2">
            <BarChart3 size={22} /> Analytics <Badge variant="info"><Sigma size={10} /> PE</Badge>
          </h1>
          <p className="text-sm text-coolslate mt-0.5">Parametric Estimation trends and master-data usage</p>
        </div>
        <div className="flex bg-lgrayblue/30 dark:bg-slate-700/40 rounded-lg p-1 gap-1">
          {PERIOD_OPTIONS.map((opt) => (
            <button key={opt.days} onClick={() => setPeriod(opt.days)}
              className={cn('px-3 py-1.5 rounded-md text-xs font-medium transition-all', period === opt.days ? 'bg-white dark:bg-carbon-700 text-carbon dark:text-white shadow-sm' : 'text-coolslate hover:text-carbon dark:hover:text-white')}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard label="Total Estimations" value={sumLoading ? '—' : String(summary?.total_estimations ?? 0)}
          icon={<Target size={18} />} color="bg-gradient-primary" loading={sumLoading} />
        <StatCard label="Avg Detailed Estimation" value={sumLoading ? '—' : `${(summary?.avg_detailed_estimation ?? 0).toFixed(1)} PD`}
          icon={<Layers size={18} />} color="bg-gradient-gold" loading={sumLoading} />
        <StatCard label="Avg Average Estimation" value={sumLoading ? '—' : `${(summary?.avg_average_estimation ?? 0).toFixed(1)} PD`}
          icon={<TrendingUp size={18} />} color="bg-gradient-success" loading={sumLoading} />
        <StatCard label="Detailed-driven Final" value={sumLoading ? '—' : `${(summary?.detailed_basis_pct ?? 0).toFixed(0)}%`}
          icon={<Percent size={18} />} color="bg-gradient-danger" loading={sumLoading} />
      </div>

      {/* Size distribution + Config usage */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <Card padding="p-5" className="xl:col-span-2">
          <h2 className="font-display font-semibold text-carbon dark:text-white mb-1">Complexity Input Distribution</h2>
          <p className="text-xs text-coolslate mb-4">How often each size was selected, per field</p>
          {!sizeChartData.length ? (
            <EmptyState icon={<BarChart3 size={24} />} title="No data yet" message="Save parametric estimations to see this chart" />
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={sizeChartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(120,130,145,0.1)" />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#788291' }} axisLine={false} tickLine={false} interval={0}
                  angle={-15} textAnchor="end" height={50} />
                <YAxis tick={{ fontSize: 11, fill: '#788291' }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip contentStyle={{ borderRadius: 10, fontSize: 12, border: '1px solid #D2D7DC' }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {(['Small', 'Medium', 'Large', 'NA'] as const).map((size) => (
                  <Bar key={size} dataKey={size} stackId="size" name={size} fill={PARAMETRIC_SIZE_COLORS[size]} radius={size === 'NA' ? [4, 4, 0, 0] : undefined} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>

        <Card padding="p-5">
          <h2 className="font-display font-semibold text-carbon dark:text-white mb-1">Master Data Usage</h2>
          <p className="text-xs text-coolslate mb-4">Expert Judgement configuration used per estimation</p>
          {configPie.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-coolslate">
              <BarChart3 size={28} className="opacity-30 mb-2" />
              <p className="text-xs">No data yet</p>
            </div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={150}>
                <PieChart>
                  <Pie data={configPie} cx="50%" cy="50%" innerRadius={40} outerRadius={65} paddingAngle={3} dataKey="value">
                    {configPie.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12, border: '1px solid #D2D7DC' }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-1.5 mt-2">
                {configPie.map((d) => (
                  <div key={d.name} className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-2 text-coolslate"><span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: d.color }} />{d.name}</span>
                    <span className="font-semibold text-carbon dark:text-white">{d.value}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </Card>
      </div>

      {/* Work group table */}
      <Card padding="p-5">
        <h2 className="font-display font-semibold text-carbon dark:text-white mb-4">Average Final Estimation by Work Group</h2>
        {!workGroups || workGroups.length === 0 ? (
          <EmptyState icon={<BarChart3 size={24} />} title="No data" message="Save parametric estimations with a work group to see this breakdown" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-lgrayblue/30 dark:border-slate-700">
                  {['Work Group', 'Count', 'Avg Final Estimation'].map(h => (
                    <th key={h} className="pb-2.5 text-left text-xs font-semibold text-coolslate uppercase tracking-wide pr-3 last:pr-0">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {workGroups.map((w) => (
                  <tr key={w.work_group} className="border-b border-lgrayblue/10 dark:border-slate-700/30 last:border-0">
                    <td className="py-2.5 pr-3 font-medium text-carbon dark:text-white">{w.work_group}</td>
                    <td className="py-2.5 pr-3 text-coolslate">{w.count}</td>
                    <td className="py-2.5 font-semibold text-carbon dark:text-white">{Number(w.avg_final_estimation).toFixed(2)} PD</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
