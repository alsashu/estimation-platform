import { Routes, Route, Navigate } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { ProtectedRoute } from './components/auth/ProtectedRoute';
import { ModuleRoute, HomeRoute, MasterIndexRoute, ModuleAccessDenied, AnyModuleRoute } from './components/auth/ModuleRoute';
import LoginPage from './modules/auth/LoginPage';
import RegisterPage from './modules/auth/RegisterPage';
import ForgotPasswordPage from './modules/auth/ForgotPasswordPage';
import ResetPasswordPage from './modules/auth/ResetPasswordPage';
import Dashboard from './modules/dashboard/Dashboard';
import EstimationWizard from './modules/estimation/EstimationWizard';
import HistoricalData from './modules/history/HistoricalData';
import AnalysisPage from './modules/analysis/AnalysisPage';
import StoryPointsPage from './modules/master-story-points/StoryPointsPage';
import EffortEstimatesPage from './modules/master-effort/EffortEstimatesPage';
import CompetencyPage from './modules/master-competency/CompetencyPage';
import ParametricMasterPage from './modules/master-parametric/ParametricMasterPage';
import DocsPage from './modules/docs/DocsPage';
import SettingsPage from './modules/settings/SettingsPage';
import NotificationsPage from './modules/notifications/NotificationsPage';
import LogsPage from './modules/logs/LogsPage';
import HealthPage from './modules/monitoring/HealthPage';
import ParametricEstimationPage from './modules/parametric-estimation/ParametricEstimationPage';
import ParametricDashboard from './modules/parametric-estimation/ParametricDashboard';
import ParametricHistoryPage from './modules/parametric-estimation/ParametricHistoryPage';
import ParametricAnalysisPage from './modules/parametric-estimation/ParametricAnalysisPage';
import EstimationPerformancePage from './modules/performance/EstimationPerformancePage';
import UsersPage from './modules/users/UsersPage';
import ProgramsPage from './modules/programs/ProgramsPage';
import DepartmentsPage from './modules/departments/DepartmentsPage';
import BaselinesPage from './modules/baselines/BaselinesPage';
import RolesPage from './modules/roles/RolesPage';
import RegistrationsPage from './modules/registrations/RegistrationsPage';

export default function App() {
  return (
    <Routes>
      {/* Public auth routes */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />

      {/* Protected app routes */}
      <Route element={<ProtectedRoute><AppShell /></ProtectedRoute>}>
        {/* Estimation modules: SP and PE pages each require that module (independent of the role) */}
        <Route index element={<HomeRoute><Dashboard /></HomeRoute>} />
        <Route path="parametric-dashboard" element={<ModuleRoute module="PE"><ParametricDashboard /></ModuleRoute>} />
        <Route path="estimation-performance" element={<AnyModuleRoute><EstimationPerformancePage /></AnyModuleRoute>} />
        <Route path="estimate" element={<ModuleRoute module="SP"><EstimationWizard /></ModuleRoute>} />
        <Route path="parametric-estimation" element={<ModuleRoute module="PE"><ParametricEstimationPage /></ModuleRoute>} />
        <Route path="history" element={<ModuleRoute module="SP"><HistoricalData /></ModuleRoute>} />
        <Route path="parametric-history" element={<ModuleRoute module="PE"><ParametricHistoryPage /></ModuleRoute>} />
        <Route path="analysis" element={<ModuleRoute module="SP"><AnalysisPage /></ModuleRoute>} />
        <Route path="parametric-analysis" element={<ModuleRoute module="PE"><ParametricAnalysisPage /></ModuleRoute>} />
        <Route path="master">
          <Route index element={<MasterIndexRoute />} />
          <Route path="story-points" element={<ModuleRoute module="SP"><StoryPointsPage /></ModuleRoute>} />
          <Route path="effort" element={<ModuleRoute module="SP"><EffortEstimatesPage /></ModuleRoute>} />
          <Route path="competency" element={<ModuleRoute module="SP"><CompetencyPage /></ModuleRoute>} />
          <Route path="parametric" element={
            <ModuleRoute module="PE">
              <ProtectedRoute requiredPermission="parametric.master.read"><ParametricMasterPage /></ProtectedRoute>
            </ModuleRoute>
          } />
        </Route>
        <Route path="no-module-access" element={<ModuleAccessDenied />} />
        <Route path="docs" element={<DocsPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="notifications" element={<NotificationsPage />} />
        <Route path="logs" element={<LogsPage />} />
        <Route path="monitoring" element={<HealthPage />} />

        {/* Enterprise management routes */}
        <Route path="users" element={
          <ProtectedRoute requiredPermission="user.read"><UsersPage /></ProtectedRoute>
        } />
        {/* Organisation hierarchy: Department → Program → Baseline (→ Component → Subcomponent) */}
        <Route path="departments" element={
          <ProtectedRoute requiredPermission="department.read"><DepartmentsPage /></ProtectedRoute>
        } />
        <Route path="programs" element={
          <ProtectedRoute requiredPermission="project.read"><ProgramsPage /></ProtectedRoute>
        } />
        <Route path="baselines" element={
          <ProtectedRoute requiredPermission="baseline.read"><BaselinesPage /></ProtectedRoute>
        } />
        {/* Projects were renamed to Programs — keep old links working */}
        <Route path="projects" element={<Navigate to="/programs" replace />} />
        <Route path="roles" element={
          <ProtectedRoute requiredPermission="role.read"><RolesPage /></ProtectedRoute>
        } />
        <Route path="registrations" element={
          <ProtectedRoute requiredPermission="registration.approve"><RegistrationsPage /></ProtectedRoute>
        } />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
