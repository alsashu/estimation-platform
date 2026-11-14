import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';

vi.mock('../../services/api', () => ({ registrationsApi: { getPendingCount: vi.fn().mockResolvedValue({ count: 0 }) } }));

import { Sidebar } from '../../components/layout/Sidebar';
import { ModuleRoute, HomeRoute, MasterIndexRoute } from '../../components/auth/ModuleRoute';
import { EstimationModuleAccessField } from '../../components/access/EstimationModuleAccessField';
import { useAuthStore, type AuthUser } from '../../store/authStore';
import {
  moduleFieldState, resultingModules, validateModuleSelection, routeModule, homePathFor, type ModuleCode,
} from '../../utils/moduleAccess';

// Effective permissions as the server returns them (role permissions limited to the modules)
const SP_PERMS = ['estimation.read', 'estimation.create', 'master.read'];
const PE_PERMS = ['parametric.read', 'parametric.create', 'parametric.import', 'parametric.master.read'];
const ADMIN_PERMS = ['user.read', 'user.create', 'department.read', 'project.read', 'baseline.read'];

function login(modules: ModuleCode[], roles = ['Admin']) {
  const user: AuthUser = {
    id: 'u1', email: 'a@b', username: 'a', firstName: 'A', lastName: 'B', roles, projectIds: [], modules,
    permissions: [...ADMIN_PERMS, ...(modules.includes('SP') ? SP_PERMS : []), ...(modules.includes('PE') ? PE_PERMS : [])],
  };
  useAuthStore.getState().setAuth(user, 'at', 'rt');
}

const SP_NAV = ['Dashboard SP', 'Storypoint Estimation', 'Historical Data SP', 'Analytics SP', 'Story Points', 'Effort Estimates', 'Competency'];
const PE_NAV = ['Dashboard PE', 'Parametric Estimation', 'Historical Data PE', 'Analytics PE', 'Parametric Data'];

function renderSidebar() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={qc}><MemoryRouter><Sidebar /></MemoryRouter></QueryClientProvider>);
  return screen.getAllByRole('link').map(a => a.textContent?.trim() ?? '');
}

beforeEach(() => useAuthStore.getState().clearAuth());

// ─── Pure helpers ────────────────────────────────────────────────────────────
describe('moduleAccess helpers', () => {
  it('field state: editable / locked / blocked', () => {
    expect(moduleFieldState(['SP'], ['SP', 'PE'])).toEqual([
      { code: 'SP', canManage: true, locked: false, blocked: false },
      { code: 'PE', canManage: false, locked: true, blocked: false },
    ]);
    expect(moduleFieldState(['PE'], [])[0]).toMatchObject({ code: 'SP', blocked: true });
  });

  it('resulting modules keep what the actor cannot manage', () => {
    expect(resultingModules(['SP'], ['SP'], ['SP', 'PE'])).toEqual(['SP', 'PE']);
    expect(resultingModules(['PE'], ['SP', 'PE'], ['SP', 'PE'])).toEqual(['PE']);
  });

  it('validation: at least one, and never beyond the actor', () => {
    expect(validateModuleSelection([], ['SP', 'PE'])).toBe('Select at least one estimation module');
    expect(validateModuleSelection(['PE'], ['SP'])).toBe('You can only grant modules you have access to');
    expect(validateModuleSelection(['SP', 'PE'], ['SP', 'PE'])).toBeNull();
    expect(validateModuleSelection([], ['SP'], ['PE'])).toBeNull();          // locked PE keeps the user valid
  });

  it('maps routes to modules and picks the landing page', () => {
    expect(routeModule('/')).toBe('SP');
    expect(routeModule('/master/competency')).toBe('SP');
    expect(routeModule('/parametric-history')).toBe('PE');
    expect(routeModule('/master/parametric')).toBe('PE');
    expect(routeModule('/departments')).toBeNull();
    expect(homePathFor(['SP', 'PE'])).toBe('/');
    expect(homePathFor(['PE'])).toBe('/parametric-dashboard');
    expect(homePathFor([])).toBe('/no-module-access');
  });
});

describe('authStore module access', () => {
  it('GSA always has both modules', () => {
    login([], ['Global Super Admin']);
    expect(useAuthStore.getState().getModules()).toEqual(['SP', 'PE']);
  });
  it('setUser applies a live change from the server', () => {
    login(['SP', 'PE']);
    useAuthStore.getState().setUser({ modules: ['PE'], permissions: PE_PERMS });
    expect(useAuthStore.getState().hasModule('SP')).toBe(false);
    expect(useAuthStore.getState().hasModule('PE')).toBe(true);
  });
  it('sessions persisted before module access derive modules from permissions', () => {
    useAuthStore.getState().setAuth({ id: 'x', email: '', username: '', firstName: '', lastName: '', roles: ['User'], projectIds: [], permissions: SP_PERMS }, 'a', 'r');
    expect(useAuthStore.getState().getModules()).toEqual(['SP']);
  });
});

