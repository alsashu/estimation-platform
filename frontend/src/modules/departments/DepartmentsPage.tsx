import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, Plus, Edit2, ToggleLeft, ToggleRight, Users, FolderOpen, Trash2, Loader2 } from 'lucide-react';
import { departmentsApi, usersApi } from '../../services/api';
import { useAuthStore } from '../../store/authStore';
import { useToastStore } from '../../store';
import { Badge, Button, Card, Drawer, EmptyState, Input, Modal, MultiSelect, SearchInput, Skeleton, Textarea } from '../../components/ui';
import { fmt, cn } from '../../utils/formatters';
import type { Department } from '../../types';

type Form = { name: string; code: string; description: string; status: 'active' | 'inactive' };
const EMPTY: Form = { name: '', code: '', description: '', status: 'active' };

/** Invalidate everything that lists departments (admin list, header context, cascading lookups). */
function useInvalidateDepartments() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['departments'] });
    qc.invalidateQueries({ queryKey: ['hierarchy-context'] });
    qc.invalidateQueries({ queryKey: ['lookup'] });
  };
}

function DepartmentFormModal({ dept, onClose }: { dept: Department | null; onClose: () => void }) {
  const { addToast } = useToastStore();
  const invalidate = useInvalidateDepartments();
  const [form, setForm] = useState<Form>(dept
    ? { name: dept.name, code: dept.code, description: dept.description ?? '', status: dept.status }
    : EMPTY);
  const [touched, setTouched] = useState(false);
  const codeValid = /^[A-Za-z0-9_-]{2,50}$/.test(form.code);

  const mut = useMutation({
    mutationFn: () => dept
      ? departmentsApi.update(dept.id, { ...form, code: dept.is_system ? undefined : form.code } as Partial<Form>)
      : departmentsApi.create(form),
    onSuccess: () => { invalidate(); addToast({ type: 'success', title: dept ? 'Department updated' : 'Department created' }); onClose(); },
    onError: (e: Error) => addToast({ type: 'error', title: e.message }),
  });

  const submit = () => { setTouched(true); if (form.name.trim() && codeValid) mut.mutate(); };

  return (
    <Modal isOpen onClose={onClose} title={dept ? 'Edit Department' : 'Create Department'}
      footer={<>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={submit} loading={mut.isPending} icon={dept ? <Edit2 size={14} /> : <Plus size={14} />}>{dept ? 'Save Changes' : 'Create'}</Button>
      </>}>
      <div className="space-y-4">
        <Input label="Department Name *" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
          placeholder="e.g. Engineering" error={touched && !form.name.trim() ? 'Name is required' : undefined} />
        <Input label="Department Code *" value={form.code} disabled={dept?.is_system}
          onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} placeholder="e.g. ENG"
          hint={dept?.is_system ? 'The code of the system department cannot be changed' : 'Unique. Letters, numbers, - and _ (2–50 characters)'}
          error={touched && !codeValid ? 'Enter a valid unique code' : undefined} />
        <Textarea label="Description" rows={2} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
        <div>
          <label className="text-sm font-medium text-carbon dark:text-lgrayblue block mb-1">Status</label>
          <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as Form['status'] }))}
            className="w-full px-3 py-2.5 rounded-lg border border-lgrayblue dark:border-slate-600 bg-white dark:bg-carbon-800 text-sm text-carbon dark:text-white">
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
      </div>
    </Modal>
  );
}

