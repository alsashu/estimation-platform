import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Power, History as HistoryIcon, Eye } from 'lucide-react';
import { Button, Input, Modal, Select, Skeleton, Textarea } from '../../components/ui';
import { SearchableSelect } from '../../components/ui/SearchableSelect';
import { performanceApi } from '../../services/api';
import { useHierarchyStore } from '../../store/hierarchyStore';
import { fmtNum, fmtPct } from './kpiFormat';
import type { HistoricalBaseline, HistoricalBaselineInput, KpiSettings, SnapshotSummary } from './types';

const apiError = (e: unknown) => {
  const x = e as { response?: { data?: { error?: string } }; message?: string };
  return x?.response?.data?.error || x?.message || 'Request failed';
};

// ─── Historical baseline form validation (mirrors the API) ───────────────────

export interface BaselineDraft {
  department_id: string | null;
  program_id: string | null;
  estimation_method: 'ALL' | 'SP' | 'PE';
  label: string;
  period_from: string;
  period_to: string;
  record_count: string;
  total_estimated_pd: string;
  total_actual_pd: string;
  total_abs_error_pd: string;
  source_note: string;
}

export const EMPTY_DRAFT: BaselineDraft = {
  department_id: null, program_id: null, estimation_method: 'ALL', label: '', period_from: '', period_to: '',
  record_count: '', total_estimated_pd: '', total_actual_pd: '', total_abs_error_pd: '', source_note: '',
};

export function validateBaselineDraft(d: BaselineDraft): Record<string, string> {
  const e: Record<string, string> = {};
  const n = (s: string) => (s.trim() === '' ? NaN : Number(s));
  if (!d.department_id) e.department_id = 'Department is required';
  if (!d.label.trim()) e.label = 'Label is required';
  const rc = n(d.record_count);
  if (!Number.isInteger(rc) || rc <= 0) e.record_count = 'Enter a whole number greater than 0';
  const est = n(d.total_estimated_pd), act = n(d.total_actual_pd), abs = n(d.total_abs_error_pd);
  if (!(est > 0)) e.total_estimated_pd = 'Must be greater than 0';
  if (!(act >= 0)) e.total_actual_pd = 'Must be 0 or more';
  if (!(abs >= 0)) e.total_abs_error_pd = 'Must be 0 or more';
  else if (est > 0 && act >= 0 && abs + 0.05 < Math.abs(est - act)) {
    e.total_abs_error_pd = `Cannot be less than |Estimated − Actual| = ${Math.abs(est - act).toFixed(2)}`;
  }
  if (d.period_from && d.period_to && d.period_from > d.period_to) e.period_to = 'End must not be before start';
  return e;
}

export function draftToInput(d: BaselineDraft): HistoricalBaselineInput {
  return {
    department_id: d.department_id!, program_id: d.program_id, estimation_method: d.estimation_method,
    label: d.label.trim(), period_from: d.period_from || null, period_to: d.period_to || null,
    record_count: Number(d.record_count), total_estimated_pd: Number(d.total_estimated_pd),
    total_actual_pd: Number(d.total_actual_pd), total_abs_error_pd: Number(d.total_abs_error_pd),
    source_note: d.source_note.trim() || null,
  };
}

function toDraft(b: HistoricalBaseline): BaselineDraft {
  return {
    department_id: b.department_id, program_id: b.program_id, estimation_method: b.estimation_method,
    label: b.label, period_from: b.period_from ?? '', period_to: b.period_to ?? '',
    record_count: String(b.record_count), total_estimated_pd: String(b.total_estimated_pd),
    total_actual_pd: String(b.total_actual_pd), total_abs_error_pd: String(b.total_abs_error_pd),
    source_note: b.source_note ?? '',
  };
}

// ─── Historical baselines manager ────────────────────────────────────────────

