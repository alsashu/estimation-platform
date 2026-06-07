import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { History, Plus, Search, Filter, Download, Eye, Edit2, Trash2, CheckCircle, ClipboardList, Save, Upload } from 'lucide-react';
import { Link } from 'react-router-dom';
import { estimationsApi } from '../../services/api';
import { ImportModal } from './ImportModal';
import { Button, Card, Badge, Drawer, Modal, EmptyState, SearchInput, Skeleton, SPDot, ConfirmDialog } from '../../components/ui';
import { useToastStore } from '../../store';
import { fmt, accuracyBg, accuracyColor, cn } from '../../utils/formatters';
import { SP_COLORS, COMPLEXITY_COLORS } from '../../config/theme';
import type { Estimation, ComplexityLevel, RiskLevel, EstimationStatus } from '../../types';

const COMPLEXITY_OPTIONS = ['', 'Low', 'Medium', 'High', 'Very High', 'Unmanageable'];
const RISK_OPTIONS = ['', 'Low', 'Medium', 'High', 'Very High', 'Unknown'];
const STATUS_OPTIONS = ['', 'open', 'completed'];

function EstimationRow({ est, onView, onDelete }: { est: Estimation; onView: (e: Estimation) => void; onDelete: (e: Estimation) => void }) {
  return (
    <tr className="group hover:bg-lgrayblue/10 dark:hover:bg-slate-700/20 transition-colors border-b border-lgrayblue/20 dark:border-slate-700/40 last:border-0">
      <td className="px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <SPDot color={SP_COLORS[est.story_points] || '#788291'} size={8} />
          <div>
            <p className="text-sm font-medium text-carbon dark:text-white">{est.title}</p>
            <p className="text-xs text-coolslate">{est.project_name || '—'}</p>
          </div>
        </div>
      </td>
      <td className="px-4 py-3.5 hidden md:table-cell">
        <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: COMPLEXITY_COLORS[est.complexity] + '18', color: COMPLEXITY_COLORS[est.complexity] }}>
          {est.complexity}
        </span>
      </td>
      <td className="px-4 py-3.5 hidden lg:table-cell">
        <span className="text-sm font-bold text-carbon dark:text-white" style={{ color: SP_COLORS[est.story_points] }}>{est.story_points} SP</span>
      </td>
      <td className="px-4 py-3.5">
        <div>
          <p className="text-sm font-semibold text-carbon dark:text-white">{fmt.range(est.revised_min_hours, est.revised_max_hours, 'hrs')}</p>
          <p className="text-xs text-coolslate hidden sm:block">{fmt.range(est.revised_min_days, est.revised_max_days, 'days')}</p>
        </div>
      </td>
      <td className="px-4 py-3.5 hidden sm:table-cell">
        {est.estimated_hours != null
          ? <p className="text-sm font-semibold text-carbon dark:text-white">{fmt.hours(est.estimated_hours)}</p>
          : <span className="text-coolslate text-xs">—</span>}
      </td>
      <td className="px-4 py-3.5 hidden sm:table-cell">
        {est.actual_hours != null ? (
          <div>
            <p className="text-sm font-semibold text-carbon dark:text-white">{fmt.hours(est.actual_hours)}</p>
            {est.actual_days != null && (
              <p className="text-xs text-coolslate">{fmt.days(est.actual_days)}</p>
            )}
          </div>
        ) : <span className="text-coolslate text-xs">—</span>}
      </td>
      <td className="px-4 py-3.5 hidden lg:table-cell">
        {est.variance_hours != null ? (
          <span className={cn('text-sm font-semibold',
            Number(est.variance_hours) > 0 ? 'text-vibrant' :
            Number(est.variance_hours) < 0 ? 'text-greenline' :
            'text-carbon dark:text-white'
          )}>
            {fmt.variance(est.variance_hours)}
          </span>
        ) : <span className="text-coolslate text-xs">—</span>}
      </td>
      <td className="px-4 py-3.5 hidden lg:table-cell">
        {est.accuracy_percent != null ? (
          <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-full border', accuracyBg(est.accuracy_percent))}>
            {Number(est.accuracy_percent).toFixed(1)}%
          </span>
        ) : <span className="text-coolslate text-xs">—</span>}
      </td>
      <td className="px-4 py-3.5">
        <Badge variant={est.status === 'completed' ? 'success' : 'neutral'}>{est.status}</Badge>
      </td>
      <td className="px-4 py-3.5">
        <p className="text-xs text-coolslate">{fmt.date(est.created_at)}</p>
      </td>
      <td className="px-4 py-3.5">
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={() => onView(est)} className="p-1.5 rounded-lg hover:bg-carbon/10 dark:hover:bg-slate-700 text-coolslate hover:text-carbon dark:hover:text-white transition-colors">
            <Eye size={14} />
          </button>
          <button onClick={() => onDelete(est)} className="p-1.5 rounded-lg hover:bg-vibrant/10 text-coolslate hover:text-vibrant transition-colors">
            <Trash2 size={14} />
          </button>
        </div>
      </td>
    </tr>
  );
}

