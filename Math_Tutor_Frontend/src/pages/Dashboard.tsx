import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FileText, TrendingUp, BookOpen, Flame, CheckCircle2, Circle, BookMarked, Target, ExternalLink } from 'lucide-react';
import { api } from '@/lib/api';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { renderLaTeXToHTML } from '@/lib/latex';

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
  const [dailyTasks, setDailyTasks] = useState<any>(null);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [hasCurriculum, setHasCurriculum] = useState(false);

  useEffect(() => {
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

  useEffect(() => {
    const fetchDailyTasks = async () => {
      if (!token) return;

      try {
        setLoadingTasks(true);
        const selection = await api.getMyCurriculumSelection(token);
        setHasCurriculum(selection.has_selection || false);

        if (selection.has_selection) {
          const tasks = await api.getDailyTasks(undefined, token);
          setDailyTasks(tasks);
        }
      } catch (err) {
        console.error("Failed to fetch daily tasks", err);
      } finally {
        setLoadingTasks(false);
      }
    };

    fetchDailyTasks();
  }, [token]);

  const handleCompleteTask = async (taskId: number) => {
    if (!token) return;

    try {
      await api.completeTask(taskId, token);
      const tasks = await api.getDailyTasks(undefined, token);
      setDailyTasks(tasks);
    } catch (err) {
      console.error("Failed to complete task", err);
    }
  };

  const getTaskIcon = (taskType: string) => {
    switch (taskType) {
      case 'practice_problem':
        return BookOpen;
      case 'study_material':
        return BookMarked;
      case 'topic_review':
        return Target;
      default:
        return Circle;
    }
  };

  const getTaskLabel = (taskType: string) => {
    switch (taskType) {
      case 'practice_problem':
        return 'Practice Problem';
      case 'study_material':
        return 'Study Material';
      case 'topic_review':
        return 'Topic Review';
      default:
        return 'Task';
    }
  };

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

      {/* Today's Tasks */}
      {hasCurriculum ? (
        <Card>
          <CardHeader>
            <CardTitle>Today's Tasks</CardTitle>
            <CardDescription>
              {dailyTasks && dailyTasks.tasks ? (
                <>
                  {dailyTasks.completed_tasks} of {dailyTasks.total_tasks} tasks completed
                </>
              ) : (
                'Your daily learning tasks'
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loadingTasks ? (
              <div className="text-sm text-muted-foreground">Loading tasks...</div>
            ) : dailyTasks && dailyTasks.tasks && dailyTasks.tasks.length > 0 ? (
              <div className="space-y-3">
                {dailyTasks.tasks.map((task: any) => {
                  const TaskIcon = getTaskIcon(task.task_type);
                  const isCompleted = task.is_completed;
                  const taskContent = typeof task.task_content === 'string'
                    ? JSON.parse(task.task_content)
                    : task.task_content;

                  return (
                    <div
                      key={task.task_id}
                      className={`flex items-start gap-3 p-3 rounded-lg border ${isCompleted
                        ? 'bg-muted/50 border-muted'
                        : 'bg-background border-border'
                        }`}
                    >
                      <div className="mt-1">
                        {isCompleted ? (
                          <CheckCircle2 className="h-5 w-5 text-green-600" />
                        ) : (
                          <Circle
                            className="h-5 w-5 text-muted-foreground cursor-pointer hover:text-primary transition-colors"
                            onClick={() => handleCompleteTask(task.task_id)}
                          />
                        )}
                      </div>
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center gap-2">
                          <TaskIcon className="h-4 w-4 text-muted-foreground" />
                          <Badge variant="outline" className="text-xs">
                            {getTaskLabel(task.task_type)}
                          </Badge>
                        </div>
                        {task.task_type === 'practice_problem' && (
                          <div>
                            <Link
                              to={`/problems?problem_id=${taskContent.problem_id}`}
                              className="block group"
                            >
                              <div className="text-sm font-medium mb-1 group-hover:text-primary transition-colors">
                                Problem #{taskContent.problem_id}
                              </div>
                              <div className="prose prose-sm max-w-none mb-2">
                                <div
                                  className="whitespace-pre-wrap line-clamp-3"
                                  // eslint-disable-next-line react/no-danger
                                  dangerouslySetInnerHTML={{
                                    __html: renderLaTeXToHTML(taskContent.problem_text || '')
                                  }}
                                />
                              </div>
                            </Link>
                            {taskContent.domain && (
                              <p className="text-xs text-muted-foreground mt-1 mb-1">
                                Domain: {Array.isArray(taskContent.domain)
                                  ? taskContent.domain.join(', ')
                                  : taskContent.domain}
                              </p>
                            )}
                            <Link
                              to={`/problems?problem_id=${taskContent.problem_id}`}
                              className="text-xs text-primary hover:underline mt-1 inline-flex items-center gap-1"
                            >
                              View Problem <ExternalLink className="h-3 w-3" />
                            </Link>
                          </div>
                        )}
                        {task.task_type === 'study_material' && (
                          <div>
                            <p className="text-sm font-medium">{taskContent.title}</p>
                            {taskContent.snippet && (
                              <p className="text-xs text-muted-foreground mt-1">
                                {taskContent.snippet}
                              </p>
                            )}
                            {taskContent.url && (
                              <a
                                href={taskContent.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-primary hover:underline mt-1 inline-flex items-center gap-1"
                              >
                                Open Material <ExternalLink className="h-3 w-3" />
                              </a>
                            )}
                          </div>
                        )}
                        {task.task_type === 'topic_review' && (
                          <div>
                            <p className="text-sm font-medium">{taskContent.description}</p>
                            {taskContent.topics && (
                              <p className="text-xs text-muted-foreground mt-1">
                                Topics: {Array.isArray(taskContent.topics)
                                  ? taskContent.topics.join(', ')
                                  : taskContent.topics}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">
                No tasks for today. Tasks are generated automatically based on your progress.
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Daily Tasks</CardTitle>
            <CardDescription>Personalized learning tasks based on your weaknesses</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Select a curriculum plan to start receiving daily tasks tailored to your learning needs.
              </p>
              <Button asChild>
                <Link to="/curriculum">Select Curriculum Plan</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

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
          <DialogFooter className="flex sm:justify-end sm:flex-row gap-3">
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