export function HistoricalBaselinesModal({ isOpen, onClose, canManage }: { isOpen: boolean; onClose: () => void; canManage: boolean }) {
  const qc = useQueryClient();
  const [showInactive, setShowInactive] = useState(false);
  const [editing, setEditing] = useState<HistoricalBaseline | 'new' | null>(null);
  const list = useQuery({
    queryKey: ['performance', 'baselines', showInactive],
    queryFn: () => performanceApi.baselines({ includeInactive: showInactive ? 'true' : undefined }),
    enabled: isOpen,
  });
  const status = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => performanceApi.setBaselineStatus(id, active),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['performance'] }),
  });

  return (
    <Modal isOpen={isOpen} onClose={() => { setEditing(null); onClose(); }} size="xl"
      title={editing ? (editing === 'new' ? 'New historical baseline' : `Edit “${editing.label}” (creates v${editing.version + 1})`) : 'Historical Baselines (pre-framework)'}>
      {editing ? (
        <BaselineForm initial={editing === 'new' ? null : editing} onDone={() => { setEditing(null); qc.invalidateQueries({ queryKey: ['performance'] }); }} onCancel={() => setEditing(null)} />
      ) : (
        <div className="space-y-3" data-testid="baselines-manager">
          <p className="text-xs text-coolslate">
            The approved estimation performance <strong>without the framework</strong> — the historical side of EBI. Enter totals from
            the pre-framework records per Department (or Program). Edits create a new version; old versions stay for reproducibility.
          </p>
          <div className="flex items-center justify-between gap-2">
            <label className="text-xs text-coolslate inline-flex items-center gap-1.5">
              <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} /> Show inactive / superseded
            </label>
            {canManage && <Button size="xs" icon={<Plus size={13} />} onClick={() => setEditing('new')}>Add baseline</Button>}
          </div>
          {status.isError && <p role="alert" className="text-xs text-vibrant">{apiError(status.error)}</p>}
          {list.isLoading ? <Skeleton className="h-32" /> : !list.data?.length ? (
            <p className="text-sm text-coolslate text-center py-8">No historical baselines yet. EBI shows N/A until one is added.</p>
          ) : (
            <div className="overflow-x-auto max-h-[55vh]">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-coolslate border-b border-lgrayblue/40 dark:border-slate-700">
                    <th className="py-1.5 pr-2 font-medium">Baseline</th>
                    <th className="py-1.5 pr-2 font-medium">Scope</th>
                    <th className="py-1.5 pr-2 font-medium text-right">Records</th>
                    <th className="py-1.5 pr-2 font-medium text-right">Est. PD</th>
                    <th className="py-1.5 pr-2 font-medium text-right">|Error| PD</th>
                    <th className="py-1.5 pr-2 font-medium text-right">Hist. ED</th>
                    <th className="py-1.5 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {list.data.map(b => (
                    <tr key={b.id} className={`border-b border-lgrayblue/20 dark:border-slate-700/60 ${b.is_active ? '' : 'opacity-60'}`}>
                      <td className="py-1.5 pr-2">
                        <span className="font-medium text-carbon dark:text-white">{b.label}</span>
                        <span className="block text-[10.5px] text-coolslate">
                          v{b.version}{b.is_active ? '' : ' · inactive'}{b.period_from ? ` · ${b.period_from} → ${b.period_to ?? '…'}` : ''}
                        </span>
                      </td>
                      <td className="py-1.5 pr-2">{b.department_name}{b.program_name ? ` / ${b.program_name}` : ' (department)'} · {b.estimation_method}</td>
                      <td className="py-1.5 pr-2 text-right tabular-nums">{b.record_count}</td>
                      <td className="py-1.5 pr-2 text-right tabular-nums">{fmtNum(b.total_estimated_pd)}</td>
                      <td className="py-1.5 pr-2 text-right tabular-nums">{fmtNum(b.total_abs_error_pd)}</td>
                      <td className="py-1.5 pr-2 text-right tabular-nums">{fmtPct(b.aggregate_ed)}</td>
                      <td className="py-1.5 text-right whitespace-nowrap">
                        {canManage && b.is_active && (
                          <>
                            <button type="button" aria-label={`Edit ${b.label}`} onClick={() => setEditing(b)} className="p-1 text-coolslate hover:text-carbon dark:hover:text-white"><Pencil size={13} /></button>
                            <button type="button" aria-label={`Deactivate ${b.label}`} onClick={() => status.mutate({ id: b.id, active: false })} className="p-1 text-coolslate hover:text-vibrant"><Power size={13} /></button>
                          </>
                        )}
                        {canManage && !b.is_active && !list.data.some(x => x.supersedes_id === b.id) && (
                          <button type="button" aria-label={`Reactivate ${b.label}`} onClick={() => status.mutate({ id: b.id, active: true })} className="p-1 text-coolslate hover:text-greenline"><Power size={13} /></button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {!canManage && <p className="text-[11px] text-coolslate">Read-only: managing baselines requires the “performance.baseline.manage” permission.</p>}
        </div>
      )}
    </Modal>
  );
}

function BaselineForm({ initial, onDone, onCancel }: { initial: HistoricalBaseline | null; onDone: () => void; onCancel: () => void }) {
  const departments = useHierarchyStore(s => s.departments);
  const programs = useHierarchyStore(s => s.programs);
  const [d, setD] = useState<BaselineDraft>(() => (initial ? toDraft(initial) : { ...EMPTY_DRAFT, department_id: departments.length === 1 ? departments[0].id : null }));
  const [touched, setTouched] = useState(false);
  const errors = validateBaselineDraft(d);
  const deptPrograms = useMemo(() => programs.filter(p => p.department_id === d.department_id), [programs, d.department_id]);
  const set = <K extends keyof BaselineDraft>(k: K, v: BaselineDraft[K]) => setD(p => ({ ...p, [k]: v }));
  useEffect(() => { if (d.program_id && !deptPrograms.some(p => p.id === d.program_id)) set('program_id', null); }, [d.department_id]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = useMutation({
    mutationFn: () => (initial ? performanceApi.updateBaseline(initial.id, draftToInput(d)) : performanceApi.createBaseline(draftToInput(d))),
    onSuccess: onDone,
  });
  const est = Number(d.total_estimated_pd), abs = Number(d.total_abs_error_pd);
  const preview = est > 0 && abs >= 0 ? (abs / est) * 100 : null;
  const err = (k: string) => (touched ? errors[k] : undefined);

  return (
    <form className="space-y-3" noValidate data-testid="baseline-form"
      onSubmit={e => { e.preventDefault(); setTouched(true); if (Object.keys(errors).length === 0) save.mutate(); }}>
      <div className="grid sm:grid-cols-2 gap-3">
        <SearchableSelect label="Department" required options={departments.map(x => ({ id: x.id, label: x.name }))} value={d.department_id}
          onChange={v => set('department_id', v)} error={err('department_id')} testId="baseline-department" />
        <SearchableSelect label="Program (optional)" options={deptPrograms.map(x => ({ id: x.id, label: x.name }))} value={d.program_id}
          onChange={v => set('program_id', v)} allOptionLabel="Whole department" disabled={!d.department_id} disabledHint="Select a department first" />
        <Select label="Estimation method" value={d.estimation_method} onChange={e => set('estimation_method', e.target.value as BaselineDraft['estimation_method'])}
          options={[{ value: 'ALL', label: 'All methods' }, { value: 'SP', label: 'Story Point (SP)' }, { value: 'PE', label: 'Parametric (PE)' }]} />
        <Input label="Label" value={d.label} onChange={e => set('label', e.target.value)} error={err('label')} placeholder="e.g. FY2025 pre-framework" />
        <Input label="Period from" type="date" value={d.period_from} onChange={e => set('period_from', e.target.value)} />
        <Input label="Period to" type="date" value={d.period_to} onChange={e => set('period_to', e.target.value)} error={err('period_to')} />
        <Input label="Number of records" type="number" min={1} step={1} value={d.record_count} onChange={e => set('record_count', e.target.value)} error={err('record_count')} />
        <Input label="Total estimated PD" type="number" min={0} step="0.01" value={d.total_estimated_pd} onChange={e => set('total_estimated_pd', e.target.value)} error={err('total_estimated_pd')} />
        <Input label="Total actual PD" type="number" min={0} step="0.01" value={d.total_actual_pd} onChange={e => set('total_actual_pd', e.target.value)} error={err('total_actual_pd')} />
        <Input label="Total absolute error PD (Σ|E − A|)" type="number" min={0} step="0.01" value={d.total_abs_error_pd} onChange={e => set('total_abs_error_pd', e.target.value)} error={err('total_abs_error_pd')} />
      </div>
      <Textarea label="Source / approval note" rows={2} value={d.source_note} onChange={e => set('source_note', e.target.value)} placeholder="Where the figures come from and who approved them" />
      <p className="text-xs text-coolslate">Historical Aggregate ED = Σ|E − A| / ΣE × 100 = <strong className="text-carbon dark:text-white" data-testid="baseline-ed-preview">{fmtPct(preview)}</strong></p>
      {save.isError && <p role="alert" className="text-xs text-vibrant">{apiError(save.error)}</p>}
      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
        <Button type="submit" loading={save.isPending}>{initial ? 'Save new version' : 'Create baseline'}</Button>
      </div>
    </form>
  );
}

// ─── KPI settings ────────────────────────────────────────────────────────────

export function KpiSettingsModal({ isOpen, onClose, settings, canManage }: { isOpen: boolean; onClose: () => void; settings: KpiSettings; canManage: boolean }) {
  const qc = useQueryClient();
  const [s, setS] = useState<KpiSettings>(settings);
  const [bounds, setBounds] = useState(settings.distribution_bounds.join(', '));
  useEffect(() => { if (isOpen) { setS(settings); setBounds(settings.distribution_bounds.join(', ')); } }, [isOpen, settings]);
  const save = useMutation({
    mutationFn: (body: KpiSettings) => performanceApi.updateSettings(body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['performance'] }); onClose(); },
  });
  const parsedBounds = bounds.split(',').map(x => Number(x.trim())).filter(x => Number.isFinite(x) && x > 0);
  const num = (v: string) => (v === '' ? NaN : Number(v));
  const T = (k: keyof KpiSettings['thresholds'], f: 'good' | 'warning') => (
    <input type="number" step="0.5" aria-label={`${k} ${f}`} disabled={!canManage} value={Number.isFinite(s.thresholds[k][f]) ? s.thresholds[k][f] : ''}
      onChange={e => setS(p => ({ ...p, thresholds: { ...p.thresholds, [k]: { ...p.thresholds[k], [f]: num(e.target.value) } } }))}
      className="w-20 rounded-md border border-lgrayblue dark:border-slate-600 bg-white dark:bg-carbon-800 text-carbon dark:text-white px-2 py-1 text-xs" />
  );
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="KPI thresholds & settings" size="lg"
      footer={canManage ? <>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button loading={save.isPending} onClick={() => save.mutate({ ...s, distribution_bounds: parsedBounds })}>Save</Button>
      </> : <Button variant="outline" onClick={onClose}>Close</Button>}>
      <div className="space-y-4 text-xs" data-testid="kpi-settings">
        <table className="w-full">
          <thead><tr className="text-left text-coolslate"><th className="py-1 font-medium">KPI</th><th className="py-1 font-medium">On track</th><th className="py-1 font-medium">Watch</th><th className="py-1 font-medium">Rule</th></tr></thead>
          <tbody className="text-carbon dark:text-lgrayblue">
            <tr><td className="py-1">EFA</td><td>≥ {T('efa', 'good')}</td><td>≥ {T('efa', 'warning')}</td><td className="text-coolslate">higher is better</td></tr>
            <tr><td className="py-1">EEI</td><td>≥ {T('eei', 'good')}</td><td>≥ {T('eei', 'warning')}</td><td className="text-coolslate">higher is better</td></tr>
            <tr><td className="py-1">ED</td><td>|ED| ≤ {T('ed', 'good')}</td><td>|ED| ≤ {T('ed', 'warning')}</td><td className="text-coolslate">closer to 0 is better</td></tr>
            <tr><td className="py-1">EBI</td><td>≥ {T('ebi', 'good')}</td><td>≥ {T('ebi', 'warning')}</td><td className="text-coolslate">higher is better</td></tr>
          </tbody>
        </table>
        <div className="grid sm:grid-cols-3 gap-3">
          <Input label="On-target tolerance (±%)" type="number" disabled={!canManage} value={Number.isFinite(s.on_target_tolerance) ? s.on_target_tolerance : ''}
            onChange={e => setS(p => ({ ...p, on_target_tolerance: num(e.target.value) }))} />
          <Input label="Histogram bounds (%)" disabled={!canManage} value={bounds} onChange={e => setBounds(e.target.value)} hint="e.g. 5, 10, 20, 30" />
          <Input label="Default range (days)" type="number" disabled={!canManage} value={Number.isFinite(s.default_range_days) ? s.default_range_days : ''}
            onChange={e => setS(p => ({ ...p, default_range_days: num(e.target.value) }))} />
        </div>
        {save.isError && <p role="alert" className="text-vibrant">{apiError(save.error)}</p>}
      </div>
    </Modal>
  );
}

