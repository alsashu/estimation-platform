import { Routes, Route, Navigate } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { ProtectedRoute } from './components/auth/ProtectedRoute';
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
import DocsPage from './modules/docs/DocsPage';
import SettingsPage from './modules/settings/SettingsPage';
import NotificationsPage from './modules/notifications/NotificationsPage';
import LogsPage from './modules/logs/LogsPage';
import HealthPage from './modules/monitoring/HealthPage';
import ParametricEstimationPage from './modules/parametric-estimation/ParametricEstimationPage';
import UsersPage from './modules/users/UsersPage';
import ProjectsPage from './modules/projects/ProjectsPage';
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
        <Route index element={<Dashboard />} />
        <Route path="estimate" element={<EstimationWizard />} />
        <Route path="parametric-estimation" element={<ParametricEstimationPage />} />
        <Route path="history" element={<HistoricalData />} />
        <Route path="analysis" element={<AnalysisPage />} />
        <Route path="master">
          <Route index element={<Navigate to="story-points" replace />} />
          <Route path="story-points" element={<StoryPointsPage />} />
          <Route path="effort" element={<EffortEstimatesPage />} />
          <Route path="competency" element={<CompetencyPage />} />
        </Route>
        <Route path="docs" element={<DocsPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="notifications" element={<NotificationsPage />} />
        <Route path="logs" element={<LogsPage />} />
        <Route path="monitoring" element={<HealthPage />} />

        {/* Enterprise management routes */}
        <Route path="users" element={
          <ProtectedRoute requiredPermission="user.read"><UsersPage /></ProtectedRoute>
        } />
        <Route path="projects" element={
          <ProtectedRoute requiredPermission="project.read"><ProjectsPage /></ProtectedRoute>
        } />
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