function ActualsForm({ estimation, onSave, loading }: {
  estimation: Estimation;
  onSave: (data: { estimated_hours?: number; actual_hours?: number; notes?: string }) => void;
  loading: boolean;
}) {
  const [estimatedHours, setEstimatedHours] = useState('');
  const [actualHours, setActualHours] = useState('');
  const [notes, setNotes] = useState(estimation.notes || '');

  const hasEstimate = estimation.estimated_hours != null;
  const savedEstimate = hasEstimate ? Number(estimation.estimated_hours) : null;

  const parsedEst = parseFloat(estimatedHours);
  const validEst = !isNaN(parsedEst) && parsedEst > 0;

  const parsedAct = parseFloat(actualHours);
  const validAct = !isNaN(parsedAct) && parsedAct > 0;

  // Metrics preview — only when actual hours is entered in Phase 2
  let previewAccuracy: number | null = null;
  let previewVariance: number | null = null;
  let previewDeviation: number | null = null;
  if (validAct && savedEstimate != null && savedEstimate > 0) {
    previewVariance = parsedAct - savedEstimate;
    previewDeviation = Math.abs(previewVariance) / savedEstimate * 100;
    previewAccuracy = Math.max(0, 100 - previewDeviation);
  }

  const inputClass = 'w-full px-3 py-2.5 rounded-lg border border-lgrayblue dark:border-slate-600 bg-white dark:bg-carbon-800 text-sm text-carbon dark:text-white focus:outline-none focus:ring-2 focus:ring-carbon/20 focus:border-carbon transition-colors';
  const textareaClass = `${inputClass} resize-none`;

  if (!hasEstimate) {
    // Phase 1: Enter estimated hours before starting the task
    return (
      <div className="space-y-4">
        <div>
          <label className="text-sm font-medium text-carbon dark:text-lgrayblue block mb-1">Estimated Hours *</label>
          <input type="number" value={estimatedHours} onChange={(e) => setEstimatedHours(e.target.value)}
            min="0" step="0.5" placeholder="e.g. 40" className={inputClass}
          />
          <p className="text-xs text-coolslate mt-1">Enter your estimate before starting work. System revised range: {fmt.range(estimation.revised_min_hours, estimation.revised_max_hours, 'hrs')}</p>
        </div>
        <div>
          <label className="text-sm font-medium text-carbon dark:text-lgrayblue block mb-1">Notes</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
            placeholder="Any notes about your estimate…" className={textareaClass}
          />
        </div>
        <Button variant="outline" onClick={() => validEst && onSave({ estimated_hours: parsedEst, notes })}
          loading={loading} disabled={!validEst} className="w-full">
          <Save size={15} /> Save Estimate
        </Button>
      </div>
    );
  }

  // Phase 2: Enter actual hours after completing the task
  return (
    <div className="space-y-4">
      <div className="bg-lgrayblue/15 dark:bg-carbon-800/50 rounded-xl p-3 flex items-center justify-between">
        <div>
          <p className="text-xs text-coolslate">Your Estimate</p>
          <p className="text-sm font-semibold text-carbon dark:text-white">{fmt.hours(savedEstimate!)}</p>
        </div>
        <span className="text-xs text-coolslate">System: {fmt.range(estimation.revised_min_hours, estimation.revised_max_hours, 'hrs')}</span>
      </div>
      <div>
        <label className="text-sm font-medium text-carbon dark:text-lgrayblue block mb-1">Actual Hours *</label>
        <input type="number" value={actualHours} onChange={(e) => setActualHours(e.target.value)}
          min="0" step="0.5" placeholder="e.g. 45" className={inputClass}
        />
        <p className="text-xs text-coolslate mt-1">Enter hours actually spent after completing the task.</p>
      </div>
      {validAct && previewAccuracy !== null && (
        <div className="bg-lgrayblue/15 dark:bg-carbon-800/50 rounded-xl p-3 space-y-2">
          <p className="text-[10px] font-semibold text-coolslate uppercase tracking-widest">Calculated Metrics</p>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <p className="text-xs text-coolslate mb-0.5">Accuracy</p>
              <p className={cn('text-sm font-semibold', previewAccuracy >= 85 ? 'text-greenline' : previewAccuracy >= 70 ? 'text-gold' : 'text-vibrant')}>
                {previewAccuracy.toFixed(1)}%
              </p>
            </div>
            <div>
              <p className="text-xs text-coolslate mb-0.5">Variance</p>
              <p className={cn('text-sm font-semibold', previewVariance! > 0 ? 'text-vibrant' : 'text-greenline')}>
                {fmt.variance(previewVariance!)}
              </p>
            </div>
            <div>
              <p className="text-xs text-coolslate mb-0.5">Deviation</p>
              <p className="text-sm font-semibold text-carbon dark:text-white">{previewDeviation!.toFixed(1)}%</p>
            </div>
          </div>
        </div>
      )}
      <div>
        <label className="text-sm font-medium text-carbon dark:text-lgrayblue block mb-1">Notes</label>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
          placeholder="Any notes about the actual effort…" className={textareaClass}
        />
      </div>
      <Button variant="success" onClick={() => validAct && onSave({ actual_hours: parsedAct, notes })}
        loading={loading} disabled={!validAct} className="w-full">
        <CheckCircle size={15} /> Record Actuals
      </Button>
    </div>
  );
}

