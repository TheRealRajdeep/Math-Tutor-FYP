import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FileText, TrendingUp, BookOpen, Flame } from 'lucide-react';
import { api } from '@/lib/api';
import { Link } from 'react-router-dom';

const Dashboard = () => {
  const [stats, setStats] = useState({
    testsAttempted: 0,
    averageScore: 0,
    problemsSolved: 0,
    streak: 0,
  });

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
    </div>
  );
};

export default Dashboard;

