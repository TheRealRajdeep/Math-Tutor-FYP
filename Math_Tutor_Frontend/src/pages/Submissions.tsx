import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useEffect, useState } from 'react';
import { api, type GradingResult, type Submission } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const Submissions = () => {
  const { token, isAuthenticated, isLoading: authLoading } = useAuth();
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selected, setSelected] = useState<Submission | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [detailsResults, setDetailsResults] = useState<GradingResult[]>([]);

  useEffect(() => {
    const run = async () => {
      if (authLoading) return;
      if (!isAuthenticated || !token) {
        setSubmissions([]);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError(null);
      try {
        const data = await api.getMySubmissions(token);
        setSubmissions(data);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load submissions');
      } finally {
        setIsLoading(false);
      }
    };

    run();
  }, [authLoading, isAuthenticated, token]);

  const openDetails = async (submission: Submission) => {
    setSelected(submission);
    setDetailsOpen(true);
    setDetailsLoading(true);
    setDetailsError(null);
    setDetailsResults([]);
    try {
      const results = await api.getSubmissionResults(submission.submission_id);
      setDetailsResults(results);
    } catch (e) {
      setDetailsError(e instanceof Error ? e.message : 'Failed to load submission details');
    } finally {
      setDetailsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Submissions</h1>
        <p className="text-muted-foreground">View your test submission history and results</p>
      </div>

      {isLoading ? (
        <Card>
          <CardContent className="py-10 text-center">
            <p className="text-muted-foreground">Loading submissions…</p>
          </CardContent>
        </Card>
      ) : error ? (
        <Card>
          <CardContent className="py-10 text-center space-y-3">
            <p className="text-destructive">{error}</p>
            <Button
              variant="outline"
              onClick={() => {
                setIsLoading(true);
                setError(null);
                api
                  .getMySubmissions(token)
                  .then(setSubmissions)
                  .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load submissions'))
                  .finally(() => setIsLoading(false));
              }}
              disabled={!token}
            >
              Retry
            </Button>
          </CardContent>
        </Card>
      ) : submissions.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center">
            <p className="text-muted-foreground">No submissions yet. Complete a test to see results here.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Submission History</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Test ID</TableHead>
                  <TableHead>Submitted At</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {submissions.map((submission) => (
                  <TableRow key={submission.submission_id}>
                    <TableCell>{submission.test_id}</TableCell>
                    <TableCell>
                      {submission.submitted_at ? new Date(submission.submitted_at).toLocaleString() : '-'}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          submission.status === 'correct'
                            ? 'default'
                            : submission.status === 'partially_correct'
                            ? 'secondary'
                            : submission.status === 'incorrect'
                            ? 'destructive'
                            : 'outline'
                        }
                      >
                        {submission.status}
                      </Badge>
                    </TableCell>
                    <TableCell>-</TableCell>
                    <TableCell>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openDetails(submission)}
                        disabled={submission.status === 'pending'}
                      >
                        View Details
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Dialog
        open={detailsOpen}
        onOpenChange={(open) => {
          setDetailsOpen(open);
          if (!open) {
            setSelected(null);
            setDetailsError(null);
            setDetailsResults([]);
            setDetailsLoading(false);
          }
        }}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {selected ? `Submission #${selected.submission_id}` : 'Submission Details'}
            </DialogTitle>
            <DialogDescription>
              {selected?.submitted_at ? new Date(selected.submitted_at).toLocaleString() : ''}
            </DialogDescription>
          </DialogHeader>

          {detailsLoading ? (
            <p className="text-muted-foreground">Loading details…</p>
          ) : detailsError ? (
            <div className="space-y-3">
              <p className="text-destructive">{detailsError}</p>
              <Button
                variant="outline"
                onClick={() => {
                  if (!selected) return;
                  openDetails(selected);
                }}
              >
                Retry
              </Button>
            </div>
          ) : detailsResults.length === 0 ? (
            <p className="text-muted-foreground">No grading results found for this submission yet.</p>
          ) : (
            <div className="space-y-4 max-h-[60vh] overflow-auto pr-1">
              {detailsResults.map((r) => (
                <Card key={r.problem_id}>
                  <CardHeader className="py-4">
                    <div className="flex items-center justify-between gap-3">
                      <CardTitle className="text-base">Problem {r.problem_id}</CardTitle>
                      <Badge
                        variant={r.verdict === 'correct' ? 'default' : r.verdict === 'partially_correct' ? 'secondary' : 'destructive'}
                      >
                        {r.verdict}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="text-sm text-muted-foreground">
                      Score: {typeof r.percentage === 'number' ? `${Math.round(r.percentage)}%` : '-'}
                    </div>
                    <div className="text-sm whitespace-pre-wrap">
                      {r.hint_provided || r.error_summary || 'No feedback available.'}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailsOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Submissions;

