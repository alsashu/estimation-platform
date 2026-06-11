import { Routes, Route, Navigate } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
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

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
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
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
