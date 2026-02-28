import { useEffect } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import Header from './Header';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/api';

const Layout = () => {
  const { token } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const checkMandatoryCurriculum = async () => {
      if (!token) return;

      if (location.pathname === '/curriculum') return;

      try {
        const tests = await api.getMockTests(token);
        const entryTestCompleted = tests.some(t => 
          t.test_type === 'RMO Entry Mock Test' && t.status === 'completed'
        );

        if (entryTestCompleted) {
          const selection = await api.getMyCurriculumSelection(token);
          if (!selection.has_selection) {
            navigate('/curriculum');
          }
        }
      } catch (error) {
        console.error("Failed to check mandatory curriculum:", error);
      }
    };

    checkMandatoryCurriculum();
  }, [token, location.pathname, navigate]);

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="flex">
        {/* Main Content */}
        <main className="flex-1 pt-16">
          <div className="main-content">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
};

export default Layout;