// ─── Navigation ──────────────────────────────────────────────────────────────
describe('Sidebar navigation by module', () => {
  it('SP-only: SP items only, no PE items', () => {
    login(['SP']);
    const links = renderSidebar();
    SP_NAV.forEach(l => expect(links).toContain(l));
    PE_NAV.forEach(l => expect(links).not.toContain(l));
  });

  it('PE-only: PE items + Organisation, no SP items', () => {
    login(['PE']);
    const links = renderSidebar();
    PE_NAV.forEach(l => expect(links).toContain(l));
    SP_NAV.forEach(l => expect(links).not.toContain(l));
    ['Departments', 'Programs', 'Baselines'].forEach(l => expect(links).toContain(l));
  });

  it('both: every SP and PE item', () => {
    login(['SP', 'PE']);
    const links = renderSidebar();
    [...SP_NAV, ...PE_NAV].forEach(l => expect(links).toContain(l));
  });

  it('no module: hides Overview / Estimation Methods / Records / Master Data groups entirely', () => {
    login([]);
    renderSidebar();
    ['Overview', 'Estimation Methods', 'Records', 'Master Data'].forEach(g => expect(screen.queryByText(g)).toBeNull());
    expect(screen.getByText('Organisation')).toBeInTheDocument();
  });

  it('hides a module even if a stale permission is still cached', () => {
    login(['SP']);
    useAuthStore.getState().setUser({ permissions: [...SP_PERMS, ...PE_PERMS], modules: ['SP'] });
    expect(renderSidebar()).not.toContain('Dashboard PE');
  });
});

// ─── Direct URL access ───────────────────────────────────────────────────────
function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route index element={<HomeRoute><div>SP dashboard</div></HomeRoute>} />
        <Route path="history" element={<ModuleRoute module="SP"><div>SP history</div></ModuleRoute>} />
        <Route path="parametric-dashboard" element={<ModuleRoute module="PE"><div>PE dashboard</div></ModuleRoute>} />
        <Route path="parametric-history" element={<ModuleRoute module="PE"><div>PE history</div></ModuleRoute>} />
        <Route path="master">
          <Route index element={<MasterIndexRoute />} />
          <Route path="story-points" element={<ModuleRoute module="SP"><div>Story points</div></ModuleRoute>} />
          <Route path="parametric" element={<ModuleRoute module="PE"><div>Parametric data</div></ModuleRoute>} />
        </Route>
        <Route path="no-module-access" element={<div>No module page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('module route guards (direct URL)', () => {
  it('SP-only user opening a PE page gets 403', () => {
    login(['SP']);
    renderAt('/parametric-history');
    expect(screen.getByTestId('module-access-denied').textContent).toMatch(/403.*Parametric Estimation/);
    expect(screen.queryByText('PE history')).toBeNull();
  });

  it('PE-only user opening an SP page gets 403', () => {
    login(['PE']);
    renderAt('/history');
    expect(screen.getByTestId('module-access-denied').textContent).toMatch(/Story Point Estimation/);
  });

  it('authorised pages render', () => {
    login(['SP', 'PE']);
    renderAt('/parametric-history');
    expect(screen.getByText('PE history')).toBeInTheDocument();
  });

  it('PE-only user landing on / goes to Dashboard PE; /master goes to Parametric Data', () => {
    login(['PE']);
    renderAt('/');
    expect(screen.getByText('PE dashboard')).toBeInTheDocument();
  });

  it('/master picks the first allowed master-data page', () => {
    login(['PE']);
    renderAt('/master');
    expect(screen.getByText('Parametric data')).toBeInTheDocument();
  });

  it('a user without modules lands on the no-access page', () => {
    login([]);
    renderAt('/');
    expect(screen.getByText('No module page')).toBeInTheDocument();
  });
});

// ─── Form field ──────────────────────────────────────────────────────────────
function Field(props: { actor: ModuleCode[]; target?: ModuleCode[]; initial?: ModuleCode[]; gsa?: boolean; onValue?: (v: ModuleCode[]) => void }) {
  const [v, setV] = useState<ModuleCode[]>(props.initial ?? []);
  return <EstimationModuleAccessField value={v} onChange={m => { setV(m); props.onValue?.(m); }} actorModules={props.actor}
    targetModules={props.target} targetIsGlobalSuperAdmin={props.gsa} showErrors />;
}
const box = (label: RegExp) => screen.getByRole('checkbox', { name: label });

describe('EstimationModuleAccessField', () => {
  it('shows both options, unticked, with the required marker and help text', () => {
    render(<Field actor={['SP', 'PE']} />);
    expect(screen.getByText(/Estimation Module Access/i)).toBeInTheDocument();
    expect(box(/Story Point Estimation/)).not.toBeChecked();
    expect(box(/Parametric Estimation/)).not.toBeChecked();
    expect(screen.getByText('Select one or both estimation modules.')).toBeInTheDocument();
    expect(screen.getByRole('alert').textContent).toBe('Select at least one estimation module');
  });

  it('both modules can be selected together', () => {
    const onValue = vi.fn();
    render(<Field actor={['SP', 'PE']} onValue={onValue} />);
    fireEvent.click(box(/Story Point Estimation/));
    fireEvent.click(box(/Parametric Estimation/));
    expect(onValue).toHaveBeenLastCalledWith(['SP', 'PE']);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('SP-only admin cannot tick PE', () => {
    render(<Field actor={['SP']} />);
    expect(box(/Parametric Estimation/)).toBeDisabled();
    expect(screen.getByText(/Outside your own module access/)).toBeInTheDocument();
    expect(box(/Story Point Estimation/)).toBeEnabled();
  });

  it('editing: shows previously assigned modules; ones the actor cannot manage stay ticked + locked', () => {
    render(<Field actor={['SP']} target={['SP', 'PE']} initial={['SP']} />);
    expect(box(/Story Point Estimation/)).toBeChecked();
    expect(box(/Parametric Estimation/)).toBeChecked();
    expect(box(/Parametric Estimation/)).toBeDisabled();
  });

  it('Global Super Admin target: both ticked and locked', () => {
    render(<Field actor={['SP', 'PE']} gsa />);
    const field = screen.getByTestId('module-access-field');
    within(field).getAllByRole('checkbox').forEach(c => { expect(c).toBeChecked(); expect(c).toBeDisabled(); });
  });
});