export default function HistoricalData() {
  const qc = useQueryClient();
  const { addToast } = useToastStore();
  const [search, setSearch] = useState('');
  const [complexity, setComplexity] = useState('');
  const [risk, setRisk] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [drawerEst, setDrawerEst] = useState<Estimation | null>(null);
  const [deleteEst, setDeleteEst] = useState<Estimation | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  const params = { search: search || undefined, complexity: complexity || undefined, risk: risk || undefined, status: status || undefined, page, limit: 15 };

  const { data, isLoading } = useQuery({
    queryKey: ['estimations', params],
    queryFn: () => estimationsApi.getAll(params as any),
    retry: false,
  });

  const actualsMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: { estimated_hours?: number; actual_hours?: number; notes?: string } }) => estimationsApi.recordActuals(id, body),
    onSuccess: (updated) => {
      qc.invalidateQueries({ queryKey: ['estimations'] });
      setDrawerEst(updated);
      if (updated.actual_hours != null) {
        qc.invalidateQueries({ queryKey: ['analysis-summary'] });
        addToast({ type: 'success', title: 'Actuals recorded', message: updated.accuracy_percent != null ? `${Number(updated.accuracy_percent).toFixed(1)}% accuracy` : '' });
      } else {
        addToast({ type: 'success', title: 'Estimate saved' });
      }
    },
    onError: (e: Error) => addToast({ type: 'error', title: 'Error', message: e.message }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => estimationsApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['estimations'] });
      setDeleteEst(null);
      addToast({ type: 'success', title: 'Estimation deleted' });
    },
    onError: (e: Error) => addToast({ type: 'error', title: 'Error', message: e.message }),
  });

  const estimations: Estimation[] = data?.data || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / 15);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold text-carbon dark:text-white flex items-center gap-2">
            <History size={22} /> Historical Data
          </h1>
          <p className="text-sm text-coolslate mt-0.5">{total} estimations total</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" icon={<Download size={15} />}>Export CSV</Button>
          <Button variant="outline" size="sm" icon={<Upload size={15} />} onClick={() => setImportOpen(true)}>Import Excel</Button>
          <Link to="/estimate"><Button size="sm" icon={<Plus size={15} />}>New Estimate</Button></Link>
        </div>
      </div>

      {/* Filters */}
      <Card padding="p-4">
        <div className="flex flex-wrap gap-3">
          <div className="flex-1 min-w-48"><SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search title or project…" /></div>
          {[
            { label: 'Complexity', value: complexity, options: COMPLEXITY_OPTIONS, set: setComplexity },
            { label: 'Risk', value: risk, options: RISK_OPTIONS, set: setRisk },
            { label: 'Status', value: status, options: STATUS_OPTIONS, set: setStatus },
          ].map(({ label, value, options, set }) => (
            <select key={label} value={value} onChange={(e) => { set(e.target.value); setPage(1); }}
              className="px-3 py-2.5 rounded-lg border border-lgrayblue dark:border-slate-600 bg-white dark:bg-carbon-800 text-sm text-carbon dark:text-white focus:outline-none focus:ring-2 focus:ring-carbon/20"
            >
              <option value="">{label}</option>
              {options.filter(Boolean).map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          ))}
          {(search || complexity || risk || status) && (
            <Button variant="ghost" size="sm" onClick={() => { setSearch(''); setComplexity(''); setRisk(''); setStatus(''); setPage(1); }}>Clear</Button>
          )}
        </div>
      </Card>

      {/* Table */}
      <Card padding="p-0">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-lgrayblue/30 dark:border-slate-700">
                {['Task', 'Complexity', 'SP', 'Revised Effort', 'Est. Hours', 'Actual Hours', 'Variance', 'Accuracy', 'Status', 'Date', ''].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-coolslate uppercase tracking-wide first:pl-5">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="border-b border-lgrayblue/20 dark:border-slate-700/40">
                    {Array.from({ length: 11 }).map((_, j) => (
                      <td key={j} className="px-4 py-3.5"><Skeleton className="h-4 w-full" /></td>
                    ))}
                  </tr>
                ))
              ) : estimations.length === 0 ? (
                <tr><td colSpan={11}>
                  <EmptyState icon={<ClipboardList size={28} />} title="No estimations found"
                    message={search || complexity ? "Try adjusting your filters" : "Create your first estimation to get started"}
                    action={<Link to="/estimate"><Button size="sm">New Estimate</Button></Link>}
                  />
                </td></tr>
              ) : estimations.map((e) => (
                <EstimationRow key={e.id} est={e} onView={setDrawerEst} onDelete={setDeleteEst} />
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

      {/* Detail Drawer */}
      <Drawer isOpen={!!drawerEst} onClose={() => setDrawerEst(null)} title={drawerEst?.title || ''} subtitle={drawerEst?.project_name}>
        {drawerEst && (
          <div className="p-5 space-y-5">
            <div className="grid grid-cols-2 gap-3">
              {[
                { l: 'Complexity', v: drawerEst.complexity },
                { l: 'Risk', v: drawerEst.risk },
                { l: 'Competency', v: drawerEst.competency },
                { l: 'Story Points', v: String(drawerEst.story_points) },
                { l: 'Overhead', v: fmt.pct(drawerEst.overhead_percent) },
                { l: 'Status', v: drawerEst.status },
              ].map(({ l, v }) => (
                <div key={l} className="bg-lgrayblue/20 dark:bg-carbon-800/50 rounded-lg p-2.5">
                  <p className="text-xs text-coolslate">{l}</p>
                  <p className="text-sm font-semibold text-carbon dark:text-white">{v}</p>
                </div>
              ))}
            </div>
            <div>
              <p className="text-xs font-semibold text-coolslate uppercase tracking-wide mb-2">Initial Effort</p>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="text-carbon dark:text-white"><span className="text-coolslate">Min:</span> {fmt.range(drawerEst.initial_min_days, drawerEst.initial_max_days, 'days')}</div>
                <div className="text-carbon dark:text-white"><span className="text-coolslate">Hrs:</span> {fmt.range(drawerEst.initial_min_hours, drawerEst.initial_max_hours, 'hrs')}</div>
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold text-coolslate uppercase tracking-wide mb-2">Revised Effort</p>
              <div className="grid grid-cols-2 gap-3">
                {[{ label: 'Min', days: drawerEst.revised_min_days, hours: drawerEst.revised_min_hours }, { label: 'Max', days: drawerEst.revised_max_days, hours: drawerEst.revised_max_hours }].map(col => (
                  <div key={col.label} className="bg-carbon dark:bg-carbon-800 rounded-xl p-3 text-center">
                    <p className="text-white/50 text-xs">{col.label}</p>
                    <p className="text-white font-display font-bold">{Number(col.hours).toFixed(1)} hrs</p>
                    <p className="text-white/40 text-xs">{Number(col.days).toFixed(2)} days</p>
                  </div>
                ))}
              </div>
            </div>
            {drawerEst.estimated_hours != null && drawerEst.actual_hours == null && (
              <div className="bg-lgrayblue/20 dark:bg-carbon-800/50 border border-lgrayblue/30 dark:border-slate-700 rounded-xl p-3">
                <p className="text-xs font-semibold text-coolslate uppercase tracking-wide mb-1">Estimate Saved</p>
                <p className="text-sm font-semibold text-carbon dark:text-white">{fmt.hours(Number(drawerEst.estimated_hours))}</p>
                <p className="text-xs text-coolslate mt-0.5">Awaiting actual hours after task completion</p>
              </div>
            )}
            {drawerEst.actual_hours != null && (
              <div className="bg-greenline/10 border border-greenline/20 rounded-xl p-4 space-y-3">
                <p className="text-xs font-semibold text-greenline uppercase tracking-wide">Actuals Recorded</p>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  {drawerEst.estimated_hours != null && (
                    <div><span className="text-coolslate">Estimated: </span><span className="font-semibold text-carbon dark:text-white">{fmt.hours(drawerEst.estimated_hours)}</span></div>
                  )}
                  <div><span className="text-coolslate">Actual: </span><span className="font-semibold text-carbon dark:text-white">{fmt.hours(drawerEst.actual_hours)}</span></div>
                  <div><span className="text-coolslate">Variance: </span><span className="font-semibold text-carbon dark:text-white">{fmt.variance(drawerEst.variance_hours || 0)}</span></div>
                  {drawerEst.accuracy_percent != null && (
                    <div><span className="text-coolslate">Deviation: </span><span className="font-semibold text-carbon dark:text-white">{(100 - Number(drawerEst.accuracy_percent)).toFixed(1)}%</span></div>
                  )}
                </div>
                {drawerEst.accuracy_percent != null && (
                  <div className="text-center mt-2">
                    <span className={cn('text-2xl font-display font-bold', accuracyColor(Number(drawerEst.accuracy_percent)))}>
                      {Number(drawerEst.accuracy_percent).toFixed(1)}%
                    </span>
                    <p className="text-xs text-coolslate">accuracy</p>
                  </div>
                )}
              </div>
            )}
            {drawerEst.status === 'open' && (
              <div className="border-t border-lgrayblue/30 dark:border-slate-700 pt-5">
                <p className="text-sm font-semibold text-carbon dark:text-white mb-3">
                  {drawerEst.estimated_hours == null ? 'Save Your Estimate' : 'Record Actual Time'}
                </p>
                <ActualsForm estimation={drawerEst}
                  onSave={(data) => actualsMutation.mutate({ id: drawerEst.id, body: data })}
                  loading={actualsMutation.isPending}
                />
              </div>
            )}
            {drawerEst.notes && (
              <div>
                <p className="text-xs font-semibold text-coolslate uppercase tracking-wide mb-1">Notes</p>
                <p className="text-sm text-carbon dark:text-lgrayblue">{drawerEst.notes}</p>
              </div>
            )}
            <p className="text-xs text-coolslate">Created {fmt.datetime(drawerEst.created_at)}</p>
          </div>
        )}
      </Drawer>

      {/* Import modal */}
      <ImportModal
        isOpen={importOpen}
        onClose={() => setImportOpen(false)}
        onSuccess={() => qc.invalidateQueries({ queryKey: ['estimations'] })}
      />

      {/* Delete confirm */}
      <ConfirmDialog
        isOpen={!!deleteEst} onClose={() => setDeleteEst(null)}
        onConfirm={() => deleteEst && deleteMutation.mutate(deleteEst.id)}
        loading={deleteMutation.isPending}
        title="Delete Estimation"
        message={`Are you sure you want to delete "${deleteEst?.title}"? This action cannot be undone.`}
      />
    </div>
  );
}
