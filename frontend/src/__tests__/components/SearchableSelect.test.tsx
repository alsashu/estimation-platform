import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SearchableSelect } from '../../components/ui/SearchableSelect';

const OPTIONS = [
  { id: 'a', label: 'Apollo', badge: 'APL' },
  { id: 'b', label: 'Gemini', description: 'Orbital program' },
  { id: 'c', label: 'Mercury' },
];

const setup = (props: Partial<React.ComponentProps<typeof SearchableSelect>> = {}) => {
  const onChange = vi.fn();
  render(<SearchableSelect label="Program" options={OPTIONS} value={null} onChange={onChange} {...props} />);
  return { onChange, user: userEvent.setup() };
};

describe('SearchableSelect', () => {
  it('opens and lists all options', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('combobox', { name: 'Program' }));
    expect(screen.getAllByRole('option')).toHaveLength(3);
  });

  it('filters options by label, description and badge', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('combobox'));
    const search = screen.getByLabelText('Search Program');
    await user.type(search, 'gem');
    expect(screen.getAllByRole('option').map(o => o.textContent)).toEqual([expect.stringContaining('Gemini')]);
    await user.clear(search);
    await user.type(search, 'orbital');
    expect(screen.getByText('Gemini')).toBeInTheDocument();
    await user.clear(search);
    await user.type(search, 'apl');
    expect(screen.getAllByRole('option')).toHaveLength(1);
  });

  it('shows the no-results message', async () => {
    const { user } = setup({ emptyMessage: 'Nothing here' });
    await user.click(screen.getByRole('combobox'));
    await user.type(screen.getByLabelText('Search Program'), 'zzz');
    expect(screen.getByText('Nothing here')).toBeInTheDocument();
  });

  it('calls onChange with the chosen id', async () => {
    const { user, onChange } = setup();
    await user.click(screen.getByRole('combobox'));
    await user.click(screen.getByText('Mercury'));
    expect(onChange).toHaveBeenCalledWith('c');
  });

  it('supports keyboard selection', async () => {
    const { user, onChange } = setup();
    screen.getByRole('combobox').focus();
    await user.keyboard('{ArrowDown}{ArrowDown}{Enter}');
    expect(onChange).toHaveBeenCalledWith('b');
  });

  it('clear button resets to null', async () => {
    const { user, onChange } = setup({ value: 'a' });
    expect(screen.getByText('Apollo')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Clear Program' }));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('"All" entry maps to null', async () => {
    const { user, onChange } = setup({ value: 'a', allOptionLabel: 'All programs' });
    await user.click(screen.getByRole('combobox'));
    await user.click(screen.getByText('All programs'));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('shows a loading indicator', async () => {
    const { user } = setup({ options: [], loading: true });
    expect(screen.getByLabelText('Loading')).toBeInTheDocument();
    await user.click(screen.getByRole('combobox'));
    expect(screen.getByText('Loading…')).toBeInTheDocument();
  });

  it('does not open when disabled and shows the hint', async () => {
    const { user } = setup({ disabled: true, disabledHint: 'Select a department first' });
    expect(screen.getByText('Select a department first')).toBeInTheDocument();
    await user.click(screen.getByRole('combobox'));
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });
});
