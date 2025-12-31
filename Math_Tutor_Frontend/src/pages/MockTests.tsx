import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Link } from 'react-router-dom';
import { api, type MockTest } from '@/lib/api';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/contexts/AuthContext';

const MockTests = () => {
  const { token, isAuthenticated } = useAuth();
  const [tests, setTests] = useState<MockTest[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);

  // Fetch existing tests on mount
  useEffect(() => {
    const fetchTests = async () => {
      if (!isAuthenticated || !token) {
        setFetching(false);
        return;
      }

      try {
        const fetchedTests = await api.getMockTests(token);
        setTests(fetchedTests);
      } catch (error) {
        console.error('Failed to fetch tests:', error);
      } finally {
        setFetching(false);
      }
    };

    fetchTests();
  }, [isAuthenticated, token]);

  const generateNewTest = async () => {
    if (!token) {
      console.error('Not authenticated');
      return;
    }

    setLoading(true);
    try {
      const newTest = await api.generateMockTest(token);
      setTests((prev) => [newTest, ...prev]);
    } catch (error) {
      console.error('Failed to generate test:', error);
    } finally {
      setLoading(false);
    }
  };

  if (fetching) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Mock Tests</h1>
            <p className="text-muted-foreground">Practice with RMO Entry level mock tests</p>
          </div>
        </div>
        <div className="grid gap-4">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-6 w-48" />
                <Skeleton className="h-4 w-32 mt-2" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-20 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Mock Tests</h1>
          <p className="text-muted-foreground">Practice with RMO Entry level mock tests</p>
        </div>
        <Button variant="default" onClick={generateNewTest} disabled={loading || !isAuthenticated}>
          {loading ? 'Generating...' : 'Generate New Test'}
        </Button>
      </div>

      {/* Tests List */}
      <div className="grid gap-4">
        {tests.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center">
              <p className="text-muted-foreground mb-4">No tests generated yet.</p>
              <Button variant="default" onClick={generateNewTest} disabled={loading || !isAuthenticated}>
                Generate Your First Test
              </Button>
            </CardContent>
          </Card>
        ) : (
          tests.map((test) => (
            <Card key={test.test_id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>{test.test_type}</CardTitle>
                    <CardDescription>
                      {test.total_questions} questions • Difficulty: {test.difficulty_range}
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    {test.status === 'completed' ? (
                      <Badge variant="default" className="bg-green-600">Completed</Badge>
                    ) : test.status === 'in_progress' ? (
                      <Badge variant="secondary">In Progress</Badge>
                    ) : (
                      <Badge variant="outline">Not Started</Badge>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {test.status === 'completed' && test.grade && (
                    <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                      <h4 className="text-sm font-semibold mb-2 text-green-800 dark:text-green-200">Test Results</h4>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="text-muted-foreground">Score: </span>
                          <span className="font-semibold text-green-700 dark:text-green-300">
                            {test.grade.correct_answers}/{test.grade.total_problems}
                          </span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Average: </span>
                          <span className="font-semibold text-green-700 dark:text-green-300">
                            {test.grade.average_percentage.toFixed(1)}%
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  <div>
                    <h4 className="text-sm font-medium mb-2">Domain Distribution:</h4>
                    <div className="flex gap-2 flex-wrap">
                      {Object.entries(test.domain_distribution).map(([domain, count]) => (
                        <Badge key={domain} variant="secondary">
                          {domain}: {count}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  {test.status !== 'completed' && (
                    <Button asChild>
                      <Link to={`/mock-tests/${test.test_id}/take`}>Start Test</Link>
                    </Button>
                  )}
                  {test.status === 'completed' && (
                    <Button asChild variant="outline">
                      <Link to={`/mock-tests/${test.test_id}/take`}>View Test</Link>
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
};

export default MockTests;

