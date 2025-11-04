import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import MockTests from './pages/MockTests';
import TestTaking from './pages/TestTaking';
import Submissions from './pages/Submissions';
import Problems from './pages/Problems';
import Progress from './pages/Progress';
import Tutor from './pages/Tutor';
import Settings from './pages/Settings';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="mock-tests" element={<MockTests />} />
          <Route path="mock-tests/:testId/take" element={<TestTaking />} />
          <Route path="submissions" element={<Submissions />} />
          <Route path="submissions/:submissionId" element={<Submissions />} />
          <Route path="problems" element={<Problems />} />
          <Route path="progress" element={<Progress />} />
          <Route path="tutor" element={<Tutor />} />
          <Route path="settings" element={<Settings />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
