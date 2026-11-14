import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { GitBranch, Plus, Edit2, Trash2, ToggleLeft, ToggleRight, Boxes, Box, Building2, FolderOpen, Loader2, Check, X } from 'lucide-react';
import { baselinesApi, departmentsApi, programsApi } from '../../services/api';
import type { BaselineInput } from '../../services/api';
import { useAuthStore } from '../../store/authStore';
import { useHierarchyStore } from '../../store/hierarchyStore';
import { useToastStore } from '../../store';
import { Badge, Button, Card, ConfirmDialog, Drawer, EmptyState, Input, Modal, SearchInput, Skeleton, Textarea } from '../../components/ui';
import { SearchableSelect } from '../../components/ui/SearchableSelect';
import { fmt, cn } from '../../utils/formatters';
import type { Baseline, ComponentNode, SubcomponentNode } from '../../types';

function useInvalidateBaselines() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['baselines'] });
    qc.invalidateQueries({ queryKey: ['programs'] });
    qc.invalidateQueries({ queryKey: ['lookup'] });
  };
}

/** Department → Program pickers (active only) used by the create form and the page filter. */
function useDeptProgramOptions(departmentId: string | null, activeOnly: boolean) {
  const depts = useQuery({ queryKey: ['departments', 'options', !activeOnly], queryFn: () => departmentsApi.list(activeOnly ? { status: 'active' } : {}) });
  const programs = useQuery({
    queryKey: ['programs', 'options', departmentId, activeOnly],
    queryFn: () => programsApi.list({ limit: 500, departmentId: departmentId || undefined, ...(activeOnly ? { status: 'active' } : {}) }),
    enabled: !!departmentId,
  });
  return {
    departments: (depts.data?.data ?? []).map(d => ({ id: d.id, label: d.name, badge: d.code })),
    deptLoading: depts.isFetching,
    programs: (programs.data?.data ?? []).map(p => ({ id: p.id, label: p.name, badge: p.code })),
    programLoading: programs.isFetching,
  };
}

const dateOnly = (v?: string | null) => (v ? String(v).slice(0, 10) : '');

// ─── Create / Edit ────────────────────────────────────────────────────────────
function BaselineFormModal({ baseline, defaults, onClose }: {
  baseline: Baseline | null;
  defaults: { departmentId: string | null; programId: string | null };
  onClose: () => void;
}) {
  const { addToast } = useToastStore();
  const invalidate = useInvalidateBaselines();
  const [touched, setTouched] = useState(false);
  const [deptId, setDeptId] = useState<string | null>(baseline?.department_id ?? defaults.departmentId);
  const [form, setForm] = useState({
    program_id: baseline?.project_id ?? defaults.programId ?? '',
    name: baseline?.name ?? '', version: baseline?.version ?? '', description: baseline?.description ?? '',
    start_date: dateOnly(baseline?.start_date), end_date: dateOnly(baseline?.end_date),
    status: (baseline?.status ?? 'active') as 'active' | 'inactive',
  });
  const opts = useDeptProgramOptions(deptId, true);
  const datesOk = !form.start_date || !form.end_date || form.end_date >= form.start_date;

  const mut = useMutation({
    mutationFn: () => {
      const common = {
        name: form.name.trim(), version: form.version || null, description: form.description || null,
        start_date: form.start_date || null, end_date: form.end_date || null, status: form.status,
      };
      return baseline
        ? baselinesApi.update(baseline.id, common)
        : baselinesApi.create({ ...common, program_id: form.program_id, department_id: deptId ?? undefined } as BaselineInput);
    },
    onSuccess: () => { invalidate(); addToast({ type: 'success', title: baseline ? 'Baseline updated' : 'Baseline created' }); onClose(); },
    onError: (e: Error) => addToast({ type: 'error', title: e.message }),
  });

  const submit = () => { setTouched(true); if (form.program_id && form.name.trim() && datesOk) mut.mutate(); };

  return (
    <Modal isOpen onClose={onClose} title={baseline ? 'Edit Baseline' : 'Create Baseline'} size="lg"
      footer={<>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={submit} loading={mut.isPending}>{baseline ? 'Save Changes' : 'Create'}</Button>
      </>}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {baseline ? (
          <div className="sm:col-span-2 text-sm text-coolslate flex items-center gap-1.5">
            <Building2 size={13} /> {baseline.department_name} › <FolderOpen size={13} /> {baseline.program_name}
            <span className="text-[11px]">(a baseline cannot be moved to another program)</span>
          </div>
        ) : (
          <>
            <SearchableSelect label="Department" required testId="baseline-form-department" icon={<Building2 size={14} />}
              options={opts.departments} loading={opts.deptLoading} value={deptId}
              onChange={id => { setDeptId(id); setForm(f => ({ ...f, program_id: '' })); }}
              error={touched && !deptId ? 'Department is required' : undefined} />
            <SearchableSelect label="Program" required testId="baseline-form-program" icon={<FolderOpen size={14} />}
              options={opts.programs} loading={opts.programLoading} value={form.program_id || null}
              onChange={id => setForm(f => ({ ...f, program_id: id ?? '' }))}
              disabled={!deptId} disabledHint="Select a department first" emptyMessage="No active programs in this department"
              error={touched && !form.program_id ? 'A baseline must belong to a program' : undefined} />
          </>
        )}
        <Input label="Baseline Name *" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Release 1.0"
          error={touched && !form.name.trim() ? 'Name is required' : undefined} />
        <Input label="Baseline Version" value={form.version} onChange={e => setForm(f => ({ ...f, version: e.target.value }))} placeholder="e.g. v1.0" />
        <Input label="Start Date" type="date" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} />
        <Input label="End Date" type="date" value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))}
          error={!datesOk ? 'End date must be on or after the start date' : undefined} />
        <div className="sm:col-span-2"><Textarea label="Description" rows={2} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} /></div>
        <div>
          <label className="text-sm font-medium text-carbon dark:text-lgrayblue block mb-1">Status</label>
          <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as 'active' | 'inactive' }))}
            className="w-full px-3 py-2.5 rounded-lg border border-lgrayblue dark:border-slate-600 bg-white dark:bg-carbon-800 text-sm text-carbon dark:text-white">
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
      </div>
    </Modal>
  );
}

