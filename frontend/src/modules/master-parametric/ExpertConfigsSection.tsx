import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Edit2, Trash2, Star, Ban } from 'lucide-react';
import { parametricMasterApi } from '../../services/api';
import { Button, Card, Modal, ConfirmDialog, Badge, EmptyState, Skeleton, Input, Textarea } from '../../components/ui';
import { useToastStore } from '../../store';
import type { ParametricExpertConfig, ParametricFieldSet } from '../../types';

const FIELDS: { key: keyof ParametricFieldSet; label: string }[] = [
  { key: 'middleware_inputs', label: 'Middleware Inputs' },
  { key: 'application', label: 'Application' },
  { key: 'system_configuration', label: 'System Configuration' },
  { key: 'data_and_control_flow', label: 'Data and Control Flow' },
  { key: 'use_case', label: 'Use Case' },
];
const SIZES = ['Small', 'Medium', 'Large'] as const;

type ValuesState = Record<typeof SIZES[number], Record<keyof ParametricFieldSet, string>>;

function emptyValues(cfg?: ParametricExpertConfig): ValuesState {
  const blank = { middleware_inputs: '0', application: '0', system_configuration: '0', data_and_control_flow: '0', use_case: '0' };
  return {
    Small: cfg ? Object.fromEntries(FIELDS.map(f => [f.key, String(cfg.values.Small[f.key])])) as ValuesState['Small'] : { ...blank },
    Medium: cfg ? Object.fromEntries(FIELDS.map(f => [f.key, String(cfg.values.Medium[f.key])])) as ValuesState['Medium'] : { ...blank },
    Large: cfg ? Object.fromEntries(FIELDS.map(f => [f.key, String(cfg.values.Large[f.key])])) as ValuesState['Large'] : { ...blank },
  };
}

