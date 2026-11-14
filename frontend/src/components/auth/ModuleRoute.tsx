import { Link, Navigate } from 'react-router-dom';
import { ShieldOff } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { homePathFor, type ModuleCode } from '../../utils/moduleAccess';

const MODULE_NAME: Record<ModuleCode, string> = { SP: 'Story Point Estimation', PE: 'Parametric Estimation' };

/** Shown when a page of a module the user does not hold is opened directly (the API answers 403 as well). */
export function ModuleAccessDenied({ module }: { module?: ModuleCode }) {
  const modules = useAuthStore(s => s.getModules());
  const home = homePathFor(modules);
  return (
    <div className="flex flex-col items-center justify-center text-center py-24 px-4" data-testid="module-access-denied" role="alert">
      <div className="w-12 h-12 rounded-xl bg-vibrant/10 flex items-center justify-center mb-4">
        <ShieldOff size={22} className="text-vibrant" />
      </div>
      <h1 className="text-lg font-display font-semibold text-carbon dark:text-white">403 · Access denied</h1>
      <p className="text-sm text-coolslate mt-1 max-w-md">
        {module
          ? <>You do not have access to <strong className="text-carbon dark:text-white">{MODULE_NAME[module]}</strong>. Ask an administrator to grant it.</>
          : <>No estimation module (Story Point or Parametric Estimation) is assigned to your account. Ask an administrator to grant one.</>}
      </p>
      {home !== '/no-module-access' && (
        <Link to={home} className="mt-5 text-sm font-medium text-carbon dark:text-white underline underline-offset-4">Go to your dashboard</Link>
      )}
    </div>
  );
}

/** Renders `children` only when the user holds `module`. */
export function ModuleRoute({ module, children }: { module: ModuleCode; children: React.ReactNode }) {
  const allowed = useAuthStore(s => s.hasModule(module));
  return allowed ? <>{children}</> : <ModuleAccessDenied module={module} />;
}

/**
 * The index route is Dashboard SP. Users without SP land on Dashboard PE instead of a 403,
 * and users with no module at all see the no-access page.
 */
export function HomeRoute({ children }: { children: React.ReactNode }) {
  const modules = useAuthStore(s => s.getModules());
  if (modules.includes('SP')) return <>{children}</>;
  return <Navigate to={homePathFor(modules)} replace />;
}

/** /master → the first master-data page the user can open. */
export function MasterIndexRoute() {
  const modules = useAuthStore(s => s.getModules());
  if (modules.includes('SP')) return <Navigate to="story-points" replace />;
  if (modules.includes('PE')) return <Navigate to="parametric" replace />;
  return <ModuleAccessDenied />;
}

/** Renders `children` when the user holds at least one estimation module (cross-module pages). */
export function AnyModuleRoute({ children }: { children: React.ReactNode }) {
  const modules = useAuthStore(s => s.getModules());
  return modules.length > 0 ? <>{children}</> : <ModuleAccessDenied />;
}
