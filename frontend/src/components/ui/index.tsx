import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, CheckCircle, AlertCircle, Info, AlertTriangle, Loader2, Search, ChevronUp, ChevronDown } from 'lucide-react';
import { cn } from '../../utils/formatters';

// ─── Button ───────────────────────────────────────────────────────────────────
type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline' | 'success';
type ButtonSize    = 'xs' | 'sm' | 'md' | 'lg';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: React.ReactNode;
  iconRight?: React.ReactNode;
}

const btnVariants: Record<ButtonVariant, string> = {
  primary:   'bg-carbon text-white hover:bg-carbon-700 active:bg-carbon-800 shadow-sm',
  secondary: 'bg-lgrayblue dark:bg-slate-700 text-carbon dark:text-white hover:bg-lgrayblue/70 dark:hover:bg-slate-600',
  danger:    'bg-vibrant text-white hover:bg-vibrant-600 active:bg-vibrant-700 shadow-sm',
  ghost:     'text-carbon dark:text-lgrayblue hover:bg-carbon/5 dark:hover:bg-white/5',
  outline:   'border border-lgrayblue dark:border-slate-600 text-carbon dark:text-lgrayblue hover:bg-lgrayblue/30 dark:hover:bg-slate-700/50',
  success:   'bg-greenline text-white hover:bg-greenline-600 shadow-sm',
};

const btnSizes: Record<ButtonSize, string> = {
  xs: 'text-xs px-2.5 py-1.5 gap-1.5',
  sm: 'text-sm px-3 py-2 gap-2',
  md: 'text-sm px-4 py-2.5 gap-2',
  lg: 'text-base px-5 py-3 gap-2.5',
};

export function Button({ variant = 'primary', size = 'md', loading, icon, iconRight, children, className, disabled, ...props }: ButtonProps) {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center rounded-lg font-medium transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-carbon/30 disabled:opacity-50 disabled:cursor-not-allowed',
        btnVariants[variant], btnSizes[size], className
      )}
    >
      {loading ? <Loader2 size={14} className="animate-spin" /> : icon}
      {children}
      {!loading && iconRight}
    </button>
  );
}

// ─── Card ─────────────────────────────────────────────────────────────────────
interface CardProps { children: React.ReactNode; className?: string; hover?: boolean; onClick?: () => void; padding?: string; }

export function Card({ children, className, hover, onClick, padding = 'p-5' }: CardProps) {
  return (
    <div
      onClick={onClick}
      className={cn(
        'bg-white dark:bg-carbon-700/60 rounded-xl shadow-card border border-lgrayblue/30 dark:border-slate-700/50 transition-all duration-200',
        hover && 'cursor-pointer hover:shadow-card-hover hover:-translate-y-0.5',
        padding, className
      )}
    >
      {children}
    </div>
  );
}

// ─── Badge ────────────────────────────────────────────────────────────────────
type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'info' | 'neutral';

const badgeVariants: Record<BadgeVariant, string> = {
  default: 'bg-carbon/10 text-carbon dark:bg-carbon-200/10 dark:text-lgrayblue',
  success: 'bg-greenline/10 text-greenline-600 dark:text-greenline border border-greenline/20',
  warning: 'bg-gold/10 text-gold-600 dark:text-mutedgold border border-gold/20',
  danger:  'bg-vibrant/10 text-vibrant dark:text-softred border border-vibrant/20',
  info:    'bg-carbon/10 text-carbon dark:bg-lgrayblue/10 dark:text-lgrayblue border border-carbon/10',
  neutral: 'bg-lgrayblue/40 text-coolslate dark:bg-slate-700 dark:text-lgrayblue',
};

export function Badge({ children, variant = 'default', className }: { children: React.ReactNode; variant?: BadgeVariant; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold tracking-wide', badgeVariants[variant], className)}>
      {children}
    </span>
  );
}

// ─── Input ────────────────────────────────────────────────────────────────────
interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  icon?: React.ReactNode;
  hint?: string;
}

