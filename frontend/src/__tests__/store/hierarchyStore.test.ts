import { describe, it, expect, beforeEach } from 'vitest';
import { useHierarchyStore, programsForDepartment, type ProgramOption } from '../../store/hierarchyStore';

const D1 = { id: 'd1', name: 'Engineering' };
const D2 = { id: 'd2', name: 'Finance' };
const P1: ProgramOption = { id: 'p1', name: 'Apollo', department_id: 'd1' };
const P2: ProgramOption = { id: 'p2', name: 'Gemini', department_id: 'd1' };
const P3: ProgramOption = { id: 'p3', name: 'Ledger', department_id: 'd2' };

const store = () => useHierarchyStore.getState();

describe('hierarchyStore', () => {
  beforeEach(() => store().reset());

  describe('programsForDepartment', () => {
    it('returns only programs of the department', () => {
      expect(programsForDepartment([P1, P2, P3], 'd1').map(p => p.id)).toEqual(['p1', 'p2']);
    });
    it('returns all programs when department is null ("All")', () => {
      expect(programsForDepartment([P1, P2, P3], null)).toHaveLength(3);
    });
  });

  describe('setContext — default selection', () => {
    it('auto-selects department and program when the user has exactly one of each', () => {
      store().setContext({ isGlobal: false, departments: [D1], programs: [P1] });
      expect(store().selectedDepartmentId).toBe('d1');
      expect(store().selectedProgramId).toBe('p1');
      expect(store().initialized).toBe(true);
    });

    it('auto-selects the department but leaves program open when it has several programs', () => {
      store().setContext({ isGlobal: false, departments: [D1], programs: [P1, P2] });
      expect(store().selectedDepartmentId).toBe('d1');
      expect(store().selectedProgramId).toBeNull();
    });

    it('selects nothing when the user has multiple departments', () => {
      store().setContext({ isGlobal: false, departments: [D1, D2], programs: [P1, P2, P3] });
      expect(store().selectedDepartmentId).toBeNull();
      expect(store().selectedProgramId).toBeNull();
    });

    it('drops a persisted department the user no longer has access to', () => {
      useHierarchyStore.setState({ selectedDepartmentId: 'd2', selectedProgramId: 'p3' });
      store().setContext({ isGlobal: false, departments: [D1, { id: 'd9', name: 'X' }], programs: [P1, P2] });
      expect(store().selectedDepartmentId).toBeNull();
      expect(store().selectedProgramId).toBeNull();
    });

    it('keeps a still-valid persisted program and derives its department', () => {
      useHierarchyStore.setState({ selectedDepartmentId: null, selectedProgramId: 'p3' });
      store().setContext({ isGlobal: false, departments: [D1, D2], programs: [P1, P2, P3] });
      expect(store().selectedDepartmentId).toBe('d2');
      expect(store().selectedProgramId).toBe('p3');
    });
  });

  describe('setSelectedDepartment', () => {
    beforeEach(() => store().setContext({ isGlobal: false, departments: [D1, D2], programs: [P1, P2, P3] }));

    it('clears a program that does not belong to the new department', () => {
      store().setSelectedProgram('p1');
      store().setSelectedDepartment('d2');
      expect(store().selectedDepartmentId).toBe('d2');
      // d2 has exactly one program → auto-selected
      expect(store().selectedProgramId).toBe('p3');
    });

    it('keeps a program that belongs to the new department', () => {
      store().setSelectedProgram('p2');
      store().setSelectedDepartment('d1');
      expect(store().selectedProgramId).toBe('p2');
    });

    it('"All departments" (null) keeps the current program valid', () => {
      store().setSelectedProgram('p2');
      store().setSelectedDepartment(null);
      expect(store().selectedDepartmentId).toBeNull();
      expect(store().selectedProgramId).toBe('p2');
    });
  });

  describe('setSelectedProgram', () => {
    beforeEach(() => store().setContext({ isGlobal: false, departments: [D1, D2], programs: [P1, P2, P3] }));

    it('also selects the parent department', () => {
      store().setSelectedProgram('p3');
      expect(store().selectedDepartmentId).toBe('d2');
    });

    it('ignores a program the user cannot access', () => {
      store().setSelectedProgram('p-unauthorised');
      expect(store().selectedProgramId).toBeNull();
    });

    it('null clears the program only', () => {
      store().setSelectedProgram('p1');
      store().setSelectedProgram(null);
      expect(store().selectedProgramId).toBeNull();
      expect(store().selectedDepartmentId).toBe('d1');
    });
  });
});
