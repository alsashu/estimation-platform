import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Building2, FolderOpen, GitBranch, Boxes, Box } from 'lucide-react';
import { hierarchyApi } from '../../services/api';
import { useHierarchyStore } from '../../store/hierarchyStore';
import { SearchableSelect, type SearchableOption } from '../ui/SearchableSelect';
import { cn } from '../../utils/formatters';
import type { HierarchyOption, HierarchySelection } from '../../types';

export const EMPTY_SELECTION: HierarchySelection = {
  department_id: '', program_id: '', baseline_id: '', component_id: '', subcomponent_id: '',
};

const LEVELS = ['department_id', 'program_id', 'baseline_id', 'component_id', 'subcomponent_id'] as const;
type Level = typeof LEVELS[number];

/**
 * Pure cascade rule: setting a level clears every level below it (dependent selections are no longer
 * valid when a parent changes). Exported for unit testing.
 */
export function applyHierarchyChange(current: HierarchySelection, level: Level, id: string | null): HierarchySelection {
  const next = { ...current, [level]: id ?? '' };
  if (current[level] === (id ?? '')) return next;
  const idx = LEVELS.indexOf(level);
  for (const l of LEVELS.slice(idx + 1)) next[l] = '';
  return next;
}

/** True when the mandatory levels (Department, Program, Baseline) are chosen. */
export function isHierarchyComplete(sel: HierarchySelection): boolean {
  return !!sel.department_id && !!sel.program_id && !!sel.baseline_id;
}

/** API payload — optional levels become null when not chosen. */
export function toHierarchyPayload(sel: HierarchySelection) {
  return {
    department_id: sel.department_id,
    program_id: sel.program_id,
    baseline_id: sel.baseline_id,
    component_id: sel.component_id || null,
    subcomponent_id: sel.subcomponent_id || null,
  };
}

const toOptions = (rows: HierarchyOption[] | undefined): SearchableOption[] =>
  (rows ?? []).map(r => ({
    id: r.id,
    label: r.name,
    badge: r.code ?? r.version ?? (r.is_legacy ? 'LEGACY' : null),
  }));

export interface HierarchySelectorProps {
  value: HierarchySelection;
  onChange: (next: HierarchySelection) => void;
  /** Pre-fill Department/Program from the header context on first render (default true). */
  useContextDefaults?: boolean;
  /** Show the optional Component / Subcomponent pickers (default true). */
  showOptional?: boolean;
  /** Show validation errors on empty mandatory fields. */
  showErrors?: boolean;
  disabled?: boolean;
  /** Grid layout: 'stack' (1 col), 'grid' (responsive 2–3 cols) or 'row' (5 across on xl). */
  layout?: 'stack' | 'grid' | 'row';
  className?: string;
  /** Receives display names of the current selection (for review / summary screens). */
  onNamesChange?: (names: Record<'department' | 'program' | 'baseline' | 'component' | 'subcomponent', string>) => void;
}

