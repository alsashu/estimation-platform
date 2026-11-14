import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useState } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { HierarchySelection } from '../../types';

vi.mock('../../services/api', () => ({
  hierarchyApi: {
    departments: vi.fn(),
    programs: vi.fn(),
    baselines: vi.fn(),
    components: vi.fn(),
    subcomponents: vi.fn(),
  },
}));

import { hierarchyApi } from '../../services/api';
import {
  HierarchySelector, EMPTY_SELECTION, applyHierarchyChange, isHierarchyComplete, toHierarchyPayload,
} from '../../components/hierarchy/HierarchySelector';
import { useHierarchyStore } from '../../store/hierarchyStore';

const api = hierarchyApi as unknown as Record<string, ReturnType<typeof vi.fn>>;

const FULL: HierarchySelection = {
  department_id: 'd1', program_id: 'p1', baseline_id: 'b1', component_id: 'c1', subcomponent_id: 's1',
};

describe('HierarchySelector pure helpers', () => {
  it('changing a parent clears every dependent level', () => {
    expect(applyHierarchyChange(FULL, 'department_id', 'd2')).toEqual({ ...EMPTY_SELECTION, department_id: 'd2' });
    expect(applyHierarchyChange(FULL, 'program_id', 'p2')).toEqual({ ...EMPTY_SELECTION, department_id: 'd1', program_id: 'p2' });
    expect(applyHierarchyChange(FULL, 'component_id', null)).toEqual({ ...FULL, component_id: '', subcomponent_id: '' });
  });

  it('re-selecting the same value keeps children', () => {
    expect(applyHierarchyChange(FULL, 'baseline_id', 'b1')).toEqual(FULL);
  });

  it('Department, Program and Baseline are mandatory; Component/Subcomponent are not', () => {
    expect(isHierarchyComplete({ ...FULL, component_id: '', subcomponent_id: '' })).toBe(true);
    expect(isHierarchyComplete({ ...FULL, baseline_id: '' })).toBe(false);
    expect(isHierarchyComplete({ ...FULL, department_id: '' })).toBe(false);
  });

  it('payload maps unselected optional levels to null', () => {
    expect(toHierarchyPayload({ ...FULL, component_id: '', subcomponent_id: '' })).toEqual({
      department_id: 'd1', program_id: 'p1', baseline_id: 'b1', component_id: null, subcomponent_id: null,
    });
  });
});

function Harness({ initial = EMPTY_SELECTION, onChange }: { initial?: HierarchySelection; onChange?: (v: HierarchySelection) => void }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <HierarchySelector value={value} onChange={v => { setValue(v); onChange?.(v); }} />
      <pre data-testid="value">{JSON.stringify(value)}</pre>
    </>
  );
}

const renderSelector = (initial?: HierarchySelection) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={qc}><Harness initial={initial} /></QueryClientProvider>);
  return userEvent.setup();
};
const current = (): HierarchySelection => JSON.parse(screen.getByTestId('value').textContent!);
const combo = (testId: string) => within(screen.getByTestId(testId)).getByRole('combobox');

describe('HierarchySelector component', () => {
  beforeEach(() => {
    useHierarchyStore.getState().reset();
    Object.values(api).forEach(fn => fn.mockReset());
    api.departments.mockResolvedValue([{ id: 'd1', name: 'Engineering' }, { id: 'd2', name: 'Finance' }]);
    api.programs.mockImplementation(async (dep: string) =>
      dep === 'd1' ? [{ id: 'p1', name: 'Apollo' }, { id: 'p2', name: 'Gemini' }] : [{ id: 'p3', name: 'Ledger' }]);
    api.baselines.mockImplementation(async (prog: string) =>
      prog === 'p1' ? [{ id: 'b1', name: 'Baseline 1', version: 'v1' }, { id: 'b2', name: 'Baseline 2' }] : [{ id: 'b3', name: 'Ledger BL' }]);
    api.components.mockResolvedValue([]);
    api.subcomponents.mockResolvedValue([]);
  });

  it('dependent pickers are disabled until their parent is chosen', async () => {
    renderSelector();
    await waitFor(() => expect(api.departments).toHaveBeenCalled());
    expect(combo('hs-program')).toHaveAttribute('aria-disabled', 'true');
    expect(combo('hs-baseline')).toHaveAttribute('aria-disabled', 'true');
    expect(api.programs).not.toHaveBeenCalled();
  });

  it('cascades Department → Program (auto-select single) → Baseline', async () => {
    const user = renderSelector();
    await user.click(combo('hs-department'));
    await user.click(await screen.findByText('Finance'));
    // Finance has exactly one program → auto-selected, which loads its baselines (also single, but baselines are not auto-picked)
    await waitFor(() => expect(current().program_id).toBe('p3'));
    expect(api.programs).toHaveBeenCalledWith('d2');
    await waitFor(() => expect(api.baselines).toHaveBeenCalledWith('p3'));
    expect(current().baseline_id).toBe('');
  });

  it('only shows programs of the selected department', async () => {
    const user = renderSelector();
    await user.click(combo('hs-department'));
    await user.click(await screen.findByText('Engineering'));
    await waitFor(() => expect(combo('hs-program')).not.toHaveAttribute('aria-disabled', 'true'));
    await user.click(combo('hs-program'));
    await screen.findByText('Apollo');
    expect(screen.getByText('Gemini')).toBeInTheDocument();
    expect(screen.queryByText('Ledger')).not.toBeInTheDocument();
  });

  it('changing department clears program and baseline', async () => {
    const user = renderSelector({ ...EMPTY_SELECTION, department_id: 'd1', program_id: 'p1', baseline_id: 'b1' });
    await screen.findByText('Baseline 1');
    await user.click(combo('hs-department'));
    await user.click(await screen.findByText('Finance'));
    await waitFor(() => expect(current().department_id).toBe('d2'));
    expect(current().baseline_id).toBe('');
    expect(current().program_id).not.toBe('p1');
  });

  it('allows proceeding without components when none exist', async () => {
    renderSelector({ ...EMPTY_SELECTION, department_id: 'd1', program_id: 'p1', baseline_id: 'b1' });
    await waitFor(() => expect(api.components).toHaveBeenCalledWith('b1'));
    await screen.findByText('No components — optional');
    expect(isHierarchyComplete(current())).toBe(true);
  });

  it('auto-selects the only authorised department', async () => {
    api.departments.mockResolvedValue([{ id: 'd1', name: 'Engineering' }]);
    renderSelector();
    await waitFor(() => expect(current().department_id).toBe('d1'));
  });

  it('drops a selected department the user is not authorised for', async () => {
    renderSelector({ ...EMPTY_SELECTION, department_id: 'd-unauth', program_id: 'px' });
    await waitFor(() => expect(current().department_id).toBe(''));
    expect(current().program_id).toBe('');
  });

  it('pre-fills from the header context', async () => {
    useHierarchyStore.setState({ selectedDepartmentId: 'd1', selectedProgramId: 'p2' });
    renderSelector();
    await waitFor(() => expect(current()).toMatchObject({ department_id: 'd1', program_id: 'p2' }));
  });
});
