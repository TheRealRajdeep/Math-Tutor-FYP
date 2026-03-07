import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Link } from 'react-router-dom';
import { api, type MockTest } from '@/lib/api';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/contexts/AuthContext';
import { Target, FileText, Info } from 'lucide-react';

// ─── helpers ─────────────────────────────────────────────────────────────────

function isTargeted(test: MockTest) {
  return test.test_type.toLowerCase().startsWith('targeted');
}

function TestTypeBadge({ test }: { test: MockTest }) {
  if (isTargeted(test)) {
    return (
      <Badge variant="outline" className="bg-violet-100 text-violet-700 border-violet-200 dark:bg-violet-900/30 dark:text-violet-300 dark:border-violet-700 text-xs">
        <Target className="w-3 h-3 mr-1" /> Targeted
      </Badge>
    );
  }
  if (test.test_type.toLowerCase().includes('entry')) {
    return (
      <Badge variant="outline" className="text-xs">
        Entry
      </Badge>
    );
  }
  if (test.test_type.toLowerCase().includes('scheduled')) {
    return (
      <Badge variant="outline" className="text-xs">
        Scheduled
      </Badge>
    );
  }
  return null;
}

function StatusBadge({ status }: { status: MockTest['status'] }) {
  if (status === 'completed')
    return <Badge className="bg-green-600 text-white text-xs">Completed</Badge>;
  if (status === 'in_progress')
    return <Badge variant="secondary" className="text-xs">In Progress</Badge>;
  return <Badge variant="outline" className="text-xs">Not Started</Badge>;
}

// ─── main component ───────────────────────────────────────────────────────────

function formatTestTitle(title: string) {
  // If it's a targeted test with details in parens, just show the main part
  // e.g. "Targeted Mock Test (Algebrax1...)" -> "Targeted Mock Test"
  if (title.startsWith('Targeted Mock Test')) {
    return 'Targeted Mock Test';
  }
  return title;
}

