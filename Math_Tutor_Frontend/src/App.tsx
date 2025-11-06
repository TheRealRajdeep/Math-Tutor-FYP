import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Layout from './components/Layout';
import Auth from './pages/Auth';
import Dashboard from './pages/Dashboard';
import MockTests from './pages/MockTests';
import TestTaking from './pages/TestTaking';
import Submissions from './pages/Submissions';
import Problems from './pages/Problems';
import Progress from './pages/Progress';
import Tutor from './pages/Tutor';
import Settings from './pages/Settings';
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/auth" replace />;
  }

  return <>{children}</>;
}

function AppRoutes() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <Routes>
      {isAuthenticated ? (
        <>
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
          <Route path="/auth" element={<Navigate to="/dashboard" replace />} />
        </>
      ) : (
        <>
          <Route path="/auth" element={<Auth />} />
          <Route path="*" element={<Navigate to="/auth" replace />} />
        </>
      )}
    </Routes>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
