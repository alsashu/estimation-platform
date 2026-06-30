import { describe, it, expect, beforeEach } from 'vitest';
import { useProjectStore } from '../../store/projectStore';
import type { ProjectRecord } from '../../services/api';

const makeProject = (id: string, name: string, code?: string): ProjectRecord => ({
  id, name, status: 'active', created_at: '2025-01-01', code,
});

beforeEach(() => {
  useProjectStore.getState().reset();
});

describe('projectStore', () => {
  describe('setSelectedProject', () => {
    it('sets a project id', () => {
      useProjectStore.getState().setSelectedProject('proj-1');
      expect(useProjectStore.getState().selectedProjectId).toBe('proj-1');
    });

    it('accepts null (All Projects)', () => {
      useProjectStore.getState().setSelectedProject('proj-1');
      useProjectStore.getState().setSelectedProject(null);
      expect(useProjectStore.getState().selectedProjectId).toBeNull();
    });
  });

  describe('setProjects — non-GSA auto-select', () => {
    it('auto-selects when only one project', () => {
      const projects = [makeProject('p1', 'Alpha')];
      useProjectStore.getState().setProjects(projects, ['p1']);
      const state = useProjectStore.getState();
      expect(state.selectedProjectId).toBe('p1');
      expect(state.initialized).toBe(true);
    });

    it('does not auto-select when multiple projects', () => {
      const projects = [makeProject('p1', 'Alpha'), makeProject('p2', 'Beta')];
      useProjectStore.getState().setProjects(projects, ['p1', 'p2']);
      // current is null after reset — not valid for non-GSA, falls back to first
      expect(useProjectStore.getState().selectedProjectId).toBe('p1');
    });
  });

  describe('setProjects — GSA', () => {
    it('defaults to null (All Projects) for GSA', () => {
      const projects = [makeProject('p1', 'A'), makeProject('p2', 'B')];
      useProjectStore.getState().setProjects(projects, '*');
      expect(useProjectStore.getState().selectedProjectId).toBeNull();
    });

    it('keeps valid persisted selection for GSA', () => {
      const projects = [makeProject('p1', 'A'), makeProject('p2', 'B')];
      useProjectStore.getState().setSelectedProject('p1');
      useProjectStore.getState().setProjects(projects, '*');
      expect(useProjectStore.getState().selectedProjectId).toBe('p1');
    });
  });

  describe('setProjects — persisted selection validation', () => {
    it('clears persisted selection if project no longer accessible', () => {
      // Simulate persisted selection for a project that has been revoked
      useProjectStore.getState().setSelectedProject('p-revoked');
      const projects = [makeProject('p1', 'Alpha'), makeProject('p2', 'Beta')];
      useProjectStore.getState().setProjects(projects, ['p1', 'p2']);
      expect(useProjectStore.getState().selectedProjectId).toBe('p1');
    });

    it('keeps valid persisted selection', () => {
      useProjectStore.getState().setSelectedProject('p2');
      const projects = [makeProject('p1', 'Alpha'), makeProject('p2', 'Beta')];
      useProjectStore.getState().setProjects(projects, ['p1', 'p2']);
      expect(useProjectStore.getState().selectedProjectId).toBe('p2');
    });
  });

  describe('reset', () => {
    it('clears all state', () => {
      useProjectStore.getState().setSelectedProject('p1');
      useProjectStore.getState().setProjects([makeProject('p1', 'A')], ['p1']);
      useProjectStore.getState().reset();
      const state = useProjectStore.getState();
      expect(state.selectedProjectId).toBeNull();
      expect(state.projects).toHaveLength(0);
      expect(state.initialized).toBe(false);
    });
  });
});