const MockTests = () => {
  const { token, isAuthenticated } = useAuth();
  const [tests, setTests] = useState<MockTest[]>([]);
  const [fetching, setFetching] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [generatingTargeted, setGeneratingTargeted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [targetedError, setTargetedError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated || !token) { setFetching(false); return; }
    api.getMockTests(token)
      .then(setTests)
      .catch(() => {})
      .finally(() => setFetching(false));
  }, [isAuthenticated, token]);

  async function generateNewTest() {
    if (!token) return;
    setError(null);
    setGenerating(true);
    try {
      const newTest = await api.generateMockTest(token);
      // Refresh full list so ordering + data is accurate
      const updated = await api.getMockTests(token);
      setTests(updated);
      void newTest; // used above via refresh
    } catch (err: any) {
      setError(err.message || 'Failed to generate test');
    } finally {
      setGenerating(false);
    }
  }

  async function generateTargetedTest() {
    if (!token) return;
    setTargetedError(null);
    setGeneratingTargeted(true);
    try {
      await api.generateTargetedTest(token);
      const updated = await api.getMockTests(token);
      setTests(updated);
    } catch (err: any) {
      setTargetedError(err.message || 'Failed to generate targeted test');
    } finally {
      setGeneratingTargeted(false);
    }
  }

  if (fetching) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Mock Tests</h1>
            <p className="text-muted-foreground">Practice with RMO-level mock tests</p>
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
      {/* ── header ── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Mock Tests</h1>
          <p className="text-muted-foreground">Practice with RMO-level mock tests</p>
        </div>

        <div className="flex flex-col gap-2 sm:items-end">
          {/* Targeted test button */}
          <Button
            variant="default"
            onClick={generateTargetedTest}
            disabled={generatingTargeted || !isAuthenticated}
            className="bg-violet-600 hover:bg-violet-700 text-white"
          >
            <Target className="w-4 h-4 mr-2" />
            {generatingTargeted ? 'Generating…' : 'Generate Targeted Test'}
          </Button>

          {/* Standard test button */}
          <Button
            variant="outline"
            onClick={generateNewTest}
            disabled={generating || !isAuthenticated}
          >
            <FileText className="w-4 h-4 mr-2" />
            {generating ? 'Generating…' : 'Generate Standard Test'}
          </Button>
        </div>
      </div>

      {/* ── targeted test explainer ── */}
      <Card className="border-violet-200 bg-violet-50/50 dark:bg-violet-900/10 dark:border-violet-800">
        <CardContent className="flex items-start gap-3 pt-4 pb-4">
          <Info className="w-4 h-4 text-violet-600 dark:text-violet-400 mt-0.5 shrink-0" />
          <p className="text-sm text-violet-800 dark:text-violet-200">
            <span className="font-semibold">Targeted Tests</span> are personalised to your weak
            domains — weaker areas get more questions and difficulty is calibrated to your current
            level so you build confidence while being challenged. Standard tests use a fixed
            distribution at RMO entry difficulty.
          </p>
        </CardContent>
      </Card>

      {/* ── error banners ── */}
      {error && (
        <p className="text-sm text-destructive rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-2">
          {error}
        </p>
      )}
      {targetedError && (
        <p className="text-sm text-destructive rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-2">
          {targetedError}
        </p>
      )}

      {/* ── tests list ── */}
      <div className="grid gap-4">
        {tests.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center space-y-4">
              <p className="text-muted-foreground">No tests yet.</p>
              <div className="flex justify-center gap-3">
                <Button onClick={generateTargetedTest} disabled={generatingTargeted} className="bg-violet-600 hover:bg-violet-700 text-white">
                  <Target className="w-4 h-4 mr-2" />
                  Generate Targeted Test
                </Button>
                <Button variant="outline" onClick={generateNewTest} disabled={generating}>
                  Generate Standard Test
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          tests.map((test) => (
            <Card
              key={test.test_id}
              className={isTargeted(test) ? 'border-violet-200' : ''}
            >
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <CardTitle className="text-base leading-snug">{formatTestTitle(test.test_type)}</CardTitle>
                    <CardDescription className="mt-0.5">
                      {test.total_questions} questions · Difficulty {test.difficulty_range}
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <TestTypeBadge test={test} />
                    <StatusBadge status={test.status} />
                  </div>
                </div>
              </CardHeader>

              <CardContent className="space-y-4">
                {/* Results block */}
                {test.status === 'completed' && test.grade && (
                  <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3">
                    <h4 className="text-sm font-semibold mb-2 text-green-800">Results</h4>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <span className="text-muted-foreground">Score </span>
                        <span className="font-semibold text-green-700">
                          {test.grade.correct_answers}/{test.grade.total_problems}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Average </span>
                        <span className="font-semibold text-green-700">
                          {test.grade.average_percentage.toFixed(1)}%
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Domain distribution */}
                <div>
                  <h4 className="text-sm font-medium mb-2">Domain Distribution</h4>
                  <div className="flex flex-wrap gap-2">
                    {(() => {
                      const domains = Object.entries(test.domain_distribution)
                        .sort(([, a], [, b]) => b - a); // Sort by count descending
                      const topDomains = domains.slice(0, 5);
                      const remainingCount = domains.length - 5;
                      
                      return (
                        <>
                          {topDomains.map(([domain, count]) => (
                            <Badge
                              key={domain}
                              variant="secondary"
                              className={isTargeted(test) ? 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300' : ''}
                            >
                              {domain}: {count}
                            </Badge>
                          ))}
                          {remainingCount > 0 && (
                            <Badge variant="outline" className="text-muted-foreground">
                              +{remainingCount} more
                            </Badge>
                          )}
                        </>
                      );
                    })()}
                  </div>
                </div>

                {/* CTA */}
                <Button
                  asChild
                  variant={test.status === 'completed' ? 'outline' : 'default'}
                  className={
                    test.status !== 'completed' && isTargeted(test)
                      ? 'bg-violet-600 hover:bg-violet-700 text-white'
                      : ''
                  }
                >
                  <Link to={`/mock-tests/${test.test_id}/take`}>
                    {test.status === 'completed' ? 'View Test' : 'Start Test'}
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
};

export default MockTests;
