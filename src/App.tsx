import { Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import TodayPage from './pages/TodayPage';
import PlanPage from './pages/PlanPage';
import StatsPage from './pages/StatsPage';
import PlansPage from './pages/PlansPage';
import ImportPage from './pages/ImportPage';
import ConfirmPage from './pages/ConfirmPage';
import DriveImportPage from './pages/DriveImportPage';

function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Navigate to="/today" replace />} />
        <Route path="/today" element={<TodayPage />} />
        <Route path="/plan" element={<PlanPage />} />
        <Route path="/stats" element={<StatsPage />} />
        <Route path="/plans" element={<PlansPage />} />
        <Route path="/import" element={<ImportPage />} />
        <Route path="/import/drive" element={<DriveImportPage />} />
        <Route path="/confirm" element={<ConfirmPage />} />
        <Route path="*" element={<Navigate to="/today" replace />} />
      </Routes>
    </Layout>
  );
}

export default App;
