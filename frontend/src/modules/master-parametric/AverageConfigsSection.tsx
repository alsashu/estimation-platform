import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Edit2, Trash2, Star, Ban } from 'lucide-react';
import { parametricMasterApi } from '../../services/api';
import { Button, Card, Modal, ConfirmDialog, Badge, EmptyState, Skeleton, Input, Textarea } from '../../components/ui';
import { useToastStore } from '../../store';
import type { ParametricAverageConfig } from '../../types';

function AverageConfigModal({ cfg, isOpen, onClose, onSave, loading }: {
  cfg?: ParametricAverageConfig; isOpen: boolean; onClose: () => void;
  onSave: (data: { name: string; description?: string; small: number; medium: number; large: number }) => void;
  loading: boolean;
}) {
  const [name, setName] = useState(cfg?.name || '');
  const [description, setDescription] = useState(cfg?.description || '');
  const [small, setSmall] = useState(String(cfg?.small ?? '12'));
  const [medium, setMedium] = useState(String(cfg?.medium ?? '22'));
  const [large, setLarge] = useState(String(cfg?.large ?? '32.5'));

  const valid = name.trim() && small !== '' && medium !== '' && large !== '';

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={cfg ? 'Edit Average Estimation Config' : 'Add Average Estimation Config'}
      footer={<>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button
          onClick={() => valid && onSave({ name: name.trim(), description: description.trim() || undefined, small: Number(small), medium: Number(medium), large: Number(large) })}
          loading={loading} disabled={!valid}
        >
          {cfg ? 'Save Changes' : 'Add Configuration'}
        </Button>
      </>}
    >
      <div className="space-y-4">
        <Input label="Configuration Name *" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Standard" />
        <Textarea label="Description" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="Optional notes about when to use this configuration" />
        <div className="grid grid-cols-3 gap-3">
          <Input label="Small *" type="number" step="0.01" value={small} onChange={(e) => setSmall(e.target.value)} />
          <Input label="Medium *" type="number" step="0.01" value={medium} onChange={(e) => setMedium(e.target.value)} />
          <Input label="Large *" type="number" step="0.01" value={large} onChange={(e) => setLarge(e.target.value)} />
        </div>
      </div>
    </Modal>
  );
}

