import { Building2, FolderOpen } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { programsForDepartment, useHierarchyStore } from '../../store/hierarchyStore';
import { SearchableSelect } from '../ui/SearchableSelect';

/**
 * Header: [Department] [Program]. Lists only what the user is authorised for (loaded from
 * /hierarchy/context). Changing the department clears a program that does not belong to it and the
 * pages re-query because their query keys include the context.
 */
export function ContextSelector() {
  const qc = useQueryClient();
  const {
    departments, programs, selectedDepartmentId, selectedProgramId,
    setSelectedDepartment, setSelectedProgram, initialized,
  } = useHierarchyStore();

  const visiblePrograms = programsForDepartment(programs, selectedDepartmentId);
  const multipleDepartments = departments.length > 1;
  const multiplePrograms = visiblePrograms.length > 1;

  const refresh = () => {
    // Pages key their queries on the context, so they refetch automatically; this also drops cached
    // cascading lookups that depended on the previous context.
    qc.invalidateQueries({ queryKey: ['lookup'] });
  };

  if (!initialized) return null;
  if (departments.length === 0) {
    return <span className="text-xs text-coolslate px-2" data-testid="context-empty">No department access</span>;
  }

  return (
    <div className="flex items-center gap-2 min-w-0" data-testid="context-selector">
      <SearchableSelect
        size="sm"
        className="w-44 lg:w-52"
        ariaLabel="Department"
        testId="ctx-department"
        icon={<Building2 size={13} />}
        options={departments.map(d => ({ id: d.id, label: d.name, badge: d.code }))}
        value={selectedDepartmentId}
        onChange={(id) => { setSelectedDepartment(id); refresh(); }}
        allOptionLabel={multipleDepartments ? 'All Departments' : undefined}
        clearable={multipleDepartments}
        disabled={!multipleDepartments}
        placeholder="Department"
        emptyMessage="No departments found"
      />
      <SearchableSelect
        size="sm"
        className="w-44 lg:w-56"
        ariaLabel="Program"
        testId="ctx-program"
        icon={<FolderOpen size={13} />}
        options={visiblePrograms.map(p => ({ id: p.id, label: p.name, badge: p.code }))}
        value={selectedProgramId}
        onChange={(id) => { setSelectedProgram(id); refresh(); }}
        allOptionLabel={multiplePrograms || visiblePrograms.length === 0 ? 'All Programs' : undefined}
        clearable={multiplePrograms}
        disabled={visiblePrograms.length <= 1}
        placeholder={visiblePrograms.length === 0 ? 'No programs' : 'All Programs'}
        emptyMessage="No programs in this department"
      />
    </div>
  );
}
