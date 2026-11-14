import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('../../services/api', () => ({ parametricEstimationsApi: { recordActuals: vi.fn() } }));

import { parametricEstimationsApi } from '../../services/api';
import {
  ParametricActualsPanel, previewActualMetrics, validateActualDays, accuracyTone, describeVariance,
} from '../../modules/parametric-estimation/ParametricActualsPanel';
import { useAuthStore } from '../../store/authStore';
import type { ParametricEstimation } from '../../types';

const recordActuals = parametricEstimationsApi.recordActuals as unknown as ReturnType<typeof vi.fn>;

const baseUser = { email: 'a@b', username: 'u', firstName: 'Y', lastName: 'H', roles: ['User'], projectIds: [] as string[] };
const login = (id: string, permissions: string[]) => useAuthStore.getState().setAuth({ ...baseUser, id, permissions }, 'at', 'rt');

const openRow = {
  id: 't1', task_title: 'API', final_estimation: 10, created_at: '2026-11-01T10:00:00Z',
  actual_days: null, accuracy_percent: null, variance_days: null, deviation_percent: null, actual_notes: null,
} as unknown as ParametricEstimation;
const doneRow = {
  ...openRow, actual_days: 12, variance_days: -2, accuracy_percent: 80, deviation_percent: 20, status: 'completed',
  actual_notes: 'Integration took longer', completed_at: '2026-11-10T00:00:00Z',
  actuals_recorded_by: 'u1', actuals_recorded_by_name: 'Yash HB', actuals_recorded_at: '2026-11-10T09:00:00Z',
} as unknown as ParametricEstimation;

const renderPanel = (row: ParametricEstimation, onSaved = vi.fn()) => {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  render(<QueryClientProvider client={qc}><ParametricActualsPanel row={row} onSaved={onSaved} /></QueryClientProvider>);
  return { user: userEvent.setup(), onSaved };
};

describe('PE actuals helpers', () => {
  it('previewActualMetrics: Variance = Estimated − Actual; accuracy & deviation', () => {
    expect(previewActualMetrics(10, 8)).toEqual({ variance_days: 2, accuracy_percent: 80, deviation_percent: 20 });
    expect(previewActualMetrics(10, 12)).toEqual({ variance_days: -2, accuracy_percent: 80, deviation_percent: 20 });
    expect(previewActualMetrics(10, 35)).toEqual({ variance_days: -25, accuracy_percent: 0, deviation_percent: 250 });
  });
  it('previewActualMetrics: zero / missing estimate is safe', () => {
    expect(previewActualMetrics(0, 4)).toEqual({ variance_days: -4, accuracy_percent: null, deviation_percent: null });
    expect(previewActualMetrics(null, 4)?.accuracy_percent).toBeNull();
    expect(previewActualMetrics(10, 0)).toBeNull();
  });
  it('validateActualDays mirrors the API rules', () => {
    expect(validateActualDays('')).toMatch(/Enter/);
    expect(validateActualDays('abc')).toMatch(/number/);
    expect(validateActualDays('0')).toMatch(/greater than 0/);
    expect(validateActualDays('-1')).toMatch(/greater than 0/);
    expect(validateActualDays('1.234')).toMatch(/2 decimal/);
    expect(validateActualDays('100001')).toMatch(/100,000/);
    expect(validateActualDays('0.15')).toBeNull();
    expect(validateActualDays('12.5')).toBeNull();
  });
  it('accuracyTone and describeVariance', () => {
    expect([accuracyTone(90), accuracyTone(75), accuracyTone(40), accuracyTone(null)]).toEqual(['success', 'warning', 'danger', 'neutral']);
    expect(describeVariance(2)).toBe('+2.00 PD under estimate');
    expect(describeVariance(-1.5)).toBe('−1.50 PD over estimate');
    expect(describeVariance(0)).toBe('On estimate');
  });
});