/** Programs of a department + its users (with department-level access scope). */
function DepartmentDrawer({ dept, onClose }: { dept: Department; onClose: () => void }) {
  const { hasPermission } = useAuthStore();
  const { addToast } = useToastStore();
  const qc = useQueryClient();
  const invalidate = useInvalidateDepartments();
  const [userIds, setUserIds] = useState<string[]>([]);
  const [scope, setScope] = useState<'assigned' | 'all'>('assigned');

  const detail = useQuery({ queryKey: ['departments', dept.id], queryFn: () => departmentsApi.get(dept.id) });
  const users = useQuery({ queryKey: ['departments', dept.id, 'users'], queryFn: () => departmentsApi.listUsers(dept.id) });
  const allUsers = useQuery({
    queryKey: ['users', 'for-department'],
    queryFn: () => usersApi.list({ limit: 500 }),
    enabled: hasPermission('department.assign') && hasPermission('user.read'),
  });

  const refresh = () => { qc.invalidateQueries({ queryKey: ['departments', dept.id, 'users'] }); invalidate(); };
  const assign = useMutation({
    mutationFn: () => departmentsApi.assignUsers(dept.id, userIds, scope),
    onSuccess: () => { setUserIds([]); refresh(); addToast({ type: 'success', title: 'Users assigned to department' }); },
    onError: (e: Error) => addToast({ type: 'error', title: e.message }),
  });
  const remove = useMutation({
    mutationFn: (userId: string) => departmentsApi.removeUser(dept.id, userId),
    onSuccess: () => { refresh(); addToast({ type: 'success', title: 'User removed from department' }); },
    onError: (e: Error) => addToast({ type: 'error', title: e.message }),
  });

  const memberIds = new Set((users.data ?? []).map(u => u.id));
  const candidates = (allUsers.data?.data ?? []).filter(u => !memberIds.has(u.id))
    .map(u => ({ id: u.id, label: `${u.first_name} ${u.last_name}`, description: u.email }));

  return (
    <Drawer isOpen onClose={onClose} title={dept.name} subtitle={`${dept.code} · ${dept.status}`}>
      <div className="p-5 space-y-6">
        {dept.description && <p className="text-sm text-coolslate">{dept.description}</p>}

        <section>
          <h3 className="text-xs font-semibold text-coolslate uppercase tracking-wide mb-2 flex items-center gap-1.5"><FolderOpen size={13} /> Programs</h3>
          {detail.isLoading ? <Skeleton className="h-16" /> : (detail.data?.programs ?? []).length === 0 ? (
            <p className="text-sm text-coolslate">No programs in this department yet. Create one from Programs.</p>
          ) : (
            <ul className="divide-y divide-lgrayblue/20 dark:divide-slate-700 border border-lgrayblue/20 dark:border-slate-700 rounded-lg">
              {detail.data!.programs!.map(p => (
                <li key={p.id} className="flex items-center justify-between px-3 py-2 text-sm">
                  <span className="text-carbon dark:text-white">{p.name} {p.code && <span className="text-[11px] font-mono text-coolslate">{p.code}</span>}</span>
                  <span className="flex items-center gap-2 text-xs text-coolslate">{p.baseline_count} baselines <Badge variant={p.status === 'active' ? 'success' : 'neutral'}>{p.status}</Badge></span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h3 className="text-xs font-semibold text-coolslate uppercase tracking-wide mb-2 flex items-center gap-1.5"><Users size={13} /> Users &amp; access</h3>
          <p className="text-[11px] text-coolslate mb-3">
            <b>Assigned programs</b> — the user sees only the programs explicitly assigned to them. <b>All programs</b> — department-level access to every program in the department.
          </p>
          {hasPermission('department.assign') && hasPermission('user.read') && (
            <div className="space-y-2 mb-4 p-3 rounded-lg bg-lgrayblue/10 dark:bg-carbon-800/40">
              <MultiSelect options={candidates} selected={userIds} onChange={setUserIds} placeholder="Add users…" emptyMessage="No more users to add" />
              <div className="flex items-center gap-2">
                <select value={scope} onChange={e => setScope(e.target.value as 'assigned' | 'all')} aria-label="Access scope"
                  className="flex-1 px-3 py-2 rounded-lg border border-lgrayblue dark:border-slate-600 bg-white dark:bg-carbon-800 text-sm text-carbon dark:text-white">
                  <option value="assigned">Assigned programs only</option>
                  <option value="all">All programs in department</option>
                </select>
                <Button size="sm" onClick={() => assign.mutate()} disabled={userIds.length === 0} loading={assign.isPending}>Assign</Button>
              </div>
            </div>
          )}
          {users.isLoading ? <Skeleton className="h-16" /> : (users.data ?? []).length === 0 ? (
            <p className="text-sm text-coolslate">No users assigned.</p>
          ) : (
            <ul className="space-y-2">
              {users.data!.map(u => (
                <li key={u.id} className="flex items-start justify-between gap-2 p-2.5 rounded-lg border border-lgrayblue/20 dark:border-slate-700">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-carbon dark:text-white">{u.first_name} {u.last_name}</p>
                    <p className="text-[11px] text-coolslate truncate">{u.email}</p>
                    <p className="text-[11px] text-coolslate mt-0.5">
                      {u.access_scope === 'all' ? 'All programs' : u.programs.length ? u.programs.map(p => p.name).join(', ') : 'No programs assigned yet'}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <Badge variant={u.access_scope === 'all' ? 'info' : 'neutral'}>{u.access_scope === 'all' ? 'Department' : 'Assigned'}</Badge>
                    {hasPermission('department.assign') && (
                      <button type="button" aria-label={`Remove ${u.first_name}`} onClick={() => { if (confirm(`Remove ${u.first_name} ${u.last_name} from ${dept.name}? Their program assignments in this department are removed too.`)) remove.mutate(u.id); }}
                        className="p-1.5 rounded-md text-coolslate hover:text-vibrant hover:bg-vibrant/10"><Trash2 size={13} /></button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </Drawer>
  );
}

export default function DepartmentsPage() {
  const { hasPermission } = useAuthStore();
  const { addToast } = useToastStore();
  const invalidate = useInvalidateDepartments();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [editing, setEditing] = useState<Department | null | 'new'>(null);
  const [viewing, setViewing] = useState<Department | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['departments', search, status],
    queryFn: () => departmentsApi.list({ search: search || undefined, status: status || undefined }),
  });

  const toggle = useMutation({
    mutationFn: (d: Department) => departmentsApi.setStatus(d.id, d.status === 'active' ? 'inactive' : 'active'),
    onSuccess: (d) => { invalidate(); addToast({ type: 'success', title: `Department ${d.status === 'active' ? 'activated' : 'deactivated'}` }); },
    onError: (e: Error) => addToast({ type: 'error', title: e.message }),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-primary flex items-center justify-center"><Building2 size={18} className="text-white" /></div>
          <div>
            <h1 className="text-xl font-semibold text-carbon dark:text-white">Departments</h1>
            <p className="text-coolslate text-xs">{data?.total ?? 0} departments · top level of Department → Program → Baseline</p>
          </div>
        </div>
        {hasPermission('department.create') && (
          <Button onClick={() => setEditing('new')} icon={<Plus size={16} />}>New Department</Button>
        )}
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="flex-1 min-w-56"><SearchInput value={search} onChange={setSearch} placeholder="Search name or code…" /></div>
        <select value={status} onChange={e => setStatus(e.target.value)} aria-label="Status filter"
          className="px-3 py-2.5 rounded-lg border border-lgrayblue dark:border-slate-600 bg-white dark:bg-carbon-800 text-sm text-carbon dark:text-white">
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>

      <Card padding="p-0" className="overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-40"><Loader2 size={24} className="animate-spin text-coolslate" /></div>
        ) : !data?.data.length ? (
          <EmptyState icon={<Building2 size={28} />} title="No departments found" message="Create a department to start organising programs." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="departments-table">
              <thead>
                <tr className="border-b border-lgrayblue/30 dark:border-slate-700 text-left">
                  {['Department', 'Code', 'Programs', 'Users', 'Status', 'Created By', 'Created', ''].map(h => (
                    <th key={h} className="px-4 py-3 text-xs font-semibold text-coolslate uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.data.map(d => (
                  <tr key={d.id} className="border-b border-lgrayblue/10 dark:border-slate-700/30 hover:bg-lgrayblue/10 dark:hover:bg-slate-700/20">
                    <td className="px-4 py-3">
                      <button type="button" onClick={() => setViewing(d)} className="text-left">
                        <p className="font-medium text-carbon dark:text-white hover:underline">{d.name}</p>
                        {d.description && <p className="text-[11px] text-coolslate line-clamp-1 max-w-[18rem]">{d.description}</p>}
                      </button>
                      {d.is_system && <Badge variant="warning" className="mt-1">System</Badge>}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">{d.code}</td>
                    <td className="px-4 py-3">{d.program_count ?? 0}</td>
                    <td className="px-4 py-3">{d.user_count ?? 0}</td>
                    <td className="px-4 py-3"><Badge variant={d.status === 'active' ? 'success' : 'neutral'}>{d.status}</Badge></td>
                    <td className="px-4 py-3 text-coolslate">{d.created_by_name ?? (d.is_system ? 'System' : '—')}</td>
                    <td className="px-4 py-3 text-coolslate whitespace-nowrap">{fmt.date(d.created_at)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        <Button variant="ghost" size="xs" icon={<Users size={12} />} onClick={() => setViewing(d)}>View</Button>
                        {hasPermission('department.update') && (
                          <>
                            <Button variant="ghost" size="xs" icon={<Edit2 size={12} />} onClick={() => setEditing(d)}>Edit</Button>
                            <button type="button" onClick={() => toggle.mutate(d)}
                              className={cn('flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium', d.status === 'active' ? 'text-gold hover:bg-gold/10' : 'text-greenline hover:bg-greenline/10')}>
                              {d.status === 'active' ? <><ToggleRight size={13} /> Deactivate</> : <><ToggleLeft size={13} /> Activate</>}
                            </button>
                          </>
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

      {editing && <DepartmentFormModal dept={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      {viewing && <DepartmentDrawer dept={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}
