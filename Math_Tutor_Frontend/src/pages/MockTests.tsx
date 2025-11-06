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
                  <Badge variant="outline">Not Started</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
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
                  <Button asChild>
                    <Link to={`/mock-tests/${test.test_id}/take`}>Start Test</Link>
                  </Button>
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

