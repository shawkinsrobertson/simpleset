import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import Layout from './components/Layout';
import TodayPage from './pages/TodayPage';
import PlanPage from './pages/PlanPage';
import StatsPage from './pages/StatsPage';
import PlansPage from './pages/PlansPage';
import ImportPage from './pages/ImportPage';
import ConfirmPage from './pages/ConfirmPage';
import DriveImportPage from './pages/DriveImportPage';
import SyncReviewPage from './pages/SyncReviewPage';

const WIDE_ROUTES = ['/confirm', '/sync-review'];

function App() {
  const location = useLocation();
  const wide = WIDE_ROUTES.includes(location.pathname);

  return (
    <Layout wide={wide}>
      <Routes>
        <Route path="/" element={<Navigate to="/today" replace />} />
        <Route path="/today" element={<TodayPage />} />
        <Route path="/plan" element={<PlanPage />} />
        <Route path="/stats" element={<StatsPage />} />
        <Route path="/plans" element={<PlansPage />} />
        <Route path="/import" element={<ImportPage />} />
        <Route path="/import/drive" element={<DriveImportPage />} />
        <Route path="/confirm" element={<ConfirmPage />} />
        <Route path="/sync-review" element={<SyncReviewPage />} />
        <Route path="*" element={<Navigate to="/today" replace />} />
      </Routes>
    </Layout>
  );
}

export default App;