function ExpertConfigModal({ cfg, isOpen, onClose, onSave, loading }: {
  cfg?: ParametricExpertConfig; isOpen: boolean; onClose: () => void;
  onSave: (data: { name: string; description?: string; values: ParametricExpertConfig['values'] }) => void;
  loading: boolean;
}) {
  const [name, setName] = useState(cfg?.name || '');
  const [description, setDescription] = useState(cfg?.description || '');
  const [values, setValues] = useState<ValuesState>(emptyValues(cfg));

  const setCell = (size: typeof SIZES[number], field: keyof ParametricFieldSet, v: string) =>
    setValues(prev => ({ ...prev, [size]: { ...prev[size], [field]: v } }));

  const valid = name.trim().length > 0;

  const handleSave = () => {
    if (!valid) return;
    const parsed = {
      Small: Object.fromEntries(FIELDS.map(f => [f.key, Number(values.Small[f.key]) || 0])) as unknown as ParametricFieldSet,
      Medium: Object.fromEntries(FIELDS.map(f => [f.key, Number(values.Medium[f.key]) || 0])) as unknown as ParametricFieldSet,
      Large: Object.fromEntries(FIELDS.map(f => [f.key, Number(values.Large[f.key]) || 0])) as unknown as ParametricFieldSet,
    };
    onSave({ name: name.trim(), description: description.trim() || undefined, values: parsed });
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="xl" title={cfg ? 'Edit Expert Judgement Config' : 'Add Expert Judgement Config'}
      footer={<>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={handleSave} loading={loading} disabled={!valid}>{cfg ? 'Save Changes' : 'Add Configuration'}</Button>
      </>}
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input label="Configuration Name *" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. ASW" />
          <Input label="Description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional notes" />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="text-left text-xs font-semibold text-coolslate pb-2 pr-3">Size</th>
                {FIELDS.map(f => <th key={f.key} className="text-xs font-semibold text-coolslate pb-2 px-2 text-left min-w-[120px]">{f.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {SIZES.map(size => (
                <tr key={size}>
                  <td className="pr-3 py-1.5 text-sm font-semibold text-carbon dark:text-white whitespace-nowrap">{size}</td>
                  {FIELDS.map(f => (
                    <td key={f.key} className="px-2 py-1.5">
                      <input type="number" step="0.01" value={values[size][f.key]}
                        onChange={(e) => setCell(size, f.key, e.target.value)}
                        className="w-full px-2.5 py-2 rounded-lg border border-lgrayblue dark:border-slate-600 bg-white dark:bg-carbon-800 text-sm text-carbon dark:text-white focus:outline-none focus:ring-2 focus:ring-carbon/20"
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Modal>
  );
}

function ConfigCard({ cfg, onEdit, onDelete, onSetDefault }: {
  cfg: ParametricExpertConfig; onEdit: () => void; onDelete: () => void; onSetDefault: () => void;
}) {
  return (
    <Card padding="p-5">
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-carbon dark:text-white">{cfg.name}</h3>
            {cfg.is_default && <Badge variant="success"><Star size={9} /> Default</Badge>}
            {!cfg.is_active && <Badge variant="neutral"><Ban size={9} /> Inactive</Badge>}
          </div>
          {cfg.description && <p className="text-xs text-coolslate mt-0.5">{cfg.description}</p>}
          <p className="text-xs text-coolslate mt-0.5">{cfg.project_count ?? 0} project(s) mapped</p>
        </div>
        <div className="flex gap-1.5 flex-shrink-0">
          <Button variant="ghost" size="xs" icon={<Edit2 size={13} />} onClick={onEdit}>Edit</Button>
          {!cfg.is_default && <Button variant="ghost" size="xs" icon={<Star size={13} />} onClick={onSetDefault}>Default</Button>}
          {!cfg.is_default && <Button variant="ghost" size="xs" icon={<Trash2 size={13} />} onClick={onDelete} className="text-vibrant hover:text-vibrant">Delete</Button>}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-lgrayblue/20 dark:border-slate-700">
              <th className="text-left font-semibold text-coolslate pb-2 pr-3">Size</th>
              {FIELDS.map(f => <th key={f.key} className="font-semibold text-coolslate pb-2 px-2 text-left">{f.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {SIZES.map(size => (
              <tr key={size} className="border-b border-lgrayblue/10 dark:border-slate-700/30 last:border-0">
                <td className="pr-3 py-2 font-semibold text-carbon dark:text-white whitespace-nowrap">{size}</td>
                {FIELDS.map(f => <td key={f.key} className="px-2 py-2 text-carbon dark:text-white">{cfg.values[size][f.key]}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export function ExpertConfigsSection() {
  const qc = useQueryClient();
  const { addToast } = useToastStore();
  const [editCfg, setEditCfg] = useState<ParametricExpertConfig | undefined>();
  const [showAdd, setShowAdd] = useState(false);
  const [deleteCfg, setDeleteCfg] = useState<ParametricExpertConfig | undefined>();

  const { data: configs, isLoading } = useQuery({ queryKey: ['parametric-expert-configs'], queryFn: parametricMasterApi.getExpertConfigs, retry: false });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['parametric-expert-configs'] });

  const createMutation = useMutation({
    mutationFn: parametricMasterApi.createExpertConfig,
    onSuccess: () => { invalidate(); setShowAdd(false); addToast({ type: 'success', title: 'Configuration added' }); },
    onError: (e: Error) => addToast({ type: 'error', title: 'Error', message: e.message }),
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<ParametricExpertConfig> }) => parametricMasterApi.updateExpertConfig(id, data),
    onSuccess: () => { invalidate(); setEditCfg(undefined); addToast({ type: 'success', title: 'Configuration updated' }); },
    onError: (e: Error) => addToast({ type: 'error', title: 'Error', message: e.message }),
  });
  const defaultMutation = useMutation({
    mutationFn: (id: string) => parametricMasterApi.setDefaultExpertConfig(id),
    onSuccess: () => { invalidate(); addToast({ type: 'success', title: 'Default configuration updated' }); },
    onError: (e: Error) => addToast({ type: 'error', title: 'Error', message: e.message }),
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => parametricMasterApi.deleteExpertConfig(id),
    onSuccess: () => { invalidate(); setDeleteCfg(undefined); addToast({ type: 'success', title: 'Configuration deleted' }); },
    onError: (e: Error) => { addToast({ type: 'error', title: 'Error', message: e.message }); setDeleteCfg(undefined); },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-carbon dark:text-white text-sm">{configs?.length || 0} Configurations</h2>
          <p className="text-xs text-coolslate mt-0.5">Used to calculate Detailed Estimation (PersonDays) per field size.</p>
        </div>
        <Button size="sm" icon={<Plus size={15} />} onClick={() => setShowAdd(true)}>Add Configuration</Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">{Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-40 w-full rounded-xl" />)}</div>
      ) : !configs?.length ? (
        <Card><EmptyState icon={<Plus size={28} />} title="No configurations yet" message="Add one to start calculating Detailed Estimation." /></Card>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {configs.map((c) => (
            <ConfigCard key={c.id} cfg={c} onEdit={() => setEditCfg(c)} onDelete={() => setDeleteCfg(c)} onSetDefault={() => defaultMutation.mutate(c.id)} />
          ))}
        </div>
      )}

      <ExpertConfigModal isOpen={!!editCfg} cfg={editCfg} onClose={() => setEditCfg(undefined)}
        onSave={(data) => editCfg && updateMutation.mutate({ id: editCfg.id, data })} loading={updateMutation.isPending} />
      <ExpertConfigModal isOpen={showAdd} onClose={() => setShowAdd(false)}
        onSave={(data) => createMutation.mutate(data)} loading={createMutation.isPending} />
      <ConfirmDialog isOpen={!!deleteCfg} onClose={() => setDeleteCfg(undefined)}
        onConfirm={() => deleteCfg && deleteMutation.mutate(deleteCfg.id)} loading={deleteMutation.isPending}
        title="Delete Configuration" message={`Delete the "${deleteCfg?.name}" Expert Judgement configuration? Projects mapped to it will fall back to the default configuration.`} />
    </div>
  );
}
