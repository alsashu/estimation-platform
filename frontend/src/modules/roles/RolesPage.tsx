import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Shield, Plus, Users, Lock, Trash2, Loader2, XCircle, Edit2 } from 'lucide-react';
import { rolesApi } from '../../services/api';
import type { RoleRecord, PermissionRecord } from '../../services/api';
import { useAuthStore } from '../../store/authStore';
import { useToastStore } from '../../store';

// ─── Shared permission picker ─────────────────────────────────────────────────

function PermissionPicker({
  permissions, selected, onChange,
}: {
  permissions: PermissionRecord[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const modules = [...new Set(permissions.map(p => p.module))];
  const toggle = (id: string) =>
    onChange(selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id]);
  const toggleModule = (mod: string) => {
    const modIds = permissions.filter(p => p.module === mod).map(p => p.id);
    const allChecked = modIds.every(id => selected.includes(id));
    if (allChecked) onChange(selected.filter(id => !modIds.includes(id)));
    else onChange([...selected, ...modIds.filter(id => !selected.includes(id))]);
  };

  return (
    <div className="space-y-3">
      {modules.map(mod => {
        const modPerms = permissions.filter(p => p.module === mod);
        const allChecked = modPerms.every(p => selected.includes(p.id));
        const someChecked = modPerms.some(p => selected.includes(p.id));
        return (
          <div key={mod}>
            <div className="flex items-center gap-2 mb-1.5">
              <input type="checkbox" checked={allChecked} ref={el => { if (el) el.indeterminate = someChecked && !allChecked; }}
                onChange={() => toggleModule(mod)} className="cursor-pointer" />
              <p className="text-[10px] font-semibold text-coolslate uppercase tracking-widest">{mod}</p>
            </div>
            <div className="flex flex-wrap gap-2 pl-5">
              {modPerms.map(p => (
                <label key={p.id} className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg cursor-pointer border transition-colors ${selected.includes(p.id) ? 'border-carbon bg-carbon/5 dark:border-white dark:bg-white/5 text-carbon dark:text-white' : 'border-lgrayblue/40 dark:border-slate-600 text-coolslate hover:border-carbon/40'}`}>
                  <input type="checkbox" className="hidden" checked={selected.includes(p.id)} onChange={() => toggle(p.id)} />
                  {p.name.split('.')[1]}
                </label>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Create modal ─────────────────────────────────────────────────────────────

function CreateRoleModal({ permissions, onClose }: { permissions: PermissionRecord[]; onClose: () => void }) {
  const qc = useQueryClient();
  const { addToast } = useToastStore();
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [selectedPerms, setSelectedPerms] = useState<string[]>([]);

  const mut = useMutation({
    mutationFn: () => rolesApi.create({ name, description: desc, permissionIds: selectedPerms }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['roles'] }); addToast({ type: 'success', title: 'Role created' }); onClose(); },
    onError: (e: Error) => addToast({ type: 'error', title: e.message }),
  });

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-carbon-800 rounded-2xl shadow-modal w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-lgrayblue/30 dark:border-slate-700">
          <h2 className="text-lg font-semibold text-carbon dark:text-white">Create Role</h2>
          <button onClick={onClose} className="text-coolslate hover:text-carbon dark:hover:text-white"><XCircle size={18} /></button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="text-xs font-medium text-coolslate uppercase tracking-wide block mb-1">Role Name *</label>
            <input value={name} onChange={e => setName(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-lgrayblue/40 dark:border-slate-600 bg-white dark:bg-carbon-700 text-carbon dark:text-white text-sm focus:outline-none focus:ring-1 focus:ring-carbon/30" />
          </div>
          <div>
            <label className="text-xs font-medium text-coolslate uppercase tracking-wide block mb-1">Description</label>
            <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={2}
              className="w-full px-3 py-2 rounded-lg border border-lgrayblue/40 dark:border-slate-600 bg-white dark:bg-carbon-700 text-carbon dark:text-white text-sm focus:outline-none focus:ring-1 focus:ring-carbon/30 resize-none" />
          </div>
          <div>
            <label className="text-xs font-medium text-coolslate uppercase tracking-wide block mb-3">Permissions</label>
            <PermissionPicker permissions={permissions} selected={selectedPerms} onChange={setSelectedPerms} />
          </div>
        </div>
        <div className="flex justify-end gap-3 px-6 pb-6">
          <button onClick={onClose} className="px-4 py-2 text-sm text-coolslate hover:text-carbon dark:hover:text-white">Cancel</button>
          <button onClick={() => mut.mutate()} disabled={mut.isPending || !name}
            className="px-4 py-2 bg-carbon dark:bg-white text-white dark:text-carbon rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50 flex items-center gap-1.5">
            {mut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Create Role
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Edit modal ───────────────────────────────────────────────────────────────

function EditRoleModal({ role, permissions, onClose }: { role: RoleRecord; permissions: PermissionRecord[]; onClose: () => void }) {
  const qc = useQueryClient();
  const { addToast } = useToastStore();
  const [name, setName] = useState(role.name);
  const [desc, setDesc] = useState(role.description ?? '');

  // Resolve permission IDs from whatever format is stored
  const resolveIds = (): string[] => {
    if (!role.permissions?.length) return [];
    if (typeof role.permissions[0] === 'string') {
      // stored as names — match to permission objects
      return permissions.filter(p => (role.permissions as string[]).includes(p.name)).map(p => p.id);
    }
    return (role.permissions as { id: string }[]).map(p => p.id);
  };
  const [selectedPerms, setSelectedPerms] = useState<string[]>(resolveIds);

  const mut = useMutation({
    mutationFn: () => rolesApi.update(role.id, { name, description: desc, permissionIds: selectedPerms }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['roles'] }); addToast({ type: 'success', title: 'Role updated' }); onClose(); },
    onError: (e: Error) => addToast({ type: 'error', title: e.message }),
  });

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-carbon-800 rounded-2xl shadow-modal w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-lgrayblue/30 dark:border-slate-700">
          <div>
            <h2 className="text-lg font-semibold text-carbon dark:text-white">Edit Role</h2>
            {role.is_system && <p className="text-xs text-gold">System role — name and core permissions are protected</p>}
          </div>
          <button onClick={onClose} className="text-coolslate hover:text-carbon dark:hover:text-white"><XCircle size={18} /></button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="text-xs font-medium text-coolslate uppercase tracking-wide block mb-1">Role Name *</label>
            <input value={name} onChange={e => setName(e.target.value)} disabled={role.is_system}
              className="w-full px-3 py-2 rounded-lg border border-lgrayblue/40 dark:border-slate-600 bg-white dark:bg-carbon-700 text-carbon dark:text-white text-sm focus:outline-none focus:ring-1 focus:ring-carbon/30 disabled:opacity-50 disabled:cursor-not-allowed" />
          </div>
          <div>
            <label className="text-xs font-medium text-coolslate uppercase tracking-wide block mb-1">Description</label>
            <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={2}
              className="w-full px-3 py-2 rounded-lg border border-lgrayblue/40 dark:border-slate-600 bg-white dark:bg-carbon-700 text-carbon dark:text-white text-sm focus:outline-none focus:ring-1 focus:ring-carbon/30 resize-none" />
          </div>
          <div>
            <label className="text-xs font-medium text-coolslate uppercase tracking-wide block mb-3">Permissions</label>
            <PermissionPicker permissions={permissions} selected={selectedPerms} onChange={setSelectedPerms} />
          </div>
        </div>
        <div className="flex justify-end gap-3 px-6 pb-6">
          <button onClick={onClose} className="px-4 py-2 text-sm text-coolslate hover:text-carbon dark:hover:text-white">Cancel</button>
          <button onClick={() => mut.mutate()} disabled={mut.isPending || !name}
            className="px-4 py-2 bg-carbon dark:bg-white text-white dark:text-carbon rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50 flex items-center gap-1.5">
            {mut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Edit2 size={14} />} Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function RolesPage() {
  const { hasPermission } = useAuthStore();
  const { addToast } = useToastStore();
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [editRole, setEditRole] = useState<RoleRecord | null>(null);

  const { data: roles = [], isLoading } = useQuery({ queryKey: ['roles'], queryFn: () => rolesApi.list() });
  const { data: permissions = [] } = useQuery({ queryKey: ['permissions'], queryFn: () => rolesApi.listPermissions() });

  const deleteMut = useMutation({
    mutationFn: (id: string) => rolesApi.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['roles'] }); addToast({ type: 'success', title: 'Role deleted' }); },
    onError: (e: Error) => addToast({ type: 'error', title: e.message }),
  });

  const modules = [...new Set(permissions.map((p: PermissionRecord) => p.module))];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-primary flex items-center justify-center">
            <Shield size={18} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-carbon dark:text-white">Roles & Permissions</h1>
            <p className="text-coolslate text-xs">{roles.length} roles · {permissions.length} permissions</p>
          </div>
        </div>
        {hasPermission('role.manage') && (
          <button onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2 bg-carbon dark:bg-white text-white dark:text-carbon rounded-lg text-sm font-medium hover:opacity-90 transition-all">
            <Plus size={16} /> New Role
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-40"><Loader2 size={24} className="animate-spin text-coolslate" /></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {roles.map((role: RoleRecord) => (
            <div key={role.id} className="bg-white dark:bg-carbon-800 rounded-2xl border border-lgrayblue/30 dark:border-slate-700 p-5">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-gradient-primary flex items-center justify-center">
                    <Shield size={15} className="text-white" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-carbon dark:text-white text-sm">{role.name}</p>
                      {role.is_system && (
                        <span className="flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded-full bg-lgrayblue/30 text-coolslate font-medium uppercase tracking-wide">
                          <Lock size={8} /> System
                        </span>
                      )}
                    </div>
                    {role.description && <p className="text-coolslate text-xs mt-0.5">{role.description}</p>}
                  </div>
                </div>
                {hasPermission('role.manage') && (
                  <div className="flex items-center gap-1">
                    <button onClick={() => setEditRole(role)}
                      className="p-1.5 text-coolslate hover:text-carbon dark:hover:text-white hover:bg-lgrayblue/30 dark:hover:bg-slate-700 rounded-lg transition-colors"
                      title="Edit role">
                      <Edit2 size={13} />
                    </button>
                    {!role.is_system && (
                      <button onClick={() => { if (confirm(`Delete role "${role.name}"?`)) deleteMut.mutate(role.id); }}
                        className="p-1.5 text-coolslate hover:text-vibrant hover:bg-vibrant/10 rounded-lg transition-colors"
                        title="Delete role">
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-4 py-3 border-t border-lgrayblue/20 dark:border-slate-700/50 mb-3">
                <div className="flex items-center gap-1.5 text-xs text-coolslate">
                  <Users size={11} /> {role.user_count} users
                </div>
                <div className="flex items-center gap-1.5 text-xs text-coolslate">
                  <Lock size={11} /> {(role.permissions as string[]).length} permissions
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {(role.permissions as string[]).slice(0, 8).map(p => (
                  <span key={p} className="text-[10px] px-2 py-0.5 rounded-full bg-lgrayblue/20 dark:bg-slate-700 text-coolslate font-mono">{p}</span>
                ))}
                {(role.permissions as string[]).length > 8 && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-lgrayblue/20 dark:bg-slate-700 text-coolslate">
                    +{(role.permissions as string[]).length - 8} more
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Permission matrix */}
      <div className="bg-white dark:bg-carbon-800 rounded-2xl border border-lgrayblue/30 dark:border-slate-700 p-6">
        <h2 className="text-base font-semibold text-carbon dark:text-white mb-4">Permission Matrix</h2>
        <div className="space-y-4">
          {modules.map(mod => (
            <div key={mod}>
              <p className="text-[11px] font-semibold text-coolslate uppercase tracking-widest mb-2">{mod}</p>
              <div className="flex flex-wrap gap-2">
                {permissions.filter((p: PermissionRecord) => p.module === mod).map((p: PermissionRecord) => (
                  <div key={p.id} className="px-3 py-1.5 bg-lgrayblue/10 dark:bg-slate-700/50 rounded-lg">
                    <p className="text-xs font-mono text-carbon dark:text-lgrayblue">{p.name}</p>
                    {p.description && <p className="text-[10px] text-coolslate mt-0.5">{p.description}</p>}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {showCreate && <CreateRoleModal permissions={permissions} onClose={() => setShowCreate(false)} />}
      {editRole && <EditRoleModal role={editRole} permissions={permissions} onClose={() => setEditRole(null)} />}
    </div>
  );
}
