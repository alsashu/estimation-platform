import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Layers, Plus, Edit2, Trash2, Info } from 'lucide-react';
import { masterApi } from '../../services/api';
import { Button, Card, Modal, ConfirmDialog, Skeleton } from '../../components/ui';
import { useToastStore } from '../../store';
import { SP_COLORS } from '../../config/theme';
import type { EffortEstimateConfig } from '../../types';

function EffortModal({ effort, isOpen, onClose, onSave, loading }: {
  effort?: EffortEstimateConfig; isOpen: boolean; onClose: () => void;
  onSave: (data: { story_points?: number; min_days: number; max_days: number }) => void;
  loading: boolean;
}) {
  const [sp, setSP] = useState(String(effort?.story_points || ''));
  const [minD, setMinD] = useState(String(effort?.min_days || ''));
  const [maxD, setMaxD] = useState(String(effort?.max_days || ''));
  const isNew = !effort;

  const minH = minD ? (parseFloat(minD) * 8).toFixed(2) : '—';
  const maxH = maxD ? (parseFloat(maxD) * 8).toFixed(2) : '—';
  const valid = !isNew || !!sp;
  const rangeOk = parseFloat(maxD) > parseFloat(minD);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={isNew ? 'Add Effort Estimate' : `Edit SP ${effort?.story_points}`}
      footer={<>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={() => valid && rangeOk && onSave({ ...(isNew && { story_points: parseInt(sp) }), min_days: parseFloat(minD), max_days: parseFloat(maxD) })}
          loading={loading} disabled={!valid || !minD || !maxD || !rangeOk}>
          {isNew ? 'Add' : 'Save'}
        </Button>
      </>}
    >
      <div className="space-y-4">
        {isNew && (
          <div>
            <label className="text-sm font-medium text-carbon dark:text-lgrayblue block mb-1">Story Points</label>
            <input type="number" value={sp} onChange={(e) => setSP(e.target.value)} min="1" placeholder="e.g. 8"
              className="w-full px-3 py-2.5 rounded-lg border border-lgrayblue dark:border-slate-600 bg-white dark:bg-carbon-800 text-sm text-carbon dark:text-white focus:outline-none focus:ring-2 focus:ring-carbon/20"
            />
          </div>
        )}
        {!isNew && effort && (
          <div className="flex items-center gap-2 bg-lgrayblue/20 dark:bg-carbon-800/50 rounded-lg p-3">
            <div className="w-3 h-3 rounded-full" style={{ background: SP_COLORS[effort.story_points] || '#788291' }} />
            <span className="text-sm font-semibold text-carbon dark:text-white">{effort.story_points} Story Points</span>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm font-medium text-carbon dark:text-lgrayblue block mb-1">Minimum Days</label>
            <input type="number" value={minD} onChange={(e) => setMinD(e.target.value)} min="0.5" step="0.5" placeholder="e.g. 7"
              className="w-full px-3 py-2.5 rounded-lg border border-lgrayblue dark:border-slate-600 bg-white dark:bg-carbon-800 text-sm text-carbon dark:text-white focus:outline-none focus:ring-2 focus:ring-carbon/20"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-carbon dark:text-lgrayblue block mb-1">Maximum Days</label>
            <input type="number" value={maxD} onChange={(e) => setMaxD(e.target.value)} min="0.5" step="0.5" placeholder="e.g. 12"
              className="w-full px-3 py-2.5 rounded-lg border border-lgrayblue dark:border-slate-600 bg-white dark:bg-carbon-800 text-sm text-carbon dark:text-white focus:outline-none focus:ring-2 focus:ring-carbon/20"
            />
          </div>
        </div>
        {!rangeOk && minD && maxD && <p className="text-xs text-vibrant">Maximum days must be greater than minimum days.</p>}
        <div className="bg-lgrayblue/20 dark:bg-carbon-800/50 rounded-lg p-3 text-xs space-y-1">
          <div className="flex items-center gap-1.5 text-coolslate mb-1"><Info size={12} /> Hours are auto-calculated (Days × 8)</div>
          <div className="flex justify-between text-carbon dark:text-white">
            <span>Min Hours:</span><span className="font-semibold">{minH} hrs</span>
          </div>
          <div className="flex justify-between text-carbon dark:text-white">
            <span>Max Hours:</span><span className="font-semibold">{maxH} hrs</span>
          </div>
        </div>
      </div>
    </Modal>
  );
}

export default function EffortEstimatesPage() {
  const qc = useQueryClient();
  const { addToast } = useToastStore();
  const [editEffort, setEditEffort] = useState<EffortEstimateConfig | undefined>();
  const [showAdd, setShowAdd] = useState(false);
  const [deleteEffort, setDeleteEffort] = useState<EffortEstimateConfig | undefined>();

  const { data: configs, isLoading } = useQuery({ queryKey: ['effort-estimates'], queryFn: masterApi.getEffortEstimates, retry: false });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => masterApi.updateEffortEstimate(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['effort-estimates'] }); setEditEffort(undefined); addToast({ type: 'success', title: 'Updated' }); },
    onError: (e: Error) => addToast({ type: 'error', title: 'Error', message: e.message }),
  });

  const createMutation = useMutation({
    mutationFn: masterApi.createEffortEstimate,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['effort-estimates'] }); setShowAdd(false); addToast({ type: 'success', title: 'Effort estimate added' }); },
    onError: (e: Error) => addToast({ type: 'error', title: 'Error', message: e.message }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => masterApi.deleteEffortEstimate(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['effort-estimates'] }); setDeleteEffort(undefined); addToast({ type: 'success', title: 'Deleted' }); },
    onError: (e: Error) => addToast({ type: 'error', title: 'Error', message: e.message }),
  });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold text-carbon dark:text-white flex items-center gap-2"><Layers size={22} /> Effort Estimates</h1>
          <p className="text-sm text-coolslate mt-0.5">Map Story Points to initial effort ranges (Days & Hours)</p>
        </div>
        <Button icon={<Plus size={16} />} onClick={() => setShowAdd(true)}>Add Config</Button>
      </div>

      <Card padding="p-4" className="bg-carbon/3 dark:bg-carbon-800/40 border-carbon/10">
        <div className="flex items-start gap-2 text-sm text-coolslate">
          <Info size={15} className="mt-0.5 flex-shrink-0 text-carbon dark:text-lgrayblue" />
          <span>Hours are automatically derived from Days × 8. Edit the Days values — Hours will update automatically.</span>
        </div>
      </Card>

      <Card padding="p-0">
        <table className="w-full">
          <thead><tr className="border-b border-lgrayblue/30 dark:border-slate-700">
            {['Story Points', 'Min Days', 'Max Days', 'Min Hours', 'Max Hours', 'Actions'].map(h => (
              <th key={h} className="px-5 py-3 text-left text-xs font-semibold text-coolslate uppercase tracking-wide">{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 9 }).map((_, i) => (
                <tr key={i} className="border-b border-lgrayblue/20 dark:border-slate-700/40">
                  {Array.from({ length: 6 }).map((_, j) => <td key={j} className="px-5 py-3"><Skeleton className="h-4 w-full" /></td>)}
                </tr>
              ))
            ) : (configs || []).map((e) => (
              <tr key={e.id} className="border-b border-lgrayblue/10 dark:border-slate-700/30 last:border-0 hover:bg-lgrayblue/5 dark:hover:bg-slate-700/10 transition-colors">
                <td className="px-5 py-3">
                  <span className="inline-flex items-center gap-2 font-bold text-sm" style={{ color: SP_COLORS[e.story_points] || '#788291' }}>
                    <div className="w-2.5 h-2.5 rounded-full" style={{ background: SP_COLORS[e.story_points] || '#788291' }} />
                    {e.story_points} SP
                  </span>
                </td>
                <td className="px-5 py-3 text-sm font-medium text-carbon dark:text-white">{Number(e.min_days)}</td>
                <td className="px-5 py-3 text-sm font-medium text-carbon dark:text-white">{Number(e.max_days)}</td>
                <td className="px-5 py-3 text-sm text-coolslate">{Number(e.min_hours)} hrs</td>
                <td className="px-5 py-3 text-sm text-coolslate">{Number(e.max_hours)} hrs</td>
                <td className="px-5 py-3">
                  <div className="flex gap-2">
                    <Button variant="ghost" size="xs" icon={<Edit2 size={13} />} onClick={() => setEditEffort(e)}>Edit</Button>
                    <Button variant="ghost" size="xs" icon={<Trash2 size={13} />} onClick={() => setDeleteEffort(e)} className="text-vibrant hover:text-vibrant">Delete</Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <EffortModal effort={editEffort} isOpen={!!editEffort} onClose={() => setEditEffort(undefined)}
        onSave={(data) => editEffort && updateMutation.mutate({ id: editEffort.id, data })}
        loading={updateMutation.isPending}
      />
      <EffortModal isOpen={showAdd} onClose={() => setShowAdd(false)}
        onSave={(data) => createMutation.mutate(data as any)}
        loading={createMutation.isPending}
      />
      <ConfirmDialog isOpen={!!deleteEffort} onClose={() => setDeleteEffort(undefined)}
        onConfirm={() => deleteEffort && deleteMutation.mutate(deleteEffort.id)}
        loading={deleteMutation.isPending}
        title="Delete Effort Config"
        message={`Remove the effort estimate for ${deleteEffort?.story_points} SP?`}
      />
    </div>
  );
}
