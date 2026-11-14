import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { FolderOpen, Plus, Users, BarChart3, Loader2, Edit2, Trash2, ToggleLeft, ToggleRight, GitBranch, Building2, Sigma } from 'lucide-react';
import { programsApi, departmentsApi, usersApi } from '../../services/api';
import type { ProgramRecord } from '../../services/api';
import { useAuthStore } from '../../store/authStore';
import { useToastStore } from '../../store';
import { Badge, Button, Drawer, Input, Modal, MultiSelect, SearchInput, Skeleton, Textarea } from '../../components/ui';
import { SearchableSelect } from '../../components/ui/SearchableSelect';
import { fmt, cn } from '../../utils/formatters';

type Form = { department_id: string; name: string; code: string; description: string; status: string };

function useInvalidatePrograms() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['programs'] });
    qc.invalidateQueries({ queryKey: ['departments'] });
    qc.invalidateQueries({ queryKey: ['hierarchy-context'] });
    qc.invalidateQueries({ queryKey: ['lookup'] });
  };
}

function useDepartmentOptions(includeInactive = false) {
  const { data, isFetching } = useQuery({
    queryKey: ['departments', 'options', includeInactive],
    queryFn: () => departmentsApi.list(includeInactive ? {} : { status: 'active' }),
  });
  return {
    loading: isFetching,
    options: (data?.data ?? []).map(d => ({ id: d.id, label: d.name, badge: d.code, description: d.status === 'inactive' ? 'Inactive' : undefined })),
  };
}

function ProgramFormModal({ program, onClose }: { program: ProgramRecord | null; onClose: () => void }) {
  const { addToast } = useToastStore();
  const invalidate = useInvalidatePrograms();
  const departments = useDepartmentOptions();
  const [touched, setTouched] = useState(false);
  const [form, setForm] = useState<Form>(program
    ? { department_id: program.department_id, name: program.name, code: program.code ?? '', description: program.description ?? '', status: program.status }
    : { department_id: '', name: '', code: '', description: '', status: 'active' });

  const mut = useMutation({
    mutationFn: () => {
      const body = { ...form, code: form.code || undefined, description: form.description || undefined };
      return program ? programsApi.update(program.id, body) : programsApi.create(body);
    },
    onSuccess: () => { invalidate(); addToast({ type: 'success', title: program ? 'Program updated' : 'Program created' }); onClose(); },
    onError: (e: Error) => addToast({ type: 'error', title: e.message }),
  });

  const moving = program && form.department_id !== program.department_id;
  const submit = () => { setTouched(true); if (form.department_id && form.name.trim()) mut.mutate(); };

  return (
    <Modal isOpen onClose={onClose} title={program ? 'Edit Program' : 'Create Program'}
      footer={<>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={submit} loading={mut.isPending} icon={program ? <Edit2 size={14} /> : <Plus size={14} />}>{program ? 'Save Changes' : 'Create'}</Button>
      </>}>
      <div className="space-y-4">
        <SearchableSelect label="Department" required testId="program-form-department" icon={<Building2 size={14} />}
          options={departments.options} loading={departments.loading}
          value={form.department_id || null} onChange={id => setForm(f => ({ ...f, department_id: id ?? '' }))}
          placeholder="Select department…" emptyMessage="No active departments — create one first"
          error={touched && !form.department_id ? 'A program cannot be created without a department' : undefined} />
        {moving && (
          <p className="text-xs text-gold">Moving the program moves all its baselines and tasks to the new department. Assigned users keep access.</p>
        )}
        <Input label="Program Name *" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Alpha Platform"
          error={touched && !form.name.trim() ? 'Name is required' : undefined} />
        <Input label="Program Code" value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} placeholder="e.g. AP" hint="Unique identifier" />
        <Textarea label="Description" rows={2} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
        <div>
          <label className="text-sm font-medium text-carbon dark:text-lgrayblue block mb-1">Status</label>
          <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
            className="w-full px-3 py-2.5 rounded-lg border border-lgrayblue dark:border-slate-600 bg-white dark:bg-carbon-800 text-sm text-carbon dark:text-white">
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="archived">Archived</option>
          </select>
        </div>
      </div>
    </Modal>
  );
}

