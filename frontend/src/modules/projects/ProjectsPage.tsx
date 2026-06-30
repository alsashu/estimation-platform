import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { FolderOpen, Plus, Search, Users, BarChart3, Loader2, XCircle, Edit2, Trash2, ToggleLeft, ToggleRight } from 'lucide-react';
import { projectsApi } from '../../services/api';
import type { ProjectRecord } from '../../services/api';
import { useAuthStore } from '../../store/authStore';
import { useToastStore } from '../../store';
import { fmt } from '../../utils/formatters';

// ─── Shared field components ──────────────────────────────────────────────────

const INPUT = 'w-full px-3 py-2 rounded-lg border border-lgrayblue/40 dark:border-slate-600 bg-white dark:bg-carbon-700 text-carbon dark:text-white text-sm focus:outline-none focus:ring-1 focus:ring-carbon/30';
const LABEL = 'text-xs font-medium text-coolslate uppercase tracking-wide block mb-1';

const FIELDS = [
  { field: 'name',        label: 'Project Name *', placeholder: 'Alpha Platform' },
  { field: 'code',        label: 'Code',           placeholder: 'AP' },
  { field: 'description', label: 'Description',    placeholder: 'Brief description...' },
] as const;

function ProjectFormBody({
  form, setForm,
}: {
  form: { name: string; code: string; description: string; status: string };
  setForm: React.Dispatch<React.SetStateAction<typeof form>>;
}) {
  return (
    <div className="space-y-4">
      {FIELDS.map(({ field, label, placeholder }) => (
        <div key={field}>
          <label className={LABEL}>{label}</label>
          {field === 'description' ? (
            <textarea value={form[field]} onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
              placeholder={placeholder} rows={2} className={`${INPUT} resize-none`} />
          ) : (
            <input value={form[field]} onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
              placeholder={placeholder} className={INPUT} />
          )}
        </div>
      ))}
      <div>
        <label className={LABEL}>Status</label>
        <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
          className={INPUT}>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="archived">Archived</option>
        </select>
      </div>
    </div>
  );
}

// ─── Create modal ─────────────────────────────────────────────────────────────

function CreateProjectModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const { addToast } = useToastStore();
  const [form, setForm] = useState({ name: '', code: '', description: '', status: 'active' });

  const mut = useMutation({
    mutationFn: () => projectsApi.create(form),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['projects'] }); addToast({ type: 'success', title: 'Project created' }); onClose(); },
    onError: (e: Error) => addToast({ type: 'error', title: e.message }),
  });

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-carbon-800 rounded-2xl shadow-modal w-full max-w-md">
        <div className="flex items-center justify-between p-6 border-b border-lgrayblue/30 dark:border-slate-700">
          <h2 className="text-lg font-semibold text-carbon dark:text-white">Create Project</h2>
          <button onClick={onClose} className="text-coolslate hover:text-carbon dark:hover:text-white"><XCircle size={18} /></button>
        </div>
        <div className="p-6"><ProjectFormBody form={form} setForm={setForm} /></div>
        <div className="flex justify-end gap-3 px-6 pb-6">
          <button onClick={onClose} className="px-4 py-2 text-sm text-coolslate hover:text-carbon dark:hover:text-white">Cancel</button>
          <button onClick={() => mut.mutate()} disabled={mut.isPending || !form.name}
            className="px-4 py-2 bg-carbon dark:bg-white text-white dark:text-carbon rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50 flex items-center gap-1.5">
            {mut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Create
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Edit modal ───────────────────────────────────────────────────────────────

function EditProjectModal({ project, onClose }: { project: ProjectRecord; onClose: () => void }) {
  const qc = useQueryClient();
  const { addToast } = useToastStore();
  const [form, setForm] = useState({
    name: project.name,
    code: project.code ?? '',
    description: project.description ?? '',
    status: project.status,
  });

  const mut = useMutation({
    mutationFn: () => projectsApi.update(project.id, form),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['projects'] }); addToast({ type: 'success', title: 'Project updated' }); onClose(); },
    onError: (e: Error) => addToast({ type: 'error', title: e.message }),
  });

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-carbon-800 rounded-2xl shadow-modal w-full max-w-md">
        <div className="flex items-center justify-between p-6 border-b border-lgrayblue/30 dark:border-slate-700">
          <div>
            <h2 className="text-lg font-semibold text-carbon dark:text-white">Edit Project</h2>
            {project.code && <p className="text-xs text-coolslate font-mono">{project.code}</p>}
          </div>
          <button onClick={onClose} className="text-coolslate hover:text-carbon dark:hover:text-white"><XCircle size={18} /></button>
        </div>
        <div className="p-6"><ProjectFormBody form={form} setForm={setForm} /></div>
        <div className="flex justify-end gap-3 px-6 pb-6">
          <button onClick={onClose} className="px-4 py-2 text-sm text-coolslate hover:text-carbon dark:hover:text-white">Cancel</button>
          <button onClick={() => mut.mutate()} disabled={mut.isPending || !form.name}
            className="px-4 py-2 bg-carbon dark:bg-white text-white dark:text-carbon rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50 flex items-center gap-1.5">
            {mut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Edit2 size={14} />} Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ProjectsPage() {
  const { hasPermission } = useAuthStore();
  const { addToast } = useToastStore();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [editProject, setEditProject] = useState<ProjectRecord | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['projects', search],
    queryFn: () => projectsApi.list({ limit: 50, search: search || undefined }),
  });

  const toggleStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => projectsApi.update(id, { status }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['projects'] }); addToast({ type: 'success', title: 'Project updated' }); },
    onError: (e: Error) => addToast({ type: 'error', title: e.message }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => projectsApi.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['projects'] }); addToast({ type: 'success', title: 'Project deleted' }); },
    onError: (e: Error) => addToast({ type: 'error', title: e.message }),
  });

  const statusColor = (s: string) => {
    if (s === 'active') return 'bg-greenline/10 text-greenline';
    if (s === 'inactive') return 'bg-lgrayblue/30 text-coolslate';
    return 'bg-gold/10 text-gold';
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-primary flex items-center justify-center">
            <FolderOpen size={18} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-carbon dark:text-white">Projects</h1>
            <p className="text-coolslate text-xs">{data?.total ?? 0} projects</p>
          </div>
        </div>
        {hasPermission('project.create') && (
          <button onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2 bg-carbon dark:bg-white text-white dark:text-carbon rounded-lg text-sm font-medium hover:opacity-90 transition-all">
            <Plus size={16} /> New Project
          </button>
        )}
      </div>

      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-coolslate" />
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search projects..."
          className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-lgrayblue/40 dark:border-slate-700 bg-white dark:bg-carbon-800 text-carbon dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-carbon/20" />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-40"><Loader2 size={24} className="animate-spin text-coolslate" /></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {data?.data?.map((p: ProjectRecord) => (
            <div key={p.id} className="bg-white dark:bg-carbon-800 rounded-2xl border border-lgrayblue/30 dark:border-slate-700 p-5 hover:shadow-card transition-shadow flex flex-col">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-gradient-primary flex items-center justify-center flex-shrink-0">
                    <FolderOpen size={16} className="text-white" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-carbon dark:text-white text-sm truncate">{p.name}</p>
                    {p.code && <p className="text-coolslate text-[11px] font-mono">{p.code}</p>}
                  </div>
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium flex-shrink-0 ml-2 ${statusColor(p.status)}`}>{p.status}</span>
              </div>

              {p.description && <p className="text-coolslate text-xs mb-3 line-clamp-2 flex-1">{p.description}</p>}

              <div className="flex items-center gap-4 py-3 border-t border-lgrayblue/20 dark:border-slate-700/50">
                <div className="flex items-center gap-1.5 text-xs text-coolslate">
                  <Users size={12} /> {p.user_count ?? 0} users
                </div>
                <div className="flex items-center gap-1.5 text-xs text-coolslate">
                  <BarChart3 size={12} /> {p.estimation_count ?? 0} estimations
                </div>
                <span className="ml-auto text-[10px] text-coolslate/60">{fmt.date(p.created_at)}</span>
              </div>

              {(hasPermission('project.update') || hasPermission('project.delete')) && (
                <div className="flex items-center gap-1.5 pt-3 border-t border-lgrayblue/10 dark:border-slate-700/30">
                  {hasPermission('project.update') && (
                    <>
                      <button onClick={() => setEditProject(p)}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-coolslate hover:text-carbon dark:hover:text-white hover:bg-lgrayblue/30 dark:hover:bg-slate-700 transition-colors">
                        <Edit2 size={12} /> Edit
                      </button>
                      <button
                        onClick={() => toggleStatus.mutate({ id: p.id, status: p.status === 'active' ? 'inactive' : 'active' })}
                        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${p.status === 'active' ? 'text-gold hover:bg-gold/10' : 'text-greenline hover:bg-greenline/10'}`}>
                        {p.status === 'active'
                          ? <><ToggleRight size={13} /> Disable</>
                          : <><ToggleLeft size={13} /> Enable</>}
                      </button>
                    </>
                  )}
                  {hasPermission('project.delete') && (
                    <button
                      onClick={() => { if (confirm(`Delete project "${p.name}"? This cannot be undone.`)) deleteMut.mutate(p.id); }}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-coolslate hover:text-vibrant hover:bg-vibrant/10 transition-colors ml-auto">
                      <Trash2 size={12} /> Delete
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
          {!data?.data?.length && (
            <div className="col-span-3 text-center py-12 text-coolslate text-sm">No projects found</div>
          )}
        </div>
      )}

      {showCreate && <CreateProjectModal onClose={() => setShowCreate(false)} />}
      {editProject && <EditProjectModal project={editProject} onClose={() => setEditProject(null)} />}
    </div>
  );
}
