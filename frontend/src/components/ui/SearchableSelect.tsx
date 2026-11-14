import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Loader2, Search, X } from 'lucide-react';
import { cn } from '../../utils/formatters';

export interface SearchableOption {
  id: string;
  label: string;
  description?: string | null;
  badge?: string | null;
}

export interface SearchableSelectProps {
  options: SearchableOption[];
  value: string | null;
  onChange: (id: string | null) => void;
  label?: string;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  loading?: boolean;
  /** Shown when the list is empty (or nothing matches the search). */
  emptyMessage?: string;
  /** Hint shown when disabled because a parent is not chosen yet. */
  disabledHint?: string;
  /** Adds a selectable "All …" entry that maps to `null`. */
  allOptionLabel?: string;
  clearable?: boolean;
  error?: string;
  size?: 'sm' | 'md';
  icon?: React.ReactNode;
  className?: string;
  /** Accessible name when no visible label is rendered (e.g. in the header). */
  ariaLabel?: string;
  testId?: string;
}

/**
 * Single-value combobox with type-to-search, loading indicator, clear button, "no results" message and
 * keyboard support (↑/↓/Enter/Escape). Used for every Department / Program / Baseline / Component /
 * Subcomponent picker so behaviour is identical across SP and PE.
 */
export function SearchableSelect({
  options, value, onChange, label, placeholder = 'Select…', required, disabled, loading,
  emptyMessage = 'No results found', disabledHint, allOptionLabel, clearable = true, error,
  size = 'md', icon, className, ariaLabel, testId,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const listId = useId();

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setQuery(''); }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const entries = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? options.filter(o => o.label.toLowerCase().includes(q) || (o.description ?? '').toLowerCase().includes(q) || (o.badge ?? '').toLowerCase().includes(q))
      : options;
    const all: (SearchableOption & { isAll?: boolean })[] = allOptionLabel && !q
      ? [{ id: '__all__', label: allOptionLabel, isAll: true }, ...filtered]
      : filtered;
    return all;
  }, [options, query, allOptionLabel]);

  useEffect(() => { setActive(0); }, [query, open]);

  const selected = value ? options.find(o => o.id === value) : undefined;
  const display = selected?.label ?? (value === null && allOptionLabel ? allOptionLabel : '');

  const choose = (opt: SearchableOption & { isAll?: boolean }) => {
    onChange(opt.isAll ? null : opt.id);
    setOpen(false);
    setQuery('');
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter')) { setOpen(true); e.preventDefault(); return; }
    if (!open) return;
    if (e.key === 'ArrowDown') { setActive(a => Math.min(a + 1, entries.length - 1)); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { setActive(a => Math.max(a - 1, 0)); e.preventDefault(); }
    else if (e.key === 'Enter') { if (entries[active]) choose(entries[active]); e.preventDefault(); }
    else if (e.key === 'Escape') { setOpen(false); setQuery(''); }
  };

  const h = size === 'sm' ? 'h-8 text-xs' : 'h-[42px] text-sm';

  return (
    <div className={cn('relative min-w-0', className)} ref={ref} data-testid={testId}>
      {label && (
        <label className="text-sm font-medium text-carbon dark:text-lgrayblue block mb-1">
          {label}{required && <span className="text-vibrant"> *</span>}
        </label>
      )}
      <div
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={ariaLabel ?? label}
        aria-disabled={disabled}
        tabIndex={disabled ? -1 : 0}
        onKeyDown={onKeyDown}
        onClick={() => !disabled && setOpen(o => !o)}
        className={cn(
          'flex items-center gap-2 w-full px-3 rounded-lg border bg-white dark:bg-carbon-800 transition-colors outline-none',
          h,
          disabled ? 'opacity-60 cursor-not-allowed border-lgrayblue/40 dark:border-slate-700' : 'cursor-pointer hover:border-carbon/40 dark:hover:border-slate-500 focus:ring-2 focus:ring-carbon/20',
          error ? 'border-vibrant' : 'border-lgrayblue dark:border-slate-600',
          open && 'ring-2 ring-carbon/20'
        )}
      >
        {icon && <span className="text-coolslate flex-shrink-0">{icon}</span>}
        <span title={display || undefined} className={cn('flex-1 min-w-0 truncate', display ? 'text-carbon dark:text-white font-medium' : 'text-coolslate/80')}>
          {display || (disabled && disabledHint ? disabledHint : placeholder)}
        </span>
        {/* The name matters more than the code: only show the badge on the trigger when there is room. */}
        {selected?.badge && <span className="hidden 2xl:inline text-[10px] font-mono px-1.5 py-0.5 bg-lgrayblue/40 dark:bg-slate-600 rounded text-coolslate flex-shrink-0">{selected.badge}</span>}
        {loading && <Loader2 size={14} className="animate-spin text-coolslate flex-shrink-0" aria-label="Loading" />}
        {clearable && !disabled && value && (
          <button type="button" aria-label={`Clear ${label ?? ariaLabel ?? 'selection'}`}
            onClick={(e) => { e.stopPropagation(); onChange(null); }}
            className="text-coolslate hover:text-vibrant flex-shrink-0">
            <X size={13} />
          </button>
        )}
        <ChevronDown size={14} className={cn('text-coolslate flex-shrink-0 transition-transform', open && 'rotate-180')} />
      </div>
      {error && <p className="text-xs text-vibrant mt-1">{error}</p>}

      {open && !disabled && (
        <div className="absolute z-50 mt-1 min-w-full w-max max-w-[22rem] bg-white dark:bg-carbon-700 rounded-xl border border-lgrayblue/30 dark:border-slate-600 shadow-modal overflow-hidden">
          <div className="p-2 border-b border-lgrayblue/20 dark:border-slate-700">
            <div className="flex items-center gap-2 px-2 py-1.5 bg-lgrayblue/20 dark:bg-slate-800 rounded-lg">
              <Search size={13} className="text-coolslate flex-shrink-0" />
              <input
                autoFocus
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={onKeyDown}
                onClick={e => e.stopPropagation()}
                placeholder="Search…"
                aria-label={`Search ${label ?? ariaLabel ?? ''}`.trim()}
                className="flex-1 text-sm bg-transparent text-carbon dark:text-white placeholder:text-coolslate/70 outline-none min-w-0"
              />
            </div>
          </div>
          <ul id={listId} role="listbox" className="max-h-60 overflow-y-auto py-1">
            {loading && entries.length === 0 ? (
              <li className="flex items-center justify-center gap-2 text-xs text-coolslate py-4"><Loader2 size={13} className="animate-spin" /> Loading…</li>
            ) : entries.length === 0 ? (
              <li className="text-xs text-coolslate text-center py-4 px-3">{emptyMessage}</li>
            ) : entries.map((opt, idx) => {
              const isSel = opt.isAll ? value === null : opt.id === value;
              return (
                <li key={opt.id} role="option" aria-selected={isSel}
                  onMouseEnter={() => setActive(idx)}
                  onClick={(e) => { e.stopPropagation(); choose(opt); }}
                  className={cn('flex items-center gap-2.5 px-3 py-2 cursor-pointer text-sm',
                    idx === active ? 'bg-lgrayblue/30 dark:bg-slate-600/50' : '',
                    opt.isAll && 'border-b border-lgrayblue/20 dark:border-slate-700')}>
                  <span className="w-3.5 flex-shrink-0">{isSel && <Check size={13} className="text-greenline" />}</span>
                  <div className="min-w-0 flex-1">
                    <p className={cn('truncate text-carbon dark:text-white', isSel && 'font-semibold')}>{opt.label}</p>
                    {opt.description && <p className="text-[11px] text-coolslate truncate">{opt.description}</p>}
                  </div>
                  {opt.badge && <span className="text-[10px] font-mono text-coolslate flex-shrink-0">{opt.badge}</span>}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