export function Input({ label, error, icon, hint, className, id, ...props }: InputProps) {
  const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');
  return (
    <div className="flex flex-col gap-1">
      {label && <label htmlFor={inputId} className="text-sm font-medium text-carbon dark:text-lgrayblue">{label}</label>}
      <div className="relative">
        {icon && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-coolslate">{icon}</span>}
        <input
          id={inputId}
          {...props}
          className={cn(
            'w-full rounded-lg border text-sm transition-colors duration-150 bg-white dark:bg-carbon-800 text-carbon dark:text-white placeholder-coolslate focus:outline-none focus:ring-2',
            error ? 'border-vibrant focus:ring-vibrant/30' : 'border-lgrayblue dark:border-slate-600 focus:border-carbon dark:focus:border-lgrayblue focus:ring-carbon/20',
            icon ? 'pl-9 pr-3 py-2.5' : 'px-3 py-2.5',
            className
          )}
        />
      </div>
      {hint && !error && <p className="text-xs text-coolslate">{hint}</p>}
      {error && <p className="text-xs text-vibrant flex items-center gap-1"><AlertCircle size={12}/>{error}</p>}
    </div>
  );
}

// ─── Select ───────────────────────────────────────────────────────────────────
interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options: { value: string; label: string }[];
  placeholder?: string;
}

export function Select({ label, error, options, placeholder, className, id, ...props }: SelectProps) {
  const selectId = id || label?.toLowerCase().replace(/\s+/g, '-');
  return (
    <div className="flex flex-col gap-1">
      {label && <label htmlFor={selectId} className="text-sm font-medium text-carbon dark:text-lgrayblue">{label}</label>}
      <select
        id={selectId}
        {...props}
        className={cn(
          'w-full rounded-lg border text-sm bg-white dark:bg-carbon-800 text-carbon dark:text-white transition-colors duration-150 px-3 py-2.5 focus:outline-none focus:ring-2',
          error ? 'border-vibrant focus:ring-vibrant/30' : 'border-lgrayblue dark:border-slate-600 focus:border-carbon dark:focus:border-lgrayblue focus:ring-carbon/20',
          className
        )}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {error && <p className="text-xs text-vibrant flex items-center gap-1"><AlertCircle size={12}/>{error}</p>}
    </div>
  );
}

// ─── Textarea ─────────────────────────────────────────────────────────────────
interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string; error?: string;
}

export function Textarea({ label, error, className, id, ...props }: TextareaProps) {
  const aId = id || label?.toLowerCase().replace(/\s+/g, '-');
  return (
    <div className="flex flex-col gap-1">
      {label && <label htmlFor={aId} className="text-sm font-medium text-carbon dark:text-lgrayblue">{label}</label>}
      <textarea
        id={aId}
        {...props}
        className={cn(
          'w-full rounded-lg border text-sm bg-white dark:bg-carbon-800 text-carbon dark:text-white transition-colors duration-150 px-3 py-2.5 focus:outline-none focus:ring-2 resize-none',
          error ? 'border-vibrant focus:ring-vibrant/30' : 'border-lgrayblue dark:border-slate-600 focus:border-carbon dark:focus:border-lgrayblue focus:ring-carbon/20',
          className
        )}
      />
      {error && <p className="text-xs text-vibrant flex items-center gap-1"><AlertCircle size={12}/>{error}</p>}
    </div>
  );
}

// ─── Modal ────────────────────────────────────────────────────────────────────
interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  footer?: React.ReactNode;
}

const modalSizes = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-lg', xl: 'max-w-2xl' };