function ProgramDrawer({ program, onClose }: { program: ProgramRecord; onClose: () => void }) {
  const { hasPermission } = useAuthStore();
  const { addToast } = useToastStore();
  const qc = useQueryClient();
  const invalidate = useInvalidatePrograms();
  const [userIds, setUserIds] = useState<string[]>([]);
  const detail = useQuery({ queryKey: ['programs', program.id], queryFn: () => programsApi.get(program.id) });
  const canAssign = hasPermission('project.assign') && hasPermission('user.read');
  const allUsers = useQuery({ queryKey: ['users', 'for-program'], queryFn: () => usersApi.list({ limit: 500 }), enabled: canAssign });

  const refresh = () => { qc.invalidateQueries({ queryKey: ['programs', program.id] }); invalidate(); };
  const assign = useMutation({
    mutationFn: () => programsApi.assignUsers(program.id, userIds),
    onSuccess: () => { setUserIds([]); refresh(); addToast({ type: 'success', title: 'Users assigned', message: 'They also become members of the program\'s department.' }); },
    onError: (e: Error) => addToast({ type: 'error', title: e.message }),
  });
  const remove = useMutation({
    mutationFn: (userId: string) => programsApi.removeUser(program.id, userId),
    onSuccess: () => { refresh(); addToast({ type: 'success', title: 'User removed from program' }); },
    onError: (e: Error) => addToast({ type: 'error', title: e.message }),
  });

  const members = detail.data?.users ?? [];
  const memberIds = new Set(members.map(u => u.id));
  const candidates = (allUsers.data?.data ?? []).filter(u => !memberIds.has(u.id))
    .map(u => ({ id: u.id, label: `${u.first_name} ${u.last_name}`, description: u.email }));

  return (
    <Drawer isOpen onClose={onClose} title={program.name} subtitle={`${program.department_name ?? ''}${program.code ? ` · ${program.code}` : ''}`}>
      <div className="p-5 space-y-6">
        <section>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-semibold text-coolslate uppercase tracking-wide flex items-center gap-1.5"><GitBranch size={13} /> Baselines</h3>
            <Link to={`/baselines?programId=${program.id}`} className="text-xs text-carbon dark:text-lgrayblue hover:underline">Manage baselines →</Link>
          </div>
          {detail.isLoading ? <Skeleton className="h-12" /> : (detail.data?.baselines ?? []).length === 0 ? (
            <p className="text-sm text-coolslate">No baselines yet. Tasks need a baseline — create one under Baselines.</p>
          ) : (
            <ul className="divide-y divide-lgrayblue/20 dark:divide-slate-700 border border-lgrayblue/20 dark:border-slate-700 rounded-lg">
              {detail.data!.baselines!.map(b => (
                <li key={b.id} className="flex items-center justify-between px-3 py-2 text-sm">
                  <span className="text-carbon dark:text-white">{b.name} {b.version && <span className="text-[11px] font-mono text-coolslate">{b.version}</span>}</span>
                  <span className="flex gap-1.5">{b.is_legacy && <Badge variant="warning">Legacy</Badge>}<Badge variant={b.status === 'active' ? 'success' : 'neutral'}>{b.status}</Badge></span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h3 className="text-xs font-semibold text-coolslate uppercase tracking-wide mb-2 flex items-center gap-1.5"><Users size={13} /> Assigned users</h3>
          {canAssign && (
            <div className="flex gap-2 mb-3">
              <div className="flex-1"><MultiSelect options={candidates} selected={userIds} onChange={setUserIds} placeholder="Add users…" emptyMessage="No more users to add" /></div>
              <Button size="sm" onClick={() => assign.mutate()} disabled={!userIds.length} loading={assign.isPending}>Assign</Button>
            </div>
          )}
          {detail.isLoading ? <Skeleton className="h-12" /> : members.length === 0 ? <p className="text-sm text-coolslate">No users assigned.</p> : (
            <ul className="space-y-1.5">
              {members.map(u => (
                <li key={u.id} className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-lgrayblue/20 dark:border-slate-700">
                  <div className="min-w-0"><p className="text-sm text-carbon dark:text-white">{u.name}</p><p className="text-[11px] text-coolslate truncate">{u.email}</p></div>
                  {hasPermission('project.assign') && (
                    <button type="button" aria-label={`Remove ${u.name}`} onClick={() => remove.mutate(u.id)} className="p-1.5 rounded-md text-coolslate hover:text-vibrant hover:bg-vibrant/10"><Trash2 size={13} /></button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </Drawer>
  );
}

export default function ProgramsPage() {
  const { hasPermission } = useAuthStore();
  const { addToast } = useToastStore();
  const invalidate = useInvalidatePrograms();
  const departments = useDepartmentOptions(true);
  const [search, setSearch] = useState('');
  const [departmentId, setDepartmentId] = useState<string | null>(null);
  const [editing, setEditing] = useState<ProgramRecord | null | 'new'>(null);
  const [viewing, setViewing] = useState<ProgramRecord | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['programs', search, departmentId],
    queryFn: () => programsApi.list({ limit: 200, search: search || undefined, departmentId: departmentId || undefined }),
  });

  const toggleStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => programsApi.update(id, { status }),
    onSuccess: () => { invalidate(); addToast({ type: 'success', title: 'Program updated' }); },
    onError: (e: Error) => addToast({ type: 'error', title: e.message }),
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => programsApi.delete(id),
    onSuccess: () => { invalidate(); addToast({ type: 'success', title: 'Program deleted' }); },
    onError: (e: Error) => addToast({ type: 'error', title: e.message }),
  });

  const statusColor = (s: string) => s === 'active' ? 'bg-greenline/10 text-greenline' : s === 'inactive' ? 'bg-lgrayblue/30 text-coolslate' : 'bg-gold/10 text-gold';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-primary flex items-center justify-center"><FolderOpen size={18} className="text-white" /></div>
          <div>
            <h1 className="text-xl font-semibold text-carbon dark:text-white">Programs</h1>
            <p className="text-coolslate text-xs">{data?.total ?? 0} programs · every program belongs to a department</p>
          </div>
        </div>
        {hasPermission('project.create') && <Button onClick={() => setEditing('new')} icon={<Plus size={16} />}>New Program</Button>}
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="flex-1 min-w-56"><SearchInput value={search} onChange={setSearch} placeholder="Search programs…" /></div>
        <SearchableSelect className="w-60" ariaLabel="Filter by department" testId="programs-department-filter" icon={<Building2 size={14} />}
          options={departments.options} loading={departments.loading} value={departmentId} onChange={setDepartmentId}
          allOptionLabel="All Departments" placeholder="All Departments" />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-40"><Loader2 size={24} className="animate-spin text-coolslate" /></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {data?.data?.map((p: ProgramRecord) => (
            <div key={p.id} className="bg-white dark:bg-carbon-800 rounded-2xl border border-lgrayblue/30 dark:border-slate-700 p-5 hover:shadow-card transition-shadow flex flex-col">
              <div className="flex items-start justify-between mb-3">
                <button type="button" onClick={() => setViewing(p)} className="flex items-center gap-2.5 min-w-0 text-left">
                  <div className="w-9 h-9 rounded-xl bg-gradient-primary flex items-center justify-center flex-shrink-0"><FolderOpen size={16} className="text-white" /></div>
                  <div className="min-w-0">
                    <p className="font-semibold text-carbon dark:text-white text-sm truncate hover:underline">{p.name}</p>
                    <p className="text-coolslate text-[11px] truncate flex items-center gap-1"><Building2 size={10} /> {p.department_name}{p.code && <span className="font-mono"> · {p.code}</span>}</p>
                  </div>
                </button>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium flex-shrink-0 ml-2 ${statusColor(p.status)}`}>{p.status}</span>
              </div>

              {p.description && <p className="text-coolslate text-xs mb-3 line-clamp-2 flex-1">{p.description}</p>}

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3 border-t border-lgrayblue/20 dark:border-slate-700/50 text-xs text-coolslate">
                <span className="flex items-center gap-1.5"><Users size={12} /> {p.user_count ?? 0}</span>
                <span className="flex items-center gap-1.5"><GitBranch size={12} /> {p.baseline_count ?? 0} baselines</span>
                <span className="flex items-center gap-1.5"><BarChart3 size={12} /> {p.estimation_count ?? 0} SP</span>
                <span className="flex items-center gap-1.5"><Sigma size={12} /> {p.parametric_estimation_count ?? 0} PE</span>
                <span className="ml-auto text-[10px] text-coolslate/60">{fmt.date(p.created_at)}</span>
              </div>

              <div className="flex items-center gap-1.5 pt-3 border-t border-lgrayblue/10 dark:border-slate-700/30">
                <Button variant="ghost" size="xs" icon={<Users size={12} />} onClick={() => setViewing(p)}>Details</Button>
                {hasPermission('project.update') && (
                  <>
                    <Button variant="ghost" size="xs" icon={<Edit2 size={12} />} onClick={() => setEditing(p)}>Edit</Button>
                    <button type="button" onClick={() => toggleStatus.mutate({ id: p.id, status: p.status === 'active' ? 'inactive' : 'active' })}
                      className={cn('flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors', p.status === 'active' ? 'text-gold hover:bg-gold/10' : 'text-greenline hover:bg-greenline/10')}>
                      {p.status === 'active' ? <><ToggleRight size={13} /> Deactivate</> : <><ToggleLeft size={13} /> Activate</>}
                    </button>
                  </>
                )}
                {hasPermission('project.delete') && (
                  <button type="button" onClick={() => { if (confirm(`Delete program "${p.name}"? This cannot be undone.`)) deleteMut.mutate(p.id); }}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-coolslate hover:text-vibrant hover:bg-vibrant/10 transition-colors ml-auto">
                    <Trash2 size={12} /> Delete
                  </button>
                )}
              </div>
            </div>
          ))}
          {!data?.data?.length && <div className="col-span-3 text-center py-12 text-coolslate text-sm">No programs found</div>}
        </div>
      )}

      {editing && <ProgramFormModal program={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      {viewing && <ProgramDrawer program={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}
