import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FileText, TrendingUp, BookOpen, Flame } from 'lucide-react';
import { api } from '@/lib/api';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const Dashboard = () => {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    testsAttempted: 0,
    averageScore: 0,
    problemsSolved: 0,
    streak: 0,
  });

  const [showEntryTestModal, setShowEntryTestModal] = useState(false);
  const [pendingTestId, setPendingTestId] = useState<number | null>(null);

  useEffect(() => {
    // TODO: Fetch actual stats from API
    // For now, using mock data
    setStats({
      testsAttempted: 5,
      averageScore: 78,
      problemsSolved: 42,
      streak: 7,
    });
  }, []);

  useEffect(() => {
    const checkEntryTest = async () => {
      if (!token) return;
      try {
        const tests = await api.getMockTests(token);
        // Find if there is an unfinished entry test
        // We look for 'RMO Entry Mock Test' specifically, or if the user has only one test ever and it's not started (new user case)
        const entryTest = tests.find(t => 
          (t.test_type === 'RMO Entry Mock Test' || (tests.length === 1 && t.status === 'not_started')) && 
          t.status === 'not_started'
        );
        
        if (entryTest) {
          setPendingTestId(entryTest.test_id);
          setShowEntryTestModal(true);
        }
      } catch (err) {
        console.error("Failed to check entry test", err);
      }
    };
    checkEntryTest();
  }, [token]);

  const handleStartTest = () => {
    if (pendingTestId) {
      navigate(`/mock-tests/${pendingTestId}/take`);
    }
  };

  const statCards = [
    {
      title: 'Tests Attempted',
      value: stats.testsAttempted,
      icon: FileText,
      description: 'Total mock tests completed',
    },
    {
      title: 'Average Score',
      value: `${stats.averageScore}%`,
      icon: TrendingUp,
      description: 'Across all tests',
    },
    {
      title: 'Problems Solved',
      value: stats.problemsSolved,
      icon: BookOpen,
      description: 'Total practice problems',
    },
    {
      title: 'Current Streak',
      value: `${stats.streak} days`,
      icon: Flame,
      description: 'Daily practice streak',
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">Welcome back! Here's your progress overview.</p>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {statCards.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.title}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
                <Icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stat.value}</div>
                <p className="text-xs text-muted-foreground">{stat.description}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
          <CardDescription>Get started with your practice</CardDescription>
        </CardHeader>
        <CardContent className="flex gap-4">
          <Button asChild>
            <Link to="/mock-tests">Start New Test</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to="/problems">Practice Problems</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to="/progress">View Progress</Link>
          </Button>
        </CardContent>
      </Card>

      {/* Recent Activity */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
          <CardDescription>Your latest test submissions</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="text-sm text-muted-foreground">
              No recent activity. Start a test to see your submissions here.
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Entry Test Warning Modal */}
      <Dialog open={showEntryTestModal} onOpenChange={setShowEntryTestModal}>
        <DialogContent className="sm:max-w-md" onInteractOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>Entry Mock Test Required</DialogTitle>
            <DialogDescription className="space-y-4 pt-4 text-left">
              <p>
                To customize your learning experience and recommend the right problems, we need to assess your current skill level.
              </p>
              <div className="bg-amber-50 dark:bg-amber-950/30 p-4 rounded-md border border-amber-200 dark:border-amber-900">
                <p className="font-semibold text-amber-800 dark:text-amber-200 mb-2">
                  ⚠️ Before you begin
                </p>
                <ul className="list-disc list-inside text-sm text-amber-700 dark:text-amber-300 space-y-2">
                  <li>This test is designed to identify your strengths and weaknesses.</li>
                  <li>It will take approximately <strong>1 hour</strong> to complete.</li>
                  <li>Please ensure you have a stable internet connection and a quiet environment.</li>
                </ul>
              </div>
              <p>
                Are you ready to begin now?
              </p>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col sm:justify-between sm:flex-row gap-3">
             <Button variant="outline" onClick={() => setShowEntryTestModal(false)}>
               I'll do it later
             </Button>
             <Button onClick={handleStartTest}>
               Start Entry Test
             </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Dashboard;
