import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { GitBranch, Boxes, Box } from 'lucide-react';
import { hierarchyApi } from '../../services/api';
import { useContextParams, useHierarchyStore } from '../../store/hierarchyStore';
import { SearchableSelect } from '../ui/SearchableSelect';

export interface PageHierarchyFilter {
  baselineId: string | null;
  componentId: string | null;
  subcomponentId: string | null;
}

const EMPTY: PageHierarchyFilter = { baselineId: null, componentId: null, subcomponentId: null };

/**
 * Page-level Baseline (→ Component → Subcomponent) filter that sits under the header's
 * Department / Program context. Resets automatically when the header program changes, and returns the
 * merged query params for SP/PE list, dashboard and analytics APIs.
 */
export function usePageHierarchyFilter() {
  const programId = useHierarchyStore(s => s.selectedProgramId);
  const context = useContextParams();
  const [filter, setFilter] = useState<PageHierarchyFilter>(EMPTY);

  useEffect(() => { setFilter(EMPTY); }, [programId]);

  const params = useMemo(() => ({
    ...context,
    ...(filter.baselineId ? { baselineId: filter.baselineId } : {}),
    ...(filter.componentId ? { componentId: filter.componentId } : {}),
    ...(filter.subcomponentId ? { subcomponentId: filter.subcomponentId } : {}),
  }), [context.departmentId, context.programId, filter]); // eslint-disable-line react-hooks/exhaustive-deps

  return { filter, setFilter, params, programId };
}

interface Props {
  value: PageHierarchyFilter;
  onChange: (f: PageHierarchyFilter) => void;
  /** 'baseline' → Baseline only (dashboards); 'subcomponent' → Baseline, Component, Subcomponent (history). */
  depth?: 'baseline' | 'subcomponent';
}

export function HierarchyFilterBar({ value, onChange, depth = 'baseline' }: Props) {
  const programId = useHierarchyStore(s => s.selectedProgramId);

  const baselines = useQuery({
    queryKey: ['lookup', 'baselines', programId],
    queryFn: () => hierarchyApi.baselines(programId!),
    enabled: !!programId,
  });
  const components = useQuery({
    queryKey: ['lookup', 'components', value.baselineId],
    queryFn: () => hierarchyApi.components(value.baselineId!),
    enabled: depth === 'subcomponent' && !!value.baselineId,
  });
  const subcomponents = useQuery({
    queryKey: ['lookup', 'subcomponents', value.componentId],
    queryFn: () => hierarchyApi.subcomponents(value.componentId!),
    enabled: depth === 'subcomponent' && !!value.componentId,
  });

  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="hierarchy-filter-bar">
      <SearchableSelect
        size="sm" className="w-48" ariaLabel="Baseline" testId="filter-baseline" icon={<GitBranch size={13} />}
        options={(baselines.data ?? []).map(b => ({ id: b.id, label: b.name, badge: b.version }))}
        value={value.baselineId}
        onChange={id => onChange({ baselineId: id, componentId: null, subcomponentId: null })}
        allOptionLabel="All Baselines"
        loading={baselines.isFetching}
        disabled={!programId}
        disabledHint="Select a program for baselines"
        emptyMessage="No baselines in this program"
      />
      {depth === 'subcomponent' && (
        <>
          <SearchableSelect
            size="sm" className="w-44" ariaLabel="Component" testId="filter-component" icon={<Boxes size={13} />}
            options={(components.data ?? []).map(c => ({ id: c.id, label: c.name }))}
            value={value.componentId}
            onChange={id => onChange({ ...value, componentId: id, subcomponentId: null })}
            allOptionLabel="All Components"
            loading={components.isFetching}
            disabled={!value.baselineId}
            disabledHint="Component"
            emptyMessage="No components"
          />
          <SearchableSelect
            size="sm" className="w-44" ariaLabel="Subcomponent" testId="filter-subcomponent" icon={<Box size={13} />}
            options={(subcomponents.data ?? []).map(s => ({ id: s.id, label: s.name }))}
            value={value.subcomponentId}
            onChange={id => onChange({ ...value, subcomponentId: id })}
            allOptionLabel="All Subcomponents"
            loading={subcomponents.isFetching}
            disabled={!value.componentId}
            disabledHint="Subcomponent"
            emptyMessage="No subcomponents"
          />
        </>
      )}
    </div>
  );
}