export function Modal({ isOpen, onClose, title, children, size = 'md', footer }: ModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 bg-carbon/60 backdrop-blur-sm" onClick={onClose} />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={{ duration: 0.2 }}
            className={cn('relative bg-white dark:bg-carbon-700 rounded-2xl shadow-modal w-full overflow-hidden', modalSizes[size])}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-lgrayblue/30 dark:border-slate-700">
              <h3 className="font-display font-semibold text-carbon dark:text-white">{title}</h3>
              <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-lgrayblue/40 dark:hover:bg-slate-700 text-coolslate transition-colors">
                <X size={18} />
              </button>
            </div>
            <div className="px-6 py-5">{children}</div>
            {footer && <div className="px-6 py-4 border-t border-lgrayblue/30 dark:border-slate-700 flex justify-end gap-3">{footer}</div>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

// ─── Drawer ───────────────────────────────────────────────────────────────────
interface DrawerProps {
  isOpen: boolean; onClose: () => void; title: string;
  children: React.ReactNode; subtitle?: string;
}

export function Drawer({ isOpen, onClose, title, subtitle, children }: DrawerProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 bg-carbon/50 backdrop-blur-sm" onClick={onClose} />
          <motion.div
            initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="relative w-full max-w-lg bg-white dark:bg-carbon-700 shadow-modal flex flex-col h-full overflow-hidden"
          >
            <div className="flex items-start justify-between px-6 py-4 border-b border-lgrayblue/30 dark:border-slate-700">
              <div>
                <h3 className="font-display font-semibold text-carbon dark:text-white">{title}</h3>
                {subtitle && <p className="text-sm text-coolslate mt-0.5">{subtitle}</p>}
              </div>
              <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-lgrayblue/40 dark:hover:bg-slate-700 text-coolslate transition-colors mt-0.5">
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

// ─── Stat Card ────────────────────────────────────────────────────────────────
interface StatCardProps {
  label: string; value: string | number; icon: React.ReactNode;
  trend?: { value: string; up: boolean }; color?: string; loading?: boolean;
}

export function StatCard({ label, value, icon, trend, color = 'bg-carbon', loading }: StatCardProps) {
  return (
    <Card className="relative overflow-hidden">
      {loading ? (
        <div className="space-y-3 animate-pulse">
          <div className="h-4 bg-lgrayblue/40 rounded w-24" />
          <div className="h-8 bg-lgrayblue/40 rounded w-32" />
        </div>
      ) : (
        <>
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-coolslate">{label}</p>
              <p className="text-2xl font-display font-bold text-carbon dark:text-white mt-1">{value}</p>
              {trend && (
                <p className={cn('text-xs font-medium mt-2 flex items-center gap-1', trend.up ? 'text-greenline' : 'text-vibrant')}>
                  {trend.up ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                  {trend.value}
                </p>
              )}
            </div>
            <div className={cn('p-3 rounded-xl text-white', color)}>{icon}</div>
          </div>
        </>
      )}
    </Card>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────
export function EmptyState({ icon, title, message, action }: { icon: React.ReactNode; title: string; message?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="p-4 bg-lgrayblue/20 dark:bg-slate-700/30 rounded-2xl text-coolslate mb-4">{icon}</div>
      <h3 className="text-base font-semibold text-carbon dark:text-white">{title}</h3>
      {message && <p className="text-sm text-coolslate mt-1 max-w-sm">{message}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

// ─── Loading Skeleton ─────────────────────────────────────────────────────────
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse bg-lgrayblue/40 dark:bg-slate-700/50 rounded', className)} />;
}

// ─── Toast ────────────────────────────────────────────────────────────────────
export function ToastContainer({ toasts, onRemove }: { toasts: { id: string; type: string; title: string; message?: string }[]; onRemove: (id: string) => void }) {
  const icons = { success: <CheckCircle size={16} />, error: <AlertCircle size={16} />, warning: <AlertTriangle size={16} />, info: <Info size={16} /> };
  const colors = { success: 'border-l-greenline bg-greenline/5', error: 'border-l-vibrant bg-vibrant/5', warning: 'border-l-gold bg-gold/5', info: 'border-l-carbon bg-carbon/5 dark:border-l-lgrayblue' };
  const textColors = { success: 'text-greenline', error: 'text-vibrant', warning: 'text-gold', info: 'text-carbon dark:text-lgrayblue' };

  return (
    <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-2 max-w-sm w-full pointer-events-none">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div key={t.id} initial={{ opacity: 0, x: 48, scale: 0.95 }} animate={{ opacity: 1, x: 0, scale: 1 }} exit={{ opacity: 0, x: 48, scale: 0.95 }}
            className={cn('pointer-events-auto flex items-start gap-3 p-4 bg-white dark:bg-carbon-700 border border-lgrayblue/30 dark:border-slate-600 rounded-xl shadow-modal border-l-4', colors[t.type as keyof typeof colors])}
          >
            <span className={cn('mt-0.5', textColors[t.type as keyof typeof textColors])}>{icons[t.type as keyof typeof icons]}</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-carbon dark:text-white">{t.title}</p>
              {t.message && <p className="text-xs text-coolslate mt-0.5">{t.message}</p>}
            </div>
            <button onClick={() => onRemove(t.id)} className="text-coolslate hover:text-carbon dark:hover:text-white transition-colors">
              <X size={14} />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

// ─── Search Input ─────────────────────────────────────────────────────────────
export function SearchInput({ value, onChange, placeholder = 'Search…' }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="relative">
      <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-coolslate" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-lgrayblue dark:border-slate-600 bg-white dark:bg-carbon-800 text-sm text-carbon dark:text-white placeholder-coolslate focus:outline-none focus:ring-2 focus:ring-carbon/20 focus:border-carbon dark:focus:border-lgrayblue transition-colors"
      />
    </div>
  );
}

// ─── Progress Bar ─────────────────────────────────────────────────────────────
export function ProgressBar({ value, max = 100, color = 'bg-carbon', size = 'md' }: { value: number; max?: number; color?: string; size?: 'sm' | 'md' }) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div className={cn('w-full bg-lgrayblue/40 dark:bg-slate-700 rounded-full overflow-hidden', size === 'sm' ? 'h-1.5' : 'h-2.5')}>
      <div className={cn('h-full rounded-full transition-all duration-500', color)} style={{ width: `${pct}%` }} />
    </div>
  );
}

// ─── Step Indicator ───────────────────────────────────────────────────────────
export function StepIndicator({ steps, current }: { steps: string[]; current: number }) {
  return (
    <div className="flex items-center gap-0">
      {steps.map((step, i) => (
        <React.Fragment key={step}>
          <div className="flex flex-col items-center">
            <div className={cn(
              'w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300',
              i < current ? 'bg-greenline text-white' : i === current ? 'bg-carbon text-white ring-4 ring-carbon/20' : 'bg-lgrayblue/40 dark:bg-slate-700 text-coolslate'
            )}>
              {i < current ? <CheckCircle size={14} /> : i + 1}
            </div>
            <span className={cn('text-xs mt-1 font-medium whitespace-nowrap', i === current ? 'text-carbon dark:text-white' : 'text-coolslate')}>{step}</span>
          </div>
          {i < steps.length - 1 && (
            <div className={cn('flex-1 h-0.5 mx-2 mb-4 transition-all duration-300 min-w-8', i < current ? 'bg-greenline' : 'bg-lgrayblue/40 dark:bg-slate-700')} />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

// ─── Confirm Dialog ───────────────────────────────────────────────────────────
export function ConfirmDialog({ isOpen, onClose, onConfirm, title, message, confirmLabel = 'Delete', loading }: {
  isOpen: boolean; onClose: () => void; onConfirm: () => void;
  title: string; message: string; confirmLabel?: string; loading?: boolean;
}) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="sm"
      footer={<>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button variant="danger" onClick={onConfirm} loading={loading}>{confirmLabel}</Button>
      </>}
    >
      <p className="text-sm text-coolslate">{message}</p>
    </Modal>
  );
}

// ─── SP Color Dot ─────────────────────────────────────────────────────────────
export function SPDot({ color, size = 10 }: { color: string; size?: number }) {
  return <span className="rounded-full inline-block flex-shrink-0" style={{ width: size, height: size, background: color }} />;
}
