/**
 * Global Department → Program context (the header selection).
 *
 * The selected Department and Program act as global filters for Dashboard SP/PE, Storypoint and
 * Parametric Estimation, Historical Data SP/PE and Analytics SP/PE, and persist across navigation and
 * reloads. `null` means "All" (all accessible departments / all accessible programs of the department).
 * Authorisation is enforced by the API — this store only narrows what the user is looking at.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { HierarchyContext, HierarchyOption } from '../types';

export type ProgramOption = HierarchyOption & { department_id: string };

interface HierarchyStore {
  isGlobal: boolean;
  departments: HierarchyOption[];
  /** Every program the user can access, across all their departments. */
  programs: ProgramOption[];
  selectedDepartmentId: string | null;
  selectedProgramId: string | null;
  initialized: boolean;
  setContext: (ctx: HierarchyContext) => void;
  setSelectedDepartment: (id: string | null) => void;
  setSelectedProgram: (id: string | null) => void;
  reset: () => void;
}

/** Programs that belong to the selected department (all accessible programs when "All departments"). */
export function programsForDepartment(programs: ProgramOption[], departmentId: string | null): ProgramOption[] {
  return departmentId ? programs.filter(p => p.department_id === departmentId) : programs;
}

/** Keeps a selection valid for a department: clears an invalid program, auto-selects a single option. */
function resolveProgram(programs: ProgramOption[], departmentId: string | null, current: string | null): string | null {
  const visible = programsForDepartment(programs, departmentId);
  if (current && visible.some(p => p.id === current)) return current;
  if (departmentId && visible.length === 1) return visible[0].id;
  return null;
}

export const useHierarchyStore = create<HierarchyStore>()(
  persist(
    (set, get) => ({
      isGlobal: false,
      departments: [],
      programs: [],
      selectedDepartmentId: null,
      selectedProgramId: null,
      initialized: false,

      setContext: ({ isGlobal, departments, programs }) => {
        const state = get();
        let departmentId = state.selectedDepartmentId;
        if (departmentId && !departments.some(d => d.id === departmentId)) departmentId = null;
        if (!departmentId && departments.length === 1) departmentId = departments[0].id;
        // A persisted program implies its department
        let programId = state.selectedProgramId;
        const persistedProgram = programId ? programs.find(p => p.id === programId) : undefined;
        if (persistedProgram && !departmentId) departmentId = persistedProgram.department_id;
        programId = resolveProgram(programs, departmentId, persistedProgram ? programId : null);
        set({ isGlobal, departments, programs, selectedDepartmentId: departmentId, selectedProgramId: programId, initialized: true });
      },

      setSelectedDepartment: (id) => {
        const { programs, selectedProgramId } = get();
        set({ selectedDepartmentId: id, selectedProgramId: resolveProgram(programs, id, selectedProgramId) });
      },

      setSelectedProgram: (id) => {
        if (!id) { set({ selectedProgramId: null }); return; }
        const program = get().programs.find(p => p.id === id);
        if (!program) return; // never select something the user cannot access
        set({ selectedProgramId: id, selectedDepartmentId: program.department_id });
      },

      reset: () => set({
        isGlobal: false, departments: [], programs: [],
        selectedDepartmentId: null, selectedProgramId: null, initialized: false,
      }),
    }),
    {
      name: 'ep-hierarchy',
      partialize: (s) => ({ selectedDepartmentId: s.selectedDepartmentId, selectedProgramId: s.selectedProgramId }),
    }
  )
);

/** Query params for the current header context — pass to any SP/PE list, dashboard or analytics API. */
export function useContextParams(): { departmentId?: string; programId?: string } {
  const departmentId = useHierarchyStore(s => s.selectedDepartmentId);
  const programId = useHierarchyStore(s => s.selectedProgramId);
  return {
    ...(departmentId ? { departmentId } : {}),
    ...(programId ? { programId } : {}),
  };
}
