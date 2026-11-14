import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Users, Plus, Search, CheckCircle, XCircle, Loader2, Key, Edit2, Trash2, RefreshCw } from 'lucide-react';
import { usersApi, rolesApi, projectsApi, departmentsApi, authApi } from '../../services/api';
import type { DepartmentGrant } from '../../services/api';
import type { UserRecord } from '../../services/api';
import { useAuthStore } from '../../store/authStore';
import { useToastStore } from '../../store';
import { MultiSelect } from '../../components/ui';
import { fmt } from '../../utils/formatters';
import { EstimationModuleAccessField } from '../../components/access/EstimationModuleAccessField';
import { normalizeModules, validateModuleSelection, type ModuleCode } from '../../utils/moduleAccess';
import { syncAccessFromServer } from '../../services/api';

// ─── Shared form fields ───────────────────────────────────────────────────────

const INPUT = 'w-full px-3 py-2 rounded-lg border border-lgrayblue/40 dark:border-slate-600 bg-white dark:bg-carbon-700 text-carbon dark:text-white text-sm focus:outline-none focus:ring-1 focus:ring-carbon/30';
const LABEL = 'text-xs font-medium text-coolslate uppercase tracking-wide block mb-1';

type UserForm = {
  firstName: string; lastName: string; username: string; email: string; password: string;
  roleIds: string[]; projectIds: string[]; departments: DepartmentGrant[];
  /** Estimation Module Access (SP / PE) — independent of the role. */
  modules: ModuleCode[];
};

interface ModuleFieldContext {
  actorModules: ModuleCode[];
  targetModules?: ModuleCode[];
  targetIsGlobalSuperAdmin?: boolean;
  showErrors: boolean;
}

