import { Lock, AlertCircle } from 'lucide-react';
import { cn } from '../../utils/formatters';
import {
  ESTIMATION_MODULES, moduleFieldState, validateModuleSelection, type ModuleCode,
} from '../../utils/moduleAccess';

interface Props {
  /** Modules ticked for the target (only those the actor can manage are editable). */
  value: ModuleCode[];
  onChange: (modules: ModuleCode[]) => void;
  /** Modules the signed-in administrator holds — the most they can grant. */
  actorModules: ModuleCode[];
  /** The target's current modules when editing (modules outside the actor's access are kept, read-only). */
  targetModules?: ModuleCode[];
  /** Global Super Admin accounts always have every module. */
  targetIsGlobalSuperAdmin?: boolean;
  /** Show the "select at least one" error (e.g. after a submit attempt). */
  showErrors?: boolean;
}

/**
 * "ESTIMATION MODULE ACCESS *" — Story Point Estimation and/or Parametric Estimation, independent of the role.
 * An administrator can only grant modules they hold; the server enforces the same rule.
 */
export function EstimationModuleAccessField({
  value, onChange, actorModules, targetModules = [], targetIsGlobalSuperAdmin, showErrors,
}: Props) {
  const states = moduleFieldState(actorModules, targetModules);
  const error = targetIsGlobalSuperAdmin ? null : validateModuleSelection(value, actorModules, targetModules);
  const toggle = (code: ModuleCode, on: boolean) =>
    onChange(on ? [...new Set([...value, code])] : value.filter(m => m !== code));

  return (
    <fieldset aria-describedby="module-access-help" className="space-y-1.5" data-testid="module-access-field">
      <legend className="text-xs font-medium text-coolslate uppercase tracking-wide mb-1">
        Estimation Module Access <span aria-hidden className="text-vibrant">*</span>
      </legend>
      {ESTIMATION_MODULES.map(m => {
        const st = states.find(s => s.code === m.code)!;
        const checked = targetIsGlobalSuperAdmin || (st.canManage ? value.includes(m.code) : st.locked);
        const disabled = targetIsGlobalSuperAdmin || !st.canManage;
        return (
          <label key={m.code}
            className={cn(
              'flex items-start gap-2.5 px-3 py-2 rounded-lg border text-sm transition-colors',
              checked ? 'border-carbon/40 dark:border-lgrayblue/50 bg-carbon/[0.03] dark:bg-white/[0.04]' : 'border-lgrayblue/40 dark:border-slate-600',
              disabled ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer hover:border-carbon/40',
            )}>
            <input type="checkbox" className="mt-0.5 accent-carbon" checked={checked} disabled={disabled}
              onChange={e => toggle(m.code, e.target.checked)} aria-label={m.label} />
            <span className="min-w-0">
              <span className="flex items-center gap-1.5 font-medium text-carbon dark:text-white">
                {m.label}
                {disabled && <Lock size={11} className="text-coolslate" aria-hidden />}
              </span>
              <span className="block text-[11px] text-coolslate leading-snug">
                {targetIsGlobalSuperAdmin ? 'Global Super Admins always have every module.'
                  : st.locked ? 'Assigned by someone with this module — you cannot change it.'
                  : st.blocked ? 'Outside your own module access — you cannot grant it.'
                  : m.description}
              </span>
            </span>
          </label>
        );
      })}
      <p id="module-access-help" className="text-[11px] text-coolslate">Select one or both estimation modules.</p>
      {showErrors && error && (
        <p role="alert" className="text-xs text-vibrant flex items-center gap-1"><AlertCircle size={12} />{error}</p>
      )}
    </fieldset>
  );
}