describe('ParametricActualsPanel', () => {
  beforeEach(() => { recordActuals.mockReset(); useAuthStore.getState().clearAuth(); });

  it('before actuals: shows Estimated, "Not Recorded", "Not Available" and a Save Actual form', () => {
    login('u1', ['parametric.create']);
    renderPanel(openRow);
    expect(screen.getByText('Estimated PersonDays')).toBeInTheDocument();
    expect(screen.getByText('10.00 PD')).toBeInTheDocument();
    expect(screen.getByText('Not Recorded')).toBeInTheDocument();
    expect(screen.getByText('Not Available')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save Actual' })).toBeInTheDocument();
    expect(screen.queryByText('Variance (PD)')).not.toBeInTheDocument();
  });

  it('validates input and does not submit invalid values', async () => {
    login('u1', ['parametric.create']);
    const { user } = renderPanel(openRow);
    await user.type(screen.getByLabelText('Actual effort in PersonDays'), '0');
    await user.click(screen.getByRole('button', { name: 'Save Actual' }));
    expect(screen.getByRole('alert')).toHaveTextContent('greater than 0');
    expect(recordActuals).not.toHaveBeenCalled();
  });

  it('shows a live preview and submits PD, notes and completion date', async () => {
    login('u1', ['parametric.create']);
    recordActuals.mockResolvedValue({ ...doneRow });
    const { user, onSaved } = renderPanel(openRow);
    await user.type(screen.getByLabelText('Actual effort in PersonDays'), '8');
    expect(screen.getByTestId('pe-actuals-preview')).toHaveTextContent('80.0% accuracy');
    expect(screen.getByTestId('pe-actuals-preview')).toHaveTextContent('+2.00 PD under estimate');
    await user.type(screen.getByLabelText('Notes (optional)'), '  quick win ');
    await user.click(screen.getByRole('button', { name: 'Save Actual' }));
    await waitFor(() => expect(recordActuals).toHaveBeenCalled());
    const [id, body] = recordActuals.mock.calls[0];
    expect(id).toBe('t1');
    expect(body).toMatchObject({ actual_days: 8, notes: 'quick win' });
    expect(body.completed_at).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
  });

  it('after actuals: shows all metrics, notes and submission details', () => {
    login('u9', ['parametric.read']);
    renderPanel(doneRow);
    expect(screen.getByText('12.00 PD')).toBeInTheDocument();
    expect(screen.getByText('80.0%')).toBeInTheDocument();
    expect(screen.getByText('-2.00')).toBeInTheDocument();
    expect(screen.getByText('−2.00 PD over estimate')).toBeInTheDocument();
    expect(screen.getByText('20.0%')).toBeInTheDocument();
    expect(screen.getByText('Integration took longer')).toBeInTheDocument();
    expect(screen.getByTestId('pe-actuals-audit')).toHaveTextContent('Recorded by Yash HB');
    // read-only user: no form, no correction
    expect(screen.queryByRole('button', { name: /Save|Correct/ })).not.toBeInTheDocument();
  });

  it('the original recorder can correct; the form is prefilled and saved as a correction', async () => {
    login('u1', ['parametric.create']);
    recordActuals.mockResolvedValue({ ...doneRow, actual_days: 11 });
    const { user } = renderPanel(doneRow);
    await user.click(screen.getByRole('button', { name: 'Correct actuals' }));
    const input = screen.getByLabelText('Actual effort in PersonDays') as HTMLInputElement;
    expect(input.value).toBe('12');
    await user.clear(input);
    await user.type(input, '11');
    await user.click(screen.getByRole('button', { name: 'Save correction' }));
    await waitFor(() => expect(recordActuals).toHaveBeenCalledWith('t1', expect.objectContaining({ actual_days: 11, notes: 'Integration took longer' })));
  });

  it('another user without the correction permission cannot correct', () => {
    login('u2', ['parametric.create']);
    renderPanel(doneRow);
    expect(screen.queryByRole('button', { name: 'Correct actuals' })).not.toBeInTheDocument();
    expect(screen.getByText(/Only the user who recorded/)).toBeInTheDocument();
  });

  it('a user with parametric.actuals.correct can correct anyone\'s actuals', () => {
    login('admin', ['parametric.create', 'parametric.actuals.correct']);
    renderPanel(doneRow);
    expect(screen.getByRole('button', { name: 'Correct actuals' })).toBeInTheDocument();
  });

  it('users without parametric.create cannot record', () => {
    login('u3', ['parametric.read']);
    renderPanel(openRow);
    expect(screen.queryByRole('button', { name: 'Save Actual' })).not.toBeInTheDocument();
    expect(screen.getByText(/do not have permission/)).toBeInTheDocument();
  });
});

describe('fmt1', () => {
  it('rounds half-up from stored 2-dp values, matching full-precision aggregates', async () => {
    const { fmt1 } = await import('../../modules/parametric-estimation/ParametricActualsPanel');
    expect(fmt1(85.35)).toBe('85.4');
    expect(fmt1('14.65')).toBe('14.7');
    expect(fmt1(80)).toBe('80.0');
    expect(fmt1(0.04)).toBe('0.0');
  });
});
