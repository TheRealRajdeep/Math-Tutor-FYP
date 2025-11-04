import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Link } from 'react-router-dom';
import { api, type MockTest } from '@/lib/api';
import { Skeleton } from '@/components/ui/skeleton';

const MockTests = () => {
  const [tests, setTests] = useState<MockTest[]>([]);
  const [loading, setLoading] = useState(false);
  

  const generateNewTest = async () => {
    setLoading(true);
    try {
      const newTest = await api.generateMockTest();
      setTests((prev) => [newTest, ...prev]);
    } catch (error) {
      console.error('Failed to generate test:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Mock Tests</h1>
          <p className="text-muted-foreground">Practice with RMO Entry level mock tests</p>
        </div>
        <Button onClick={generateNewTest} disabled={loading}>
          {loading ? 'Generating...' : 'Generate New Test'}
        </Button>
      </div>

      {/* Tests List */}
      <div className="grid gap-4">
        {tests.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center">
              <p className="text-muted-foreground mb-4">No tests generated yet.</p>
              <Button onClick={generateNewTest} disabled={loading}>
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