// ─── Inline add / rename row ──────────────────────────────────────────────────
function InlineName({ initial = '', placeholder, onSave, onCancel, saving }: {
  initial?: string; placeholder: string; onSave: (name: string) => void; onCancel: () => void; saving?: boolean;
}) {
  const [v, setV] = useState(initial);
  return (
    <form className="flex items-center gap-1.5" onSubmit={e => { e.preventDefault(); if (v.trim()) onSave(v.trim()); }}>
      <input autoFocus value={v} onChange={e => setV(e.target.value)} placeholder={placeholder} aria-label={placeholder}
        className="flex-1 px-2.5 py-1.5 rounded-md border border-lgrayblue dark:border-slate-600 bg-white dark:bg-carbon-800 text-sm text-carbon dark:text-white" />
      <button type="submit" disabled={!v.trim() || saving} aria-label="Save" className="p-1.5 rounded-md text-greenline hover:bg-greenline/10 disabled:opacity-40">
        {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
      </button>
      <button type="button" onClick={onCancel} aria-label="Cancel" className="p-1.5 rounded-md text-coolslate hover:bg-lgrayblue/30"><X size={14} /></button>
    </form>
  );
}

// ─── Baseline detail: Components → Subcomponents ──────────────────────────────
function BaselineDrawer({ baselineId, onClose }: { baselineId: string; onClose: () => void }) {
  const { hasPermission } = useAuthStore();
  const canManage = hasPermission('component.manage');
  const { addToast } = useToastStore();
  const qc = useQueryClient();
  const invalidate = useInvalidateBaselines();
  const [adding, setAdding] = useState<string | null>(null);   // 'component' | componentId (for subcomponent)
  const [renaming, setRenaming] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<{ kind: 'component' | 'subcomponent'; node: ComponentNode | SubcomponentNode } | null>(null);

  const { data: b, isLoading } = useQuery({ queryKey: ['baselines', baselineId], queryFn: () => baselinesApi.get(baselineId) });
  const refresh = () => { qc.invalidateQueries({ queryKey: ['baselines', baselineId] }); invalidate(); };
  const onErr = (e: Error) => addToast({ type: 'error', title: e.message });

  const addComp = useMutation({ mutationFn: (name: string) => baselinesApi.createComponent({ baseline_id: baselineId, name }), onSuccess: () => { setAdding(null); refresh(); }, onError: onErr });
  const addSub = useMutation({ mutationFn: ({ componentId, name }: { componentId: string; name: string }) => baselinesApi.createSubcomponent({ component_id: componentId, name }), onSuccess: () => { setAdding(null); refresh(); }, onError: onErr });
  const rename = useMutation({
    mutationFn: ({ kind, id, name }: { kind: 'component' | 'subcomponent'; id: string; name: string }) =>
      kind === 'component' ? baselinesApi.updateComponent(id, { name }) : baselinesApi.updateSubcomponent(id, { name }),
    onSuccess: () => { setRenaming(null); refresh(); }, onError: onErr,
  });
  const del = useMutation({
    mutationFn: () => deleting!.kind === 'component' ? baselinesApi.deleteComponent(deleting!.node.id) : baselinesApi.deleteSubcomponent(deleting!.node.id),
    onSuccess: () => { addToast({ type: 'success', title: `${deleting!.kind === 'component' ? 'Component' : 'Subcomponent'} deleted` }); setDeleting(null); refresh(); },
    onError: (e: Error) => { setDeleting(null); onErr(e); },
  });

  const taskCount = (n: { sp_task_count: number; pe_task_count: number }) => Number(n.sp_task_count) + Number(n.pe_task_count);

  return (
    <Drawer isOpen onClose={onClose} title={b?.name ?? 'Baseline'} subtitle={b ? `${b.department_name} › ${b.program_name}${b.version ? ` · ${b.version}` : ''}` : ''}>
      {isLoading || !b ? <div className="p-5"><Skeleton className="h-40" /></div> : (
        <div className="p-5 space-y-5">
          <div className="grid grid-cols-2 gap-2 text-center">
            <div className="bg-lgrayblue/20 dark:bg-carbon-800/50 rounded-lg p-2.5"><p className="text-xs text-coolslate">SP tasks</p><p className="text-lg font-bold text-carbon dark:text-white">{b.sp_task_count ?? 0}</p></div>
            <div className="bg-lgrayblue/20 dark:bg-carbon-800/50 rounded-lg p-2.5"><p className="text-xs text-coolslate">PE tasks</p><p className="text-lg font-bold text-carbon dark:text-white">{b.pe_task_count ?? 0}</p></div>
          </div>
          <p className="text-xs text-coolslate">
            {(Number(b.sp_unstructured_count ?? 0) + Number(b.pe_unstructured_count ?? 0))} task(s) sit directly under the baseline without a component — components are optional.
          </p>

          <section>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-semibold text-coolslate uppercase tracking-wide flex items-center gap-1.5"><Boxes size={13} /> Components (optional)</h3>
              {canManage && adding !== 'component' && <Button size="xs" variant="outline" icon={<Plus size={12} />} onClick={() => setAdding('component')}>Add component</Button>}
            </div>
            {adding === 'component' && <div className="mb-2"><InlineName placeholder="Component name" onSave={n => addComp.mutate(n)} onCancel={() => setAdding(null)} saving={addComp.isPending} /></div>}
            {(b.components ?? []).length === 0 && adding !== 'component' ? (
              <EmptyState icon={<Boxes size={24} />} title="No components" message="Tasks can be created directly under this baseline." />
            ) : (
              <ul className="space-y-2" data-testid="component-tree">
                {b.components!.map(c => (
                  <li key={c.id} className="rounded-lg border border-lgrayblue/20 dark:border-slate-700">
                    <div className="flex items-center gap-2 px-3 py-2">
                      <Boxes size={14} className="text-coolslate flex-shrink-0" />
                      {renaming === c.id ? (
                        <div className="flex-1"><InlineName initial={c.name} placeholder="Component name" onSave={n => rename.mutate({ kind: 'component', id: c.id, name: n })} onCancel={() => setRenaming(null)} saving={rename.isPending} /></div>
                      ) : (
                        <>
                          <span className="flex-1 text-sm font-medium text-carbon dark:text-white">{c.name}</span>
                          <span className="text-[11px] text-coolslate">{taskCount(c)} tasks</span>
                          {canManage && (
                            <>
                              <button type="button" aria-label={`Add subcomponent to ${c.name}`} onClick={() => setAdding(c.id)} className="p-1 rounded text-coolslate hover:text-carbon dark:hover:text-white"><Plus size={13} /></button>
                              <button type="button" aria-label={`Rename ${c.name}`} onClick={() => setRenaming(c.id)} className="p-1 rounded text-coolslate hover:text-carbon dark:hover:text-white"><Edit2 size={12} /></button>
                              <button type="button" aria-label={`Delete ${c.name}`} onClick={() => setDeleting({ kind: 'component', node: c })} className="p-1 rounded text-coolslate hover:text-vibrant"><Trash2 size={12} /></button>
                            </>
                          )}
                        </>
                      )}
                    </div>
                    {(c.subcomponents.length > 0 || adding === c.id) && (
                      <ul className="border-t border-lgrayblue/20 dark:border-slate-700 py-1">
                        {c.subcomponents.map(s => (
                          <li key={s.id} className="flex items-center gap-2 pl-8 pr-3 py-1.5">
                            <Box size={12} className="text-coolslate flex-shrink-0" />
                            {renaming === s.id ? (
                              <div className="flex-1"><InlineName initial={s.name} placeholder="Subcomponent name" onSave={n => rename.mutate({ kind: 'subcomponent', id: s.id, name: n })} onCancel={() => setRenaming(null)} saving={rename.isPending} /></div>
                            ) : (
                              <>
                                <span className="flex-1 text-sm text-carbon dark:text-white">{s.name}</span>
                                <span className="text-[11px] text-coolslate">{taskCount(s)} tasks</span>
                                {canManage && (
                                  <>
                                    <button type="button" aria-label={`Rename ${s.name}`} onClick={() => setRenaming(s.id)} className="p-1 rounded text-coolslate hover:text-carbon dark:hover:text-white"><Edit2 size={12} /></button>
                                    <button type="button" aria-label={`Delete ${s.name}`} onClick={() => setDeleting({ kind: 'subcomponent', node: s })} className="p-1 rounded text-coolslate hover:text-vibrant"><Trash2 size={12} /></button>
                                  </>
                                )}
                              </>
                            )}
                          </li>
                        ))}
                        {adding === c.id && (
                          <li className="pl-8 pr-3 py-1.5"><InlineName placeholder="Subcomponent name" onSave={n => addSub.mutate({ componentId: c.id, name: n })} onCancel={() => setAdding(null)} saving={addSub.isPending} /></li>
                        )}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
      <ConfirmDialog isOpen={!!deleting} onClose={() => setDeleting(null)} onConfirm={() => del.mutate()} loading={del.isPending}
        title={`Delete ${deleting?.kind ?? ''}`}
        message={deleting ? `Delete "${deleting.node.name}"? This is only allowed when no task uses it${deleting.kind === 'component' ? ' (its subcomponents are deleted too)' : ''}.` : ''} />
    </Drawer>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function BaselinesPage() {
  const { hasPermission } = useAuthStore();
  const { addToast } = useToastStore();
  const invalidate = useInvalidateBaselines();
  const [searchParams] = useSearchParams();
  const ctxDept = useHierarchyStore(s => s.selectedDepartmentId);
  const ctxProgram = useHierarchyStore(s => s.selectedProgramId);
  const [deptId, setDeptId] = useState<string | null>(ctxDept);
  const [programId, setProgramId] = useState<string | null>(searchParams.get('programId') ?? ctxProgram);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Baseline | null | 'new'>(null);
  const [viewing, setViewing] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Baseline | null>(null);
  const opts = useDeptProgramOptions(deptId, false);

  // When arriving with ?programId, align the department filter with that program
  const { data: linkedProgram } = useQuery({
    queryKey: ['programs', searchParams.get('programId')],
    queryFn: () => programsApi.get(searchParams.get('programId')!),
    enabled: !!searchParams.get('programId'),
  });
  useEffect(() => { if (linkedProgram) setDeptId(linkedProgram.department_id); }, [linkedProgram]);

  const { data, isLoading } = useQuery({
    queryKey: ['baselines', deptId, programId, search],
    queryFn: () => baselinesApi.list({ departmentId: deptId || undefined, programId: programId || undefined, search: search || undefined }),
  });

  const toggle = useMutation({
    mutationFn: (b: Baseline) => baselinesApi.setStatus(b.id, b.status === 'active' ? 'inactive' : 'active'),
    onSuccess: () => { invalidate(); addToast({ type: 'success', title: 'Baseline status updated' }); },
    onError: (e: Error) => addToast({ type: 'error', title: e.message }),
  });
  const del = useMutation({
    mutationFn: (b: Baseline) => baselinesApi.delete(b.id),
    onSuccess: () => { invalidate(); setDeleting(null); addToast({ type: 'success', title: 'Baseline deleted' }); },
    onError: (e: Error) => { setDeleting(null); addToast({ type: 'error', title: e.message }); },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-primary flex items-center justify-center"><GitBranch size={18} className="text-white" /></div>
          <div>
            <h1 className="text-xl font-semibold text-carbon dark:text-white">Baselines</h1>
            <p className="text-coolslate text-xs">{data?.total ?? 0} baselines · tasks are created under a baseline; components are optional</p>
          </div>
        </div>
        {hasPermission('baseline.create') && <Button onClick={() => setEditing('new')} icon={<Plus size={16} />}>New Baseline</Button>}
      </div>

      <div className="flex flex-wrap gap-3">
        <SearchableSelect className="w-56" ariaLabel="Filter by department" testId="baselines-department-filter" icon={<Building2 size={14} />}
          options={opts.departments} loading={opts.deptLoading} value={deptId} allOptionLabel="All Departments"
          onChange={id => { setDeptId(id); setProgramId(null); }} />
        <SearchableSelect className="w-56" ariaLabel="Filter by program" testId="baselines-program-filter" icon={<FolderOpen size={14} />}
          options={opts.programs} loading={opts.programLoading} value={programId} allOptionLabel="All Programs"
          onChange={setProgramId} disabled={!deptId} disabledHint="Select a department" />
        <div className="flex-1 min-w-48"><SearchInput value={search} onChange={setSearch} placeholder="Search baseline or version…" /></div>
      </div>

      <Card padding="p-0" className="overflow-hidden">
        {isLoading ? <div className="flex items-center justify-center h-40"><Loader2 size={24} className="animate-spin text-coolslate" /></div>
          : !data?.data.length ? <EmptyState icon={<GitBranch size={28} />} title="No baselines found" message="Create a baseline under a program to start estimating tasks." />
          : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-testid="baselines-table">
                <thead>
                  <tr className="border-b border-lgrayblue/30 dark:border-slate-700 text-left">
                    {['Baseline', 'Department / Program', 'Dates', 'Components', 'Tasks (SP / PE)', 'Status', ''].map(h => (
                      <th key={h} className="px-4 py-3 text-xs font-semibold text-coolslate uppercase tracking-wide whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.data.map(b => (
                    <tr key={b.id} className="border-b border-lgrayblue/10 dark:border-slate-700/30 hover:bg-lgrayblue/10 dark:hover:bg-slate-700/20">
                      <td className="px-4 py-3">
                        <button type="button" className="text-left" onClick={() => setViewing(b.id)}>
                          <p className="font-medium text-carbon dark:text-white hover:underline">{b.name}</p>
                          <p className="text-[11px] text-coolslate">{b.version ?? '—'}</p>
                        </button>
                        {b.is_legacy && <Badge variant="warning" className="mt-1">Legacy</Badge>}
                      </td>
                      <td className="px-4 py-3"><p className="text-carbon dark:text-white">{b.program_name}</p><p className="text-[11px] text-coolslate">{b.department_name}</p></td>
                      <td className="px-4 py-3 text-coolslate whitespace-nowrap text-xs">{b.start_date ? fmt.date(b.start_date) : '—'} → {b.end_date ? fmt.date(b.end_date) : '—'}</td>
                      <td className="px-4 py-3">{b.component_count ?? 0}</td>
                      <td className="px-4 py-3">{b.sp_task_count ?? 0} / {b.pe_task_count ?? 0}</td>
                      <td className="px-4 py-3"><Badge variant={b.status === 'active' ? 'success' : 'neutral'}>{b.status}</Badge></td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 justify-end">
                          <Button variant="ghost" size="xs" icon={<Boxes size={12} />} onClick={() => setViewing(b.id)}>Components</Button>
                          {hasPermission('baseline.update') && (
                            <>
                              <Button variant="ghost" size="xs" icon={<Edit2 size={12} />} onClick={() => setEditing(b)}>Edit</Button>
                              <button type="button" onClick={() => toggle.mutate(b)}
                                className={cn('flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium', b.status === 'active' ? 'text-gold hover:bg-gold/10' : 'text-greenline hover:bg-greenline/10')}>
                                {b.status === 'active' ? <><ToggleRight size={13} /> Deactivate</> : <><ToggleLeft size={13} /> Activate</>}
                              </button>
                            </>
                          )}
                          {hasPermission('baseline.delete') && (
                            <button type="button" aria-label={`Delete ${b.name}`} onClick={() => setDeleting(b)} className="p-1.5 rounded-md text-coolslate hover:text-vibrant hover:bg-vibrant/10"><Trash2 size={13} /></button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </Card>

      {editing && <BaselineFormModal baseline={editing === 'new' ? null : editing} defaults={{ departmentId: deptId, programId }} onClose={() => setEditing(null)} />}
      {viewing && <BaselineDrawer baselineId={viewing} onClose={() => setViewing(null)} />}
      <ConfirmDialog isOpen={!!deleting} onClose={() => setDeleting(null)} onConfirm={() => deleting && del.mutate(deleting)} loading={del.isPending}
        title="Delete baseline" message={deleting ? `Delete "${deleting.name}"? Only baselines without tasks can be deleted — deactivate it otherwise.` : ''} />
    </div>
  );
}