function UserFormFields({
  form, setForm, roles, projectsList, departmentsList, generatingPass, onGeneratePass, moduleCtx,
}: {
  moduleCtx: ModuleFieldContext;
  form: UserForm;
  setForm: React.Dispatch<React.SetStateAction<UserForm>>;
  roles: { id: string; name: string; description?: string }[];
  projectsList: { id: string; name: string; code?: string; description?: string; department_id?: string; department_name?: string }[];
  departmentsList: { id: string; name: string; code: string }[];
  generatingPass: boolean;
  onGeneratePass: () => void;
}) {
  const roleOptions = roles.map(r => ({ id: r.id, label: r.name, description: r.description }));
  const departmentOptions = departmentsList.map(d => ({ id: d.id, label: d.name, description: `Code: ${d.code}` }));
  const selectedDeptIds = form.departments.map(d => d.id);
  // Program access must respect its parent department: only programs of selected departments are offered
  const projectOptions = projectsList
    .filter(p => !p.department_id || selectedDeptIds.includes(p.department_id))
    .map(p => ({
      id: p.id,
      label: p.name,
      description: [p.department_name, p.code && `Code: ${p.code}`].filter(Boolean).join(' · ') || p.description,
    }));

  const setDepartments = (ids: string[]) => setForm(f => {
    const departments = ids.map(id => f.departments.find(d => d.id === id) ?? { id, access_scope: 'assigned' as const });
    const allowed = new Set(ids);
    const projectIds = f.projectIds.filter(pid => {
      const dep = projectsList.find(p => p.id === pid)?.department_id;
      return !dep || allowed.has(dep);
    });
    return { ...f, departments, projectIds };
  });
  const setScope = (id: string, all: boolean) => setForm(f => ({
    ...f, departments: f.departments.map(d => d.id === id ? { ...d, access_scope: all ? 'all' : 'assigned' } : d),
  }));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        {(['firstName', 'lastName'] as const).map(f => (
          <div key={f}>
            <label className={LABEL}>{f === 'firstName' ? 'First Name' : 'Last Name'} *</label>
            <input value={form[f]} onChange={e => setForm(p => ({ ...p, [f]: e.target.value }))} className={INPUT} />
          </div>
        ))}
      </div>
      {(['username', 'email'] as const).map(f => (
        <div key={f}>
          <label className={LABEL}>{f} *</label>
          <input value={form[f]} onChange={e => setForm(p => ({ ...p, [f]: e.target.value }))} type={f === 'email' ? 'email' : 'text'} className={INPUT} />
        </div>
      ))}
      <div>
        <label className={LABEL}>Password</label>
        <div className="flex gap-2">
          <input value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))} type="text"
            placeholder="Leave blank to keep current" className={`${INPUT} flex-1`} />
          <button onClick={onGeneratePass} disabled={generatingPass} type="button"
            className="px-3 py-2 bg-lgrayblue/40 dark:bg-slate-700 text-carbon dark:text-white rounded-lg text-xs font-medium hover:opacity-80 flex items-center gap-1">
            {generatingPass ? <Loader2 size={12} className="animate-spin" /> : <Key size={12} />} Generate
          </button>
        </div>
      </div>
      <div>
        <label className={LABEL}>Roles</label>
        <MultiSelect
          options={roleOptions}
          selected={form.roleIds}
          onChange={ids => setForm(p => ({ ...p, roleIds: ids }))}
          placeholder="Select roles…"
          emptyMessage="No roles found"
        />
      </div>
      <EstimationModuleAccessField
        value={form.modules}
        onChange={modules => setForm(p => ({ ...p, modules }))}
        actorModules={moduleCtx.actorModules}
        targetModules={moduleCtx.targetModules}
        targetIsGlobalSuperAdmin={moduleCtx.targetIsGlobalSuperAdmin}
        showErrors={moduleCtx.showErrors}
      />
      {departmentOptions.length > 0 && (
        <div>
          <label className={LABEL}>Departments</label>
          <MultiSelect
            options={departmentOptions}
            selected={selectedDeptIds}
            onChange={setDepartments}
            placeholder="Select departments…"
            emptyMessage="No departments found"
          />
          {form.departments.length > 0 && (
            <ul className="mt-2 space-y-1">
              {form.departments.map(d => (
                <li key={d.id} className="flex items-center justify-between text-xs px-2 py-1.5 rounded-md bg-lgrayblue/15 dark:bg-slate-800/40">
                  <span className="text-carbon dark:text-white">{departmentsList.find(x => x.id === d.id)?.name ?? 'Department'}</span>
                  <label className="flex items-center gap-1.5 text-coolslate cursor-pointer">
                    <input type="checkbox" checked={d.access_scope === 'all'} onChange={e => setScope(d.id, e.target.checked)} />
                    All programs (department-level access)
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {projectsList.length > 0 && (
        <div>
          <label className={LABEL}>Programs</label>
          <MultiSelect
            options={projectOptions}
            selected={form.projectIds}
            onChange={ids => setForm(p => ({ ...p, projectIds: ids }))}
            placeholder={selectedDeptIds.length ? 'Select programs…' : 'Select a department first'}
            emptyMessage={selectedDeptIds.length ? 'No programs in the selected departments' : 'Select a department first'}
          />
        </div>
      )}
    </div>
  );
}

// ─── Create modal ─────────────────────────────────────────────────────────────

function CreateUserModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const { addToast } = useToastStore();
  const { data: roles = [] } = useQuery({ queryKey: ['roles'], queryFn: () => rolesApi.list() });
  const { data: projectsData } = useQuery({ queryKey: ['projects-all'], queryFn: () => projectsApi.list({ limit: 500 }) });
  const { data: departmentsData } = useQuery({ queryKey: ['departments', 'options', 'user-form'], queryFn: () => departmentsApi.list() });
  const [generatingPass, setGeneratingPass] = useState(false);
  const actorModules = useAuthStore(st => st.getModules());
  const [tried, setTried] = useState(false);
  const [form, setForm] = useState<UserForm>({ firstName: '', lastName: '', username: '', email: '', password: '', roleIds: [], projectIds: [], departments: [], modules: [] });
  const moduleError = validateModuleSelection(form.modules, actorModules);

  const mut = useMutation({
    mutationFn: () => usersApi.create(form),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); addToast({ type: 'success', title: 'User created' }); onClose(); },
    onError: (e: Error) => addToast({ type: 'error', title: e.message }),
  });

  const generatePass = async () => {
    setGeneratingPass(true);
    try { const res = await authApi.generatePassword(); setForm(f => ({ ...f, password: res.password })); }
    finally { setGeneratingPass(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-carbon-800 rounded-2xl shadow-modal w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-lgrayblue/30 dark:border-slate-700">
          <h2 className="text-lg font-semibold text-carbon dark:text-white">Create User</h2>
          <button onClick={onClose} className="text-coolslate hover:text-carbon dark:hover:text-white"><XCircle size={18} /></button>
        </div>
        <div className="p-6">
          <UserFormFields form={form} setForm={setForm} roles={roles} projectsList={projectsData?.data ?? []} departmentsList={departmentsData?.data ?? []}
            generatingPass={generatingPass} onGeneratePass={generatePass}
            moduleCtx={{ actorModules, showErrors: tried }} />
        </div>
        <div className="flex justify-end gap-3 px-6 pb-6">
          <button onClick={onClose} className="px-4 py-2 text-sm text-coolslate hover:text-carbon dark:hover:text-white">Cancel</button>
          <button onClick={() => { setTried(true); if (!moduleError) mut.mutate(); }} disabled={mut.isPending || !form.firstName || !form.email || !form.password}
            className="px-4 py-2 bg-carbon dark:bg-white text-white dark:text-carbon rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50 flex items-center gap-1.5">
            {mut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Create User
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Edit modal ───────────────────────────────────────────────────────────────

function EditUserModal({ user, onClose }: { user: UserRecord; onClose: () => void }) {
  const qc = useQueryClient();
  const { addToast } = useToastStore();
  const { data: roles = [] } = useQuery({ queryKey: ['roles'], queryFn: () => rolesApi.list() });
  const { data: projectsData } = useQuery({ queryKey: ['projects-all'], queryFn: () => projectsApi.list({ limit: 500 }) });
  const { data: departmentsData } = useQuery({ queryKey: ['departments', 'options', 'user-form'], queryFn: () => departmentsApi.list() });
  const { data: fullUser } = useQuery({ queryKey: ['user', user.id], queryFn: () => usersApi.get(user.id) });
  const [generatingPass, setGeneratingPass] = useState(false);

  const resolvedRoleIds = roles.filter(r => user.roles.includes(r.name)).map(r => r.id);
  const actorModules = useAuthStore(st => st.getModules());
  const currentUserId = useAuthStore(st => st.user?.id);
  const [tried, setTried] = useState(false);
  const targetModules = normalizeModules(fullUser?.estimation_modules ?? user.estimation_modules);
  const targetIsGlobalSuperAdmin = (fullUser?.roles ?? user.roles ?? [])
    .some(r => (typeof r === 'string' ? r : (r as { name: string }).name) === 'Global Super Admin');

  const [form, setForm] = useState<UserForm>({
    firstName: user.first_name,
    lastName: user.last_name,
    username: user.username,
    email: user.email,
    password: '',
    roleIds: resolvedRoleIds,
    projectIds: [],
    departments: [],
    // previously assigned modules the actor can manage; the rest stay locked (kept server-side)
    modules: normalizeModules(user.estimation_modules).filter(m => actorModules.includes(m)),
  });
  const moduleError = targetIsGlobalSuperAdmin ? null : validateModuleSelection(form.modules, actorModules, targetModules);

  // Sync project IDs once both full user AND accessible projects are loaded.
  // Filter to only projects visible to the requester — prevents submitting
  // projects outside the admin's scope that would be rejected by the backend.
  const [projectsInitialized, setProjectsInitialized] = useState(false);
  if (fullUser && projectsData && departmentsData && !projectsInitialized) {
    const accessible = new Set(projectsData.data.map(p => p.id));
    const accessibleDepts = new Set(departmentsData.data.map(d => d.id));
    const filtered = (fullUser.projects?.map(p => p.id) ?? []).filter(id => accessible.has(id));
    const departments = (fullUser.departments ?? [])
      .filter(d => accessibleDepts.has(d.id))
      .map(d => ({ id: d.id, access_scope: d.access_scope }));
    const modules = normalizeModules(fullUser.estimation_modules).filter(m => actorModules.includes(m));
    setForm(f => ({ ...f, projectIds: filtered, departments, modules }));
    setProjectsInitialized(true);
  }

  // Roles load asynchronously: resolve the user's role ids once they arrive, otherwise the form would start
  // with no roles and saving would remove all of the user's roles.
  const [rolesInitialized, setRolesInitialized] = useState(resolvedRoleIds.length > 0 || user.roles.length === 0);
  if (!rolesInitialized && roles.length > 0) {
    setForm(f => ({ ...f, roleIds: resolvedRoleIds }));
    setRolesInitialized(true);
  }

  const mut = useMutation({
    mutationFn: () => usersApi.update(user.id, {
      firstName: form.firstName,
      lastName: form.lastName,
      username: form.username,
      email: form.email,
      roleIds: form.roleIds,
      projectIds: form.projectIds,
      departments: form.departments,
      ...(targetIsGlobalSuperAdmin ? {} : { modules: form.modules }),
      ...(form.password ? { password: form.password } : {}),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      qc.invalidateQueries({ queryKey: ['user', user.id] });
      addToast({ type: 'success', title: 'User updated' });
      if (user.id === currentUserId) void syncAccessFromServer();   // own access changed → refresh nav now
      onClose();
    },
    onError: (e: Error) => addToast({ type: 'error', title: e.message }),
  });

  const generatePass = async () => {
    setGeneratingPass(true);
    try { const res = await authApi.generatePassword(); setForm(f => ({ ...f, password: res.password })); }
    finally { setGeneratingPass(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-carbon-800 rounded-2xl shadow-modal w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-lgrayblue/30 dark:border-slate-700">
          <div>
            <h2 className="text-lg font-semibold text-carbon dark:text-white">Edit User</h2>
            <p className="text-xs text-coolslate">{user.email}</p>
          </div>
          <button onClick={onClose} className="text-coolslate hover:text-carbon dark:hover:text-white"><XCircle size={18} /></button>
        </div>
        <div className="p-6">
          <UserFormFields form={form} setForm={setForm} roles={roles} projectsList={projectsData?.data ?? []} departmentsList={departmentsData?.data ?? []}
            generatingPass={generatingPass} onGeneratePass={generatePass}
            moduleCtx={{ actorModules, targetModules, targetIsGlobalSuperAdmin, showErrors: tried }} />
        </div>
        <div className="flex justify-end gap-3 px-6 pb-6">
          <button onClick={onClose} className="px-4 py-2 text-sm text-coolslate hover:text-carbon dark:hover:text-white">Cancel</button>
          <button onClick={() => { setTried(true); if (!moduleError) mut.mutate(); }} disabled={mut.isPending || !form.firstName || !form.email || !fullUser || !rolesInitialized}
            className="px-4 py-2 bg-carbon dark:bg-white text-white dark:text-carbon rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50 flex items-center gap-1.5">
            {mut.isPending ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function UsersPage() {
  const { hasPermission, user: currentUser } = useAuthStore();
  const { addToast } = useToastStore();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [editUser, setEditUser] = useState<UserRecord | null>(null);
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['users', page, search],
    queryFn: () => usersApi.list({ page, limit: 20, search: search || undefined }),
  });

  const toggleActive = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => usersApi.setActive(id, active),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
    onError: (e: Error) => addToast({ type: 'error', title: e.message }),
  });

  const deleteUser = useMutation({
    mutationFn: (id: string) => usersApi.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); addToast({ type: 'success', title: 'User removed' }); },
    onError: (e: Error) => addToast({ type: 'error', title: e.message }),
  });

  const getRoleBadgeColor = (role: string) => {
    if (role.includes('Super Admin')) return 'bg-vibrant/10 text-vibrant';
    if (role === 'Admin') return 'bg-gold/10 text-gold';
    return 'bg-lgrayblue/30 text-carbon dark:text-lgrayblue';
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-primary flex items-center justify-center">
            <Users size={18} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-carbon dark:text-white">User Management</h1>
            <p className="text-coolslate text-xs">{data?.total ?? 0} users</p>
          </div>
        </div>
        {hasPermission('user.create') && (
          <button onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2 bg-carbon dark:bg-white text-white dark:text-carbon rounded-lg text-sm font-medium hover:opacity-90 transition-all">
            <Plus size={16} /> Add User
          </button>
        )}
      </div>

      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-coolslate" />
        <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
          placeholder="Search users by name, email, username..."
          className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-lgrayblue/40 dark:border-slate-700 bg-white dark:bg-carbon-800 text-carbon dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-carbon/20" />
      </div>

      <div className="bg-white dark:bg-carbon-800 rounded-2xl border border-lgrayblue/30 dark:border-slate-700 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-40"><Loader2 size={24} className="animate-spin text-coolslate" /></div>
        ) : !data?.data?.length ? (
          <div className="text-center py-12 text-coolslate text-sm">No users found</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-lgrayblue/30 dark:border-slate-700">
                <tr className="text-left">
                  {['User', 'Roles', 'Modules', 'Programs', 'Status', 'Last Login', 'Actions'].map(h => (
                    <th key={h} className="px-5 py-3.5 text-xs font-semibold text-coolslate uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-lgrayblue/20 dark:divide-slate-700/50">
                {data.data.map((u: UserRecord) => (
                  <tr key={u.id} className="hover:bg-offwhite/50 dark:hover:bg-slate-700/20 transition-colors">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-gradient-primary flex items-center justify-center flex-shrink-0">
                          <span className="text-white text-xs font-semibold">{u.first_name[0]}{u.last_name[0]}</span>
                        </div>
                        <div>
                          <p className="font-medium text-carbon dark:text-white">{u.first_name} {u.last_name}</p>
                          <p className="text-coolslate text-xs">{u.email}</p>
                          <p className="text-coolslate/60 text-[10px]">@{u.username}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex flex-wrap gap-1">
                        {(u.roles ?? []).map(r => (
                          <span key={r} className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${getRoleBadgeColor(r)}`}>{r}</span>
                        ))}
                      </div>
                    </td>
                    <td className="px-5 py-3.5" data-testid="user-modules">
                      <div className="flex flex-wrap gap-1">
                        {normalizeModules(u.estimation_modules).length > 0
                          ? normalizeModules(u.estimation_modules).map(m => (
                            <span key={m} title={m === 'SP' ? 'Story Point Estimation' : 'Parametric Estimation'}
                              className="text-[10px] px-2 py-0.5 rounded-full font-semibold border border-carbon/20 dark:border-lgrayblue/30 text-carbon dark:text-lgrayblue">{m}</span>
                          ))
                          : <span className="text-[10px] text-vibrant">None</span>}
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex flex-wrap gap-1">
                        {(u.projects ?? []).length > 0
                          ? (u.projects ?? []).slice(0, 2).map(p => (
                            <span key={p.id} className="text-[10px] px-2 py-0.5 rounded-full bg-lgrayblue/30 dark:bg-slate-700 text-coolslate font-mono">{p.code || p.name}</span>
                          ))
                          : <span className="text-[10px] text-coolslate/50">—</span>
                        }
                        {(u.projects ?? []).length > 2 && (
                          <span className="text-[10px] text-coolslate">+{(u.projects ?? []).length - 2}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${u.is_active ? 'bg-greenline/10 text-greenline' : 'bg-lgrayblue/30 text-coolslate'}`}>
                        {u.is_active ? <CheckCircle size={10} /> : <XCircle size={10} />}
                        {u.status}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-coolslate text-xs">
                      {u.last_login_at ? fmt.datetime(u.last_login_at) : 'Never'}
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-1.5">
                        {hasPermission('user.update') && (
                          <button onClick={() => setEditUser(u)}
                            className="p-1.5 rounded-lg text-coolslate hover:text-carbon dark:hover:text-white hover:bg-lgrayblue/30 dark:hover:bg-slate-700 transition-colors"
                            title="Edit user">
                            <Edit2 size={13} />
                          </button>
                        )}
                        {hasPermission('user.activate') && (
                          <button
                            onClick={() => toggleActive.mutate({ id: u.id, active: !u.is_active })}
                            className={`text-xs px-2.5 py-1 rounded-lg font-medium transition-colors ${u.is_active ? 'bg-vibrant/10 text-vibrant hover:bg-vibrant/20' : 'bg-greenline/10 text-greenline hover:bg-greenline/20'}`}
                          >
                            {u.is_active ? 'Disable' : 'Enable'}
                          </button>
                        )}
                        {hasPermission('user.delete') && u.id !== currentUser?.id && (
                          <button
                            onClick={() => { if (confirm(`Remove user "${u.first_name} ${u.last_name}"? This cannot be undone.`)) deleteUser.mutate(u.id); }}
                            className="p-1.5 rounded-lg text-coolslate hover:text-vibrant hover:bg-vibrant/10 transition-colors"
                            title="Delete user">
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {data && data.total > 20 && (
        <div className="flex items-center justify-between text-sm text-coolslate">
          <span>Page {page} of {Math.ceil(data.total / 20)}</span>
          <div className="flex gap-2">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
              className="px-3 py-1.5 rounded-lg border border-lgrayblue/40 dark:border-slate-700 hover:bg-lgrayblue/20 disabled:opacity-40">Prev</button>
            <button onClick={() => setPage(p => p + 1)} disabled={page >= Math.ceil(data.total / 20)}
              className="px-3 py-1.5 rounded-lg border border-lgrayblue/40 dark:border-slate-700 hover:bg-lgrayblue/20 disabled:opacity-40">Next</button>
          </div>
        </div>
      )}

      {showCreate && <CreateUserModal onClose={() => setShowCreate(false)} />}
      {editUser && <EditUserModal user={editUser} onClose={() => setEditUser(null)} />}
    </div>
  );
}