export function AverageConfigsSection() {
  const qc = useQueryClient();
  const { addToast } = useToastStore();
  const [editCfg, setEditCfg] = useState<ParametricAverageConfig | undefined>();
  const [showAdd, setShowAdd] = useState(false);
  const [deleteCfg, setDeleteCfg] = useState<ParametricAverageConfig | undefined>();

  const { data: configs, isLoading } = useQuery({ queryKey: ['parametric-average-configs'], queryFn: parametricMasterApi.getAverageConfigs, retry: false });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['parametric-average-configs'] });

  const createMutation = useMutation({
    mutationFn: parametricMasterApi.createAverageConfig,
    onSuccess: () => { invalidate(); setShowAdd(false); addToast({ type: 'success', title: 'Configuration added' }); },
    onError: (e: Error) => addToast({ type: 'error', title: 'Error', message: e.message }),
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<ParametricAverageConfig> }) => parametricMasterApi.updateAverageConfig(id, data),
    onSuccess: () => { invalidate(); setEditCfg(undefined); addToast({ type: 'success', title: 'Configuration updated' }); },
    onError: (e: Error) => addToast({ type: 'error', title: 'Error', message: e.message }),
  });
  const defaultMutation = useMutation({
    mutationFn: (id: string) => parametricMasterApi.setDefaultAverageConfig(id),
    onSuccess: () => { invalidate(); addToast({ type: 'success', title: 'Default configuration updated' }); },
    onError: (e: Error) => addToast({ type: 'error', title: 'Error', message: e.message }),
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => parametricMasterApi.deleteAverageConfig(id),
    onSuccess: () => { invalidate(); setDeleteCfg(undefined); addToast({ type: 'success', title: 'Configuration deleted' }); },
    onError: (e: Error) => { addToast({ type: 'error', title: 'Error', message: e.message }); setDeleteCfg(undefined); },
  });

  return (
    <Card padding="p-0">
      <div className="flex items-center justify-between px-5 py-4 border-b border-lgrayblue/30 dark:border-slate-700">
        <div>
          <h2 className="font-semibold text-carbon dark:text-white text-sm">{configs?.length || 0} Configurations</h2>
          <p className="text-xs text-coolslate mt-0.5">Used to calculate Average Estimation (PersonDays) per field size.</p>
        </div>
        <Button size="sm" icon={<Plus size={15} />} onClick={() => setShowAdd(true)}>Add Configuration</Button>
      </div>

      {isLoading ? (
        <div className="p-5 space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
      ) : !configs?.length ? (
        <EmptyState icon={<Plus size={28} />} title="No configurations yet" message="Add one to start calculating Average Estimation." />
      ) : (
        <table className="w-full">
          <thead><tr className="border-b border-lgrayblue/20 dark:border-slate-700">
            {['Name', 'Small', 'Medium', 'Large', 'Status', 'Projects', 'Actions'].map(h => (
              <th key={h} className="px-5 py-3 text-left text-xs font-semibold text-coolslate uppercase tracking-wide">{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {configs.map((c) => (
              <tr key={c.id} className="border-b border-lgrayblue/10 dark:border-slate-700/30 last:border-0 hover:bg-lgrayblue/5 dark:hover:bg-slate-700/10 transition-colors">
                <td className="px-5 py-3">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-carbon dark:text-white">{c.name}</span>
                    {c.is_default && <Badge variant="success"><Star size={9} /> Default</Badge>}
                    {!c.is_active && <Badge variant="neutral"><Ban size={9} /> Inactive</Badge>}
                  </div>
                  {c.description && <p className="text-xs text-coolslate mt-0.5 max-w-sm truncate">{c.description}</p>}
                </td>
                <td className="px-5 py-3 text-sm text-carbon dark:text-white">{c.small}</td>
                <td className="px-5 py-3 text-sm text-carbon dark:text-white">{c.medium}</td>
                <td className="px-5 py-3 text-sm text-carbon dark:text-white">{c.large}</td>
                <td className="px-5 py-3"><Badge variant={c.is_active ? 'success' : 'neutral'}>{c.is_active ? 'Active' : 'Inactive'}</Badge></td>
                <td className="px-5 py-3 text-sm text-coolslate">{c.project_count ?? 0}</td>
                <td className="px-5 py-3">
                  <div className="flex gap-1.5">
                    <Button variant="ghost" size="xs" icon={<Edit2 size={13} />} onClick={() => setEditCfg(c)}>Edit</Button>
                    {!c.is_default && (
                      <Button variant="ghost" size="xs" icon={<Star size={13} />} onClick={() => defaultMutation.mutate(c.id)}>Set Default</Button>
                    )}
                    {!c.is_default && (
                      <Button variant="ghost" size="xs" icon={<Trash2 size={13} />} onClick={() => setDeleteCfg(c)} className="text-vibrant hover:text-vibrant">Delete</Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <AverageConfigModal isOpen={!!editCfg} cfg={editCfg} onClose={() => setEditCfg(undefined)}
        onSave={(data) => editCfg && updateMutation.mutate({ id: editCfg.id, data })} loading={updateMutation.isPending} />
      <AverageConfigModal isOpen={showAdd} onClose={() => setShowAdd(false)}
        onSave={(data) => createMutation.mutate(data)} loading={createMutation.isPending} />
      <ConfirmDialog isOpen={!!deleteCfg} onClose={() => setDeleteCfg(undefined)}
        onConfirm={() => deleteCfg && deleteMutation.mutate(deleteCfg.id)} loading={deleteMutation.isPending}
        title="Delete Configuration" message={`Delete the "${deleteCfg?.name}" Average Estimation configuration? Projects mapped to it will fall back to the default configuration.`} />
    </Card>
  );
}