// ─── Snapshots ───────────────────────────────────────────────────────────────

export function SnapshotsModal({ isOpen, onClose, filters, onView }: {
  isOpen: boolean; onClose: () => void; filters: Record<string, unknown>; onView: (id: string) => void;
}) {
  const qc = useQueryClient();
  const [label, setLabel] = useState('');
  const list = useQuery({ queryKey: ['performance', 'snapshots'], queryFn: performanceApi.snapshots, enabled: isOpen });
  const create = useMutation({
    mutationFn: () => performanceApi.createSnapshot(label.trim(), filters),
    onSuccess: () => { setLabel(''); qc.invalidateQueries({ queryKey: ['performance', 'snapshots'] }); },
  });
  const v = (x: string | null) => (x == null ? 'N/A' : fmtPct(Number(x), 1));
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Report snapshots" size="xl">
      <div className="space-y-4" data-testid="snapshots">
        <p className="text-xs text-coolslate">A snapshot freezes the dashboard for the current filters — recalculated on the server, including the historical baseline versions used — so the report can be reproduced later.</p>
        <form className="flex gap-2" onSubmit={e => { e.preventDefault(); if (label.trim()) create.mutate(); }}>
          <div className="flex-1"><Input aria-label="Snapshot label" placeholder="e.g. Q4 management review" value={label} onChange={e => setLabel(e.target.value)} /></div>
          <Button type="submit" icon={<HistoryIcon size={14} />} loading={create.isPending} disabled={!label.trim()}>Save snapshot</Button>
        </form>
        {create.isError && <p role="alert" className="text-xs text-vibrant">{apiError(create.error)}</p>}
        {list.isLoading ? <Skeleton className="h-24" /> : !list.data?.length ? <p className="text-sm text-coolslate text-center py-6">No snapshots yet.</p> : (
          <div className="overflow-x-auto max-h-[45vh]">
            <table className="w-full text-xs">
              <thead><tr className="text-left text-coolslate border-b border-lgrayblue/40 dark:border-slate-700">
                <th className="py-1.5 pr-2 font-medium">Snapshot</th><th className="py-1.5 pr-2 font-medium">Period</th>
                <th className="py-1.5 pr-2 font-medium text-right">EFA</th><th className="py-1.5 pr-2 font-medium text-right">ED</th>
                <th className="py-1.5 pr-2 font-medium text-right">EBI</th><th className="py-1.5 pr-2 font-medium text-right">EEI</th><th />
              </tr></thead>
              <tbody>
                {list.data.map((sn: SnapshotSummary) => (
                  <tr key={sn.id} className="border-b border-lgrayblue/20 dark:border-slate-700/60">
                    <td className="py-1.5 pr-2"><span className="font-medium text-carbon dark:text-white">{sn.label}</span>
                      <span className="block text-[10.5px] text-coolslate">{new Date(sn.created_at).toLocaleString()} · {sn.created_by_username ?? '—'}</span></td>
                    <td className="py-1.5 pr-2">{String(sn.filters.from ?? '')} → {String(sn.filters.to ?? '')}</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">{v(sn.efa)}</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">{v(sn.ed)}</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">{v(sn.ebi)}</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">{v(sn.eei)}</td>
                    <td className="py-1.5 text-right"><Button size="xs" variant="ghost" icon={<Eye size={12} />} onClick={() => onView(sn.id)}>View</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Modal>
  );
}
