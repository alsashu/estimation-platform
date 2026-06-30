import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BarChart3, TrendingUp, AlertCircle, CheckCircle, Download } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ScatterChart, Scatter, ReferenceLine, Cell } from 'recharts';
import { analysisApi } from '../../services/api';
import { useProjectStore } from '../../store/projectStore';
import { StatCard, Card, Badge, Skeleton, Button, EmptyState } from '../../components/ui';
import { fmt, accuracyBg, cn } from '../../utils/formatters';
import { COMPLEXITY_COLORS, SP_COLORS } from '../../config/theme';

const PERIOD_OPTIONS = [
  { label: '30 days', days: 30 },
  { label: '90 days', days: 90 },
  { label: '1 year', days: 365 },
  { label: 'All time', days: 3650 },
];

export default function AnalysisPage() {
  const [period, setPeriod] = useState(90);
  const { selectedProjectId } = useProjectStore();

  const dateFrom = new Date(Date.now() - period * 24 * 60 * 60 * 1000).toISOString();
  const params = {
    from: dateFrom,
    ...(selectedProjectId ? { projectId: selectedProjectId } : {}),
  };

  const { data: summary, isLoading: sumLoading } = useQuery({ queryKey: ['summary', period, selectedProjectId], queryFn: () => analysisApi.getSummary(params), retry: false });
  const { data: complexity } = useQuery({ queryKey: ['complexity', period, selectedProjectId], queryFn: () => analysisApi.getByComplexity(params), retry: false });
  const { data: spBands } = useQuery({ queryKey: ['sp-bands', period, selectedProjectId], queryFn: () => analysisApi.getSPBands(params), retry: false });
  const { data: scatter } = useQuery({ queryKey: ['scatter', period, selectedProjectId], queryFn: () => analysisApi.getScatter(params), retry: false });

  const biasColor = summary?.bias === 'accurate' ? 'success' : 'warning';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold text-carbon dark:text-white flex items-center gap-2">
            <BarChart3 size={22} /> Analytics & Reports
          </h1>
          <p className="text-sm text-coolslate mt-0.5">Estimation accuracy and performance analysis</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex bg-lgrayblue/30 dark:bg-slate-700/40 rounded-lg p-1 gap-1">
            {PERIOD_OPTIONS.map((opt) => (
              <button key={opt.days} onClick={() => setPeriod(opt.days)}
                className={cn('px-3 py-1.5 rounded-md text-xs font-medium transition-all', period === opt.days ? 'bg-white dark:bg-carbon-700 text-carbon dark:text-white shadow-sm' : 'text-coolslate hover:text-carbon dark:hover:text-white')}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <Button variant="outline" size="sm" icon={<Download size={14} />}>Export</Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard label="Completed w/ Actuals" value={sumLoading ? '—' : String(summary?.completed_estimations ?? 0)}
          icon={<CheckCircle size={18} />} color="bg-gradient-success" loading={sumLoading} />
        <StatCard label="Avg Accuracy" value={sumLoading ? '—' : `${summary?.avg_accuracy?.toFixed(1) ?? 0}%`}
          icon={<TrendingUp size={18} />} color="bg-gradient-primary" loading={sumLoading} />
        <StatCard label="Avg Variance" value={sumLoading ? '—' : fmt.variance(summary?.avg_variance ?? 0)}
          icon={<AlertCircle size={18} />} color="bg-gradient-gold" loading={sumLoading} />
        <StatCard label="Std Deviation" value={sumLoading ? '—' : `±${summary?.std_deviation?.toFixed(1) ?? 0}%`}
          icon={<BarChart3 size={18} />} color="bg-gradient-danger" loading={sumLoading} />
      </div>

      {/* Bias + Accuracy by Complexity */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <Card padding="p-5" className="xl:col-span-2">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="font-display font-semibold text-carbon dark:text-white">Accuracy by Complexity</h2>
              <p className="text-xs text-coolslate mt-0.5">Average accuracy per complexity level</p>
            </div>
            {summary && <Badge variant={biasColor}>{summary.bias === 'accurate' ? 'Accurate' : summary.bias === 'under-estimate' ? 'Under-estimating' : 'Over-estimating'}</Badge>}
          </div>
          {!complexity || complexity.length === 0 ? (
            <EmptyState icon={<BarChart3 size={24} />} title="No completed estimations" message="Complete estimations with actuals to see accuracy data" />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={complexity} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(120,130,145,0.1)" />
                <XAxis dataKey="complexity" tick={{ fontSize: 11, fill: '#788291' }} axisLine={false} tickLine={false} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#788291' }} axisLine={false} tickLine={false} unit="%" />
                <Tooltip contentStyle={{ borderRadius: 10, fontSize: 12, border: '1px solid #D2D7DC' }} formatter={(v: number) => [`${v.toFixed(1)}%`]} />
                <Bar dataKey="avg_accuracy" name="Avg Accuracy" radius={[5, 5, 0, 0]}>
                  {(complexity || []).map((entry) => (
                    <Cell key={entry.complexity} fill={COMPLEXITY_COLORS[entry.complexity] || '#788291'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>

        {/* Bias summary */}
        <Card padding="p-5">
          <h2 className="font-display font-semibold text-carbon dark:text-white mb-4">Performance Summary</h2>
          <div className="space-y-4">
            {[
              { label: 'Avg Accuracy', value: `${summary?.avg_accuracy?.toFixed(1) ?? '—'}%`, color: (summary?.avg_accuracy ?? 0) >= 80 ? '#19AA6E' : '#E15A50' },
              { label: 'Avg Variance', value: fmt.variance(summary?.avg_variance ?? 0), color: Math.abs(summary?.avg_variance ?? 0) < 10 ? '#19AA6E' : '#E15A50' },
              { label: 'Std Deviation', value: `±${summary?.std_deviation?.toFixed(1) ?? '—'}%`, color: '#9B875F' },
              { label: 'Estimation Bias', value: summary?.bias === 'accurate' ? 'Accurate' : summary?.bias === 'under-estimate' ? 'Under' : 'Over', color: summary?.bias === 'accurate' ? '#19AA6E' : '#E15A50' },
            ].map(({ label, value, color }) => (
              <div key={label} className="flex justify-between items-center pb-3 border-b border-lgrayblue/20 dark:border-slate-700/40 last:border-0 last:pb-0">
                <span className="text-sm text-coolslate">{label}</span>
                <span className="text-sm font-bold" style={{ color }}>{value}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Scatter + SP Band Table */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        {/* Scatter chart */}
        <Card padding="p-5">
          <h2 className="font-display font-semibold text-carbon dark:text-white mb-1">Estimated vs Actual Hours</h2>
          <p className="text-xs text-coolslate mb-4">Each dot is one completed estimation. Dots on the diagonal line = perfect accuracy.</p>
          {!scatter || scatter.length === 0 ? (
            <EmptyState icon={<BarChart3 size={24} />} title="No scatter data" message="Record actuals on completed estimations to see this chart" />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <ScatterChart margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(120,130,145,0.1)" />
                <XAxis dataKey="revised_min_hours" name="Estimated Min Hrs" tick={{ fontSize: 11, fill: '#788291' }} axisLine={false} tickLine={false} />
                <YAxis dataKey="actual_hours" name="Actual Hrs" tick={{ fontSize: 11, fill: '#788291' }} axisLine={false} tickLine={false} />
                <ReferenceLine segment={[{ x: 0, y: 0 }, { x: Math.max(...scatter.map(s => s.actual_hours)), y: Math.max(...scatter.map(s => s.actual_hours)) }]} stroke="#19AA6E" strokeDasharray="4 4" label={{ value: 'Perfect', fill: '#19AA6E', fontSize: 10 }} />
                <Tooltip contentStyle={{ borderRadius: 10, fontSize: 12, border: '1px solid #D2D7DC' }}
                  content={({ payload }) => {
                    if (!payload?.[0]?.payload) return null;
                    const d = payload[0].payload as any;
                    return (
                      <div className="bg-white dark:bg-carbon-700 border border-lgrayblue/30 dark:border-slate-600 rounded-xl p-3 text-xs shadow-modal">
                        <p className="font-semibold text-carbon dark:text-white mb-1">{d.title}</p>
                        <p>Estimated: {Number(d.revised_min_hours).toFixed(1)} hrs</p>
                        <p>Actual: {Number(d.actual_hours).toFixed(1)} hrs</p>
                        <p>Accuracy: {Number(d.accuracy_percent).toFixed(1)}%</p>
                      </div>
                    );
                  }}
                />
                <Scatter data={scatter} fill="#1E3246" opacity={0.7} />
              </ScatterChart>
            </ResponsiveContainer>
          )}
        </Card>

        {/* SP Band table */}
        <Card padding="p-5">
          <h2 className="font-display font-semibold text-carbon dark:text-white mb-4">Average Effort by Story Point Band</h2>
          {!spBands || spBands.length === 0 ? (
            <EmptyState icon={<BarChart3 size={24} />} title="No data" message="Record actuals to see story point band analysis" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-lgrayblue/30 dark:border-slate-700">
                    {['SP', 'Rev. Min Hrs', 'Avg Actual', 'Avg Variance', 'Count'].map(h => (
                      <th key={h} className="pb-2.5 text-left text-xs font-semibold text-coolslate uppercase tracking-wide pr-3 last:pr-0">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {spBands.map((b) => (
                    <tr key={b.story_points} className="border-b border-lgrayblue/10 dark:border-slate-700/30 last:border-0">
                      <td className="py-2.5 pr-3">
                        <div className="flex items-center gap-1.5">
                          <div className="w-2.5 h-2.5 rounded-full" style={{ background: SP_COLORS[b.story_points] || '#788291' }} />
                          <span className="font-bold text-carbon dark:text-white">{b.story_points}</span>
                        </div>
                      </td>
                      <td className="py-2.5 pr-3 text-coolslate">{Number(b.avg_revised_min_hours).toFixed(1)}</td>
                      <td className="py-2.5 pr-3 font-medium text-carbon dark:text-white">{Number(b.avg_actual_hours).toFixed(1)}</td>
                      <td className="py-2.5 pr-3">
                        <span className={cn('text-xs font-semibold', Number(b.avg_variance) > 0 ? 'text-vibrant' : 'text-greenline')}>
                          {Number(b.avg_variance) >= 0 ? '+' : ''}{Number(b.avg_variance).toFixed(1)}h
                        </span>
                      </td>
                      <td className="py-2.5 text-coolslate">{b.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
