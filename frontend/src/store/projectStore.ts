import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ProjectRecord } from '../services/api';

// null = "All Projects" (GSA only), string = specific project UUID
type ProjectId = string | null;

interface ProjectStore {
  selectedProjectId: ProjectId;
  projects: ProjectRecord[];
  initialized: boolean;
  setSelectedProject: (id: ProjectId) => void;
  setProjects: (projects: ProjectRecord[], userProjectIds: string[] | '*') => void;
  reset: () => void;
}

export const useProjectStore = create<ProjectStore>()(
  persist(
    (set, get) => ({
      selectedProjectId: null,
      projects: [],
      initialized: false,

      setSelectedProject: (id) => set({ selectedProjectId: id }),

      setProjects: (projects, userProjectIds) => {
        const current = get().selectedProjectId;
        const isGSA = userProjectIds === '*';

        // Auto-select if there is exactly one accessible project
        if (!isGSA && projects.length === 1) {
          set({ projects, selectedProjectId: projects[0].id, initialized: true });
          return;
        }

        // GSA default: null = all projects
        if (isGSA && current === null) {
          set({ projects, selectedProjectId: null, initialized: true });
          return;
        }

        // Validate that persisted selection still exists in accessible projects
        const isValid = current === null
          ? isGSA // null only valid for GSA
          : projects.some(p => p.id === current);

        if (!isValid) {
          // Fall back: auto-select first project for non-GSA, or null for GSA
          set({
            projects,
            selectedProjectId: isGSA ? null : (projects[0]?.id ?? null),
            initialized: true,
          });
        } else {
          set({ projects, initialized: true });
        }
      },

      reset: () => set({ selectedProjectId: null, projects: [], initialized: false }),
    }),
    {
      name: 'ep-project',
      partialize: (state) => ({ selectedProjectId: state.selectedProjectId }),
    }
  )
);
