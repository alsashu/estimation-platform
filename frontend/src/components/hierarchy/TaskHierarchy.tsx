import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronRight, MoveRight } from 'lucide-react';
import { estimationsApi, parametricEstimationsApi } from '../../services/api';
import { useToastStore } from '../../store';
import { Badge, Button, Modal } from '../ui';
import { HierarchySelector, EMPTY_SELECTION, isHierarchyComplete, toHierarchyPayload } from './HierarchySelector';
import type { HierarchySelection, TaskHierarchyFields } from '../../types';

/** Department › Program › Baseline › Component › Subcomponent, or an "Unassigned" badge for legacy rows. */
export function HierarchyPath({ task, compact }: { task: TaskHierarchyFields; compact?: boolean }) {
  if (!task.project_id) return <Badge variant="warning">Unassigned (pre-hierarchy)</Badge>;
  const parts = [task.department_name, task.program_name, task.baseline_name, task.component_name, task.subcomponent_name]
    .filter(Boolean) as string[];
  if (compact) {
    return (
      <div className="min-w-0">
        <p className="text-sm text-carbon dark:text-white truncate">{task.program_name}</p>
        <p className="text-[11px] text-coolslate truncate">{[task.baseline_name, task.component_name, task.subcomponent_name].filter(Boolean).join(' › ')}</p>
      </div>
    );
  }
  return (
    <nav aria-label="Task hierarchy" className="flex flex-wrap items-center gap-1 text-xs">
      {parts.map((p, i) => (
        <span key={`${p}-${i}`} className="flex items-center gap-1">
          {i > 0 && <ChevronRight size={11} className="text-coolslate" />}
          <span className={i === parts.length - 1 ? 'font-semibold text-carbon dark:text-white' : 'text-coolslate'}>{p}</span>
        </span>
      ))}
    </nav>
  );
}

/** Pre-fills the selector from a task's current hierarchy. */
function selectionFrom(task: TaskHierarchyFields): HierarchySelection {
  if (!task.project_id) return EMPTY_SELECTION;
  return {
    department_id: task.department_id ?? '',
    program_id: task.project_id ?? '',
    baseline_id: task.baseline_id ?? '',
    component_id: task.component_id ?? '',
    subcomponent_id: task.subcomponent_id ?? '',
  };
}

/**
 * Moves a task to another Department / Program / Baseline / Component / Subcomponent.
 * The API re-validates the whole selection and the caller's access; estimation values are unchanged.
 */
export function ReassignHierarchyButton({ module, task, onDone }: {
  module: 'sp' | 'pe';
  task: TaskHierarchyFields & { id: string };
  onDone?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState<HierarchySelection>(() => selectionFrom(task));
  const qc = useQueryClient();
  const { addToast } = useToastStore();

  const mut = useMutation({
    mutationFn: (): Promise<unknown> => module === 'sp'
      ? estimationsApi.update(task.id, toHierarchyPayload(sel))
      : parametricEstimationsApi.update(task.id, toHierarchyPayload(sel)),
    onSuccess: () => {
      addToast({ type: 'success', title: 'Task moved', message: 'Hierarchy updated' });
      qc.invalidateQueries({ queryKey: module === 'sp' ? ['estimations'] : ['parametric-estimations'] });
      qc.invalidateQueries({ queryKey: ['hierarchy-effort'] });
      setOpen(false);
      onDone?.();
    },
    onError: (e: Error) => addToast({ type: 'error', title: 'Could not move task', message: e.message }),
  });

  return (
    <>
      <Button variant="outline" size="sm" icon={<MoveRight size={14} />} onClick={() => { setSel(selectionFrom(task)); setOpen(true); }}>
        {task.project_id ? 'Change hierarchy' : 'Assign to hierarchy'}
      </Button>
      <Modal isOpen={open} onClose={() => setOpen(false)} title={task.project_id ? 'Change task hierarchy' : 'Assign task to hierarchy'} size="lg"
        footer={<>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={() => mut.mutate()} loading={mut.isPending} disabled={!isHierarchyComplete(sel)}>Save</Button>
        </>}>
        <p className="text-xs text-coolslate mb-4">
          Department, Program and Baseline are required. Estimated and actual values are kept as they are.
        </p>
        <HierarchySelector value={sel} onChange={setSel} useContextDefaults={false} showErrors layout="grid" />
      </Modal>
    </>
  );
}
