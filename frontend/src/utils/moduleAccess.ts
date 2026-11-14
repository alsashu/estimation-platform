/**
 * Estimation module access (SP / PE) — kept separate from roles.
 * Effective access = role permissions ∩ module access (+ Department / Program scope).
 * The backend is authoritative; these helpers only shape the UI.
 */
export const MODULE_CODES = ['SP', 'PE'] as const;
export type ModuleCode = (typeof MODULE_CODES)[number];

export const ESTIMATION_MODULES: { code: ModuleCode; label: string; description: string }[] = [
  { code: 'SP', label: 'Story Point Estimation (SP)', description: 'Dashboard SP, Storypoint Estimation, Historical Data SP, Analytics SP, Story Points, Effort Estimates, Competency' },
  { code: 'PE', label: 'Parametric Estimation (PE)', description: 'Dashboard PE, Parametric Estimation, Historical Data PE, Analytics PE, Parametric Data' },
];

export const MODULE_SHORT: Record<ModuleCode, string> = { SP: 'SP', PE: 'PE' };

export function normalizeModules(m: readonly string[] | undefined | null): ModuleCode[] {
  return MODULE_CODES.filter(c => (m ?? []).includes(c));
}

/**
 * What an actor sees for a target in the Estimation Module Access field.
 *  • editable  — modules the actor holds (may be ticked / unticked)
 *  • locked    — modules the target already has that the actor cannot manage (kept, shown read-only)
 *  • blocked   — modules the actor cannot grant and the target does not have
 */
export function moduleFieldState(actorModules: readonly ModuleCode[], targetModules: readonly ModuleCode[] = []) {
  return MODULE_CODES.map(code => {
    const canManage = actorModules.includes(code);
    const has = targetModules.includes(code);
    return { code, canManage, locked: !canManage && has, blocked: !canManage && !has };
  });
}

/** Mirrors the backend: requested (within the actor's modules) ∪ locked modules the target keeps. */
export function resultingModules(selected: readonly ModuleCode[], actorModules: readonly ModuleCode[], targetModules: readonly ModuleCode[] = []) {
  return normalizeModules([
    ...selected.filter(m => actorModules.includes(m)),
    ...targetModules.filter(m => !actorModules.includes(m)),
  ]);
}

export function validateModuleSelection(selected: readonly ModuleCode[], actorModules: readonly ModuleCode[], targetModules: readonly ModuleCode[] = []): string | null {
  if (selected.some(m => !actorModules.includes(m))) return 'You can only grant modules you have access to';
  if (resultingModules(selected, actorModules, targetModules).length === 0) return 'Select at least one estimation module';
  return null;
}

// ─── Navigation ──────────────────────────────────────────────────────────────
/** Which module owns a route (null = shared, e.g. Organisation / Administration). */
export function routeModule(pathname: string): ModuleCode | null {
  const p = pathname.replace(/\/+$/, '') || '/';
  if (p === '/' || p.startsWith('/estimate') || p.startsWith('/history') || p.startsWith('/analysis')
    || p.startsWith('/master/story-points') || p.startsWith('/master/effort') || p.startsWith('/master/competency')) return 'SP';
  if (p.startsWith('/parametric') || p.startsWith('/master/parametric')) return 'PE';
  return null;
}

/** Landing page for a user: Dashboard SP, else Dashboard PE, else the no-access page. */
export function homePathFor(modules: readonly ModuleCode[]): string {
  if (modules.includes('SP')) return '/';
  if (modules.includes('PE')) return '/parametric-dashboard';
  return '/no-module-access';
}