export function HierarchySelector({
  value, onChange, useContextDefaults = true, showOptional = true, showErrors = false,
  disabled, layout = 'grid', className, onNamesChange,
}: HierarchySelectorProps) {
  const ctxDepartment = useHierarchyStore(s => s.selectedDepartmentId);
  const ctxProgram = useHierarchyStore(s => s.selectedProgramId);
  const valueRef = useRef(value);
  valueRef.current = value;
  // Update the ref eagerly: several effects can call `set` in the same commit (e.g. departments and
  // programs resolving together) and each must build on the previous change, not the stale prop.
  const set = (level: Level, id: string | null) => {
    const next = applyHierarchyChange(valueRef.current, level, id);
    valueRef.current = next;
    onChange(next);
  };

  // ── Data (each level loads dynamically once its parent is chosen; permission-filtered server-side)
  const depts = useQuery({ queryKey: ['lookup', 'departments'], queryFn: () => hierarchyApi.departments(), staleTime: 60_000 });
  const programs = useQuery({
    queryKey: ['lookup', 'programs', value.department_id],
    queryFn: () => hierarchyApi.programs(value.department_id),
    enabled: !!value.department_id, staleTime: 60_000,
  });
  const baselines = useQuery({
    queryKey: ['lookup', 'baselines', value.program_id],
    queryFn: () => hierarchyApi.baselines(value.program_id),
    enabled: !!value.program_id, staleTime: 30_000,
  });
  const components = useQuery({
    queryKey: ['lookup', 'components', value.baseline_id],
    queryFn: () => hierarchyApi.components(value.baseline_id),
    enabled: showOptional && !!value.baseline_id, staleTime: 30_000,
  });
  const subcomponents = useQuery({
    queryKey: ['lookup', 'subcomponents', value.component_id],
    queryFn: () => hierarchyApi.subcomponents(value.component_id),
    enabled: showOptional && !!value.component_id, staleTime: 30_000,
  });

  // ── Defaults from the header context (once)
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current || !useContextDefaults) return;
    seeded.current = true;
    if (!value.department_id && ctxDepartment) {
      onChange({ ...EMPTY_SELECTION, department_id: ctxDepartment, program_id: ctxProgram ?? '' });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto-select when there is exactly one authorised Department / Program
  useEffect(() => {
    const rows = depts.data;
    if (!rows) return;
    const v = valueRef.current;
    if (!v.department_id && rows.length === 1) set('department_id', rows[0].id);
    else if (v.department_id && !rows.some(r => r.id === v.department_id)) set('department_id', null);
  }, [depts.data]); // eslint-disable-line react-hooks/exhaustive-deps

  // Each lower-level effect only acts on data fetched for the parent that is *still* selected — an
  // earlier effect in the same commit may already have cleared that parent (e.g. unauthorised dept).
  const fetchedFor = value;
  useEffect(() => {
    const rows = programs.data;
    if (!rows) return;
    const v = valueRef.current;
    if (!v.department_id || v.department_id !== fetchedFor.department_id) return;
    if (!v.program_id && rows.length === 1) set('program_id', rows[0].id);
    else if (v.program_id && !rows.some(r => r.id === v.program_id)) set('program_id', null);
  }, [programs.data]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Drop stale lower-level selections that the freshly loaded lists no longer contain
  useEffect(() => {
    const v = valueRef.current;
    if (v.program_id !== fetchedFor.program_id) return;
    if (baselines.data && v.baseline_id && !baselines.data.some(r => r.id === v.baseline_id)) set('baseline_id', null);
  }, [baselines.data]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const v = valueRef.current;
    if (v.baseline_id !== fetchedFor.baseline_id) return;
    if (components.data && v.component_id && !components.data.some(r => r.id === v.component_id)) set('component_id', null);
  }, [components.data]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const v = valueRef.current;
    if (v.component_id !== fetchedFor.component_id) return;
    if (subcomponents.data && v.subcomponent_id && !subcomponents.data.some(r => r.id === v.subcomponent_id)) set('subcomponent_id', null);
  }, [subcomponents.data]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Report display names of the selection to the parent (only when they actually change)
  const nameOf = (rows: HierarchyOption[] | undefined, id: string) => rows?.find(r => r.id === id)?.name ?? '';
  const names = {
    department: nameOf(depts.data, value.department_id),
    program: nameOf(programs.data, value.program_id),
    baseline: nameOf(baselines.data, value.baseline_id),
    component: nameOf(components.data, value.component_id),
    subcomponent: nameOf(subcomponents.data, value.subcomponent_id),
  };
  const namesKey = JSON.stringify(names);
  useEffect(() => { onNamesChange?.(names); }, [namesKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const err = (ok: boolean, msg: string) => (showErrors && !ok ? msg : undefined);
  const grid = layout === 'stack' ? 'grid-cols-1'
    : layout === 'row' ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5'
    : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3';

  return (
    <div className={cn('grid gap-4', grid, className)} data-testid="hierarchy-selector">
      <SearchableSelect
        label="Department" required testId="hs-department" icon={<Building2 size={14} />}
        options={toOptions(depts.data)} value={value.department_id || null}
        onChange={id => set('department_id', id)}
        loading={depts.isFetching} disabled={disabled}
        placeholder="Select department…" emptyMessage="No departments available to you"
        error={err(!!value.department_id, 'Department is required')}
      />
      <SearchableSelect
        label="Program" required testId="hs-program" icon={<FolderOpen size={14} />}
        options={toOptions(programs.data)} value={value.program_id || null}
        onChange={id => set('program_id', id)}
        loading={programs.isFetching} disabled={disabled || !value.department_id}
        disabledHint="Select a department first"
        placeholder="Select program…" emptyMessage="No programs in this department are available to you"
        error={err(!!value.program_id, 'Program is required')}
      />
      <SearchableSelect
        label="Baseline" required testId="hs-baseline" icon={<GitBranch size={14} />}
        options={toOptions(baselines.data)} value={value.baseline_id || null}
        onChange={id => set('baseline_id', id)}
        loading={baselines.isFetching} disabled={disabled || !value.program_id}
        disabledHint="Select a program first"
        placeholder="Select baseline…" emptyMessage="No active baselines in this program"
        error={err(!!value.baseline_id, 'Baseline is required')}
      />
      {showOptional && (
        <>
          <SearchableSelect
            label="Component (optional)" testId="hs-component" icon={<Boxes size={14} />}
            options={toOptions(components.data)} value={value.component_id || null}
            onChange={id => set('component_id', id)}
            loading={components.isFetching} disabled={disabled || !value.baseline_id}
            disabledHint="Select a baseline first"
            placeholder={components.data?.length === 0 ? 'No components — optional' : 'Select component…'}
            emptyMessage="No components defined for this baseline — you can continue without one"
          />
          <SearchableSelect
            label="Subcomponent (optional)" testId="hs-subcomponent" icon={<Box size={14} />}
            options={toOptions(subcomponents.data)} value={value.subcomponent_id || null}
            onChange={id => set('subcomponent_id', id)}
            loading={subcomponents.isFetching} disabled={disabled || !value.component_id}
            disabledHint="Select a component first"
            placeholder={subcomponents.data?.length === 0 ? 'No subcomponents — optional' : 'Select subcomponent…'}
            emptyMessage="No subcomponents defined for this component — you can continue without one"
          />
        </>
      )}
    </div>
  );
}
