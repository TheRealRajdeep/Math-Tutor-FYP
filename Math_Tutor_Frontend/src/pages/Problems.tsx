import { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { api, type Problem, type GradingResult } from '@/lib/api';
import { renderLaTeXToHTML } from '@/lib/latex';
import { useAuth } from '@/contexts/AuthContext';
import { CheckCircle2, XCircle, Loader2, ImagePlus, X } from 'lucide-react';

const Problems = () => {
  const { user } = useAuth();
  const [problems, setProblems] = useState<Problem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedDomain, setSelectedDomain] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Submission state
  const [selectedProblem, setSelectedProblem] = useState<Problem | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionResult, setSubmissionResult] = useState<GradingResult | null>(null);
  const [showSubmissionDialog, setShowSubmissionDialog] = useState(false);

  // Cancellation token: each new submission increments this.
  // Any poll callback that doesn't hold the latest token is silently dropped,
  // preventing stale results from a previous problem from overwriting the current one.
  const activePollId = useRef(0);

  useEffect(() => {
    fetchProblems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDomain]);

  useEffect(() => {
    // Handle scroll to specific problem from query parameter
    const urlParams = new URLSearchParams(window.location.search);
    const problemId = urlParams.get('problem_id');
    if (problemId && problems.length > 0) {
      const targetId = parseInt(problemId, 10);
      const element = document.getElementById(`problem-${targetId}`);
      if (element) {
        setTimeout(() => {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          element.classList.add('ring-2', 'ring-primary', 'ring-offset-2');
          setTimeout(() => {
            element.classList.remove('ring-2', 'ring-primary', 'ring-offset-2');
          }, 3000);
        }, 100);
      }
    }
  }, [problems]);

  const fetchProblems = async () => {
    setLoading(true);
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const problemId = urlParams.get('problem_id');

      if (problemId) {
        const problem = await api.getProblemById(parseInt(problemId));
        setProblems([problem]);
      } else if (selectedDomain === 'all') {
        const data = await api.getProblems(20);
        setProblems(data);
      } else {
        const data = await api.getProblemsByDomain(selectedDomain, 20);
        setProblems(data);
      }
    } catch (error) {
      console.error('Failed to fetch problems:', error);
      // Fallback to loading all problems if specific problem fails
      if (window.location.search.includes('problem_id')) {
        try {
          const data = await api.getProblems(20);
          setProblems(data);
        } catch (e) {
          console.error('Fallback fetch failed:', e);
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files);
      setSelectedFiles((prev) => {
        const existingNames = new Set(prev.map((f) => f.name));
        const deduplicated = newFiles.filter((f) => !existingNames.has(f.name));
        return [...prev, ...deduplicated];
      });
      // Reset input so the same file can be re-added after removal
      e.target.value = '';
    }
  };

  const handleRemoveFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmitSolution = async () => {
    if (!selectedProblem || !user || selectedFiles.length === 0) return;

    // Claim a new poll token; any callbacks from older submissions will see
    // a stale token and exit immediately without touching state.
    const pollToken = ++activePollId.current;
    // Capture the problem_id at submission time so the poll always filters
    // to the correct result even if selectedProblem changes later.
    const submittedProblemId = selectedProblem.problem_id;

    setIsSubmitting(true);
    setSubmissionResult(null);

    try {
      const submission = await api.submitSolution(
        0, // Dummy test ID for practice
        submittedProblemId,
        user.id.toString(),
        selectedFiles
      );

      await api.gradeSubmission(submission.submission_id, submittedProblemId);

      let retries = 0;
      const maxRetries = 10;
      const pollInterval = 2000;

      const pollResults = async () => {
        // Guard: if a newer submission has started, stop this poll immediately.
        if (pollToken !== activePollId.current) return;

        try {
          const results = await api.getSubmissionResults(submission.submission_id);
          if (pollToken !== activePollId.current) return; // check again after await

          // Match by problem_id — the submission_id is reused for practice problems,
          // so there may be stale results for other problems in the same list.
          const matchingResult = results?.find(r => r.problem_id === submittedProblemId);

          if (matchingResult) {
            setSubmissionResult(matchingResult);
            setIsSubmitting(false);
          } else if (retries < maxRetries) {
            retries++;
            setTimeout(pollResults, pollInterval);
          } else {
            setIsSubmitting(false);
          }
        } catch (error) {
          if (pollToken !== activePollId.current) return;
          console.error("Error fetching results:", error);
          setIsSubmitting(false);
        }
      };

      pollResults();

    } catch (error) {
      if (pollToken !== activePollId.current) return;
      console.error('Failed to submit solution:', error);
      setIsSubmitting(false);
    }
  };

  const closeSubmissionDialog = () => {
    // Invalidate any in-flight poll so it can't overwrite state after close.
    activePollId.current++;
    setShowSubmissionDialog(false);
    setSubmissionResult(null);
    setIsSubmitting(false);
  };

  const openSubmissionDialog = (problem: Problem) => {
    // Invalidate any in-flight poll from the previous dialog session.
    activePollId.current++;
    setSelectedProblem(problem);
    setSelectedFiles([]);
    setSubmissionResult(null);
    setIsSubmitting(false);
    setShowSubmissionDialog(true);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const filteredProblems = problems.filter((problem) =>
    (problem.problem || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Problem Practice</h1>
        <p className="text-muted-foreground">Browse and practice math problems by domain</p>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent className="flex gap-4">
          <Input
            placeholder="Search problems..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="max-w-sm"
          />
          <Select value={selectedDomain} onValueChange={setSelectedDomain}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Select domain" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Domains</SelectItem>
              <SelectItem value="Algebra">Algebra</SelectItem>
              <SelectItem value="Number Theory">Number Theory</SelectItem>
              <SelectItem value="Geometry">Geometry</SelectItem>
              <SelectItem value="Combinatorics">Combinatorics</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Problems List */}
      <div className="grid gap-4">
        {loading ? (
          <div>Loading problems...</div>
        ) : filteredProblems.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center">
              <p className="text-muted-foreground">No problems found.</p>
            </CardContent>
          </Card>
        ) : (
          filteredProblems.map((problem) => {
            const rendered = renderLaTeXToHTML(problem.problem || '');

            return (
              <Card key={problem.problem_id} id={`problem-${problem.problem_id}`}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle>Problem #{problem.problem_id}</CardTitle>
                    <Badge>Difficulty: {problem.difficulty_level}</Badge>
                  </div>
                  <CardDescription>
                    <div className="flex gap-2 mt-2">
                      {problem.domain.map((d) => (
                        <Badge key={d} variant="secondary">
                          {d}
                        </Badge>
                      ))}
                    </div>
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="prose max-w-none mb-4">
                    <p
                      className="whitespace-pre-wrap"
                      // eslint-disable-next-line react/no-danger
                      dangerouslySetInnerHTML={{ __html: rendered }}
                    />
                  </div>
                  <Button onClick={() => openSubmissionDialog(problem)}>
                    Submit Solution
                  </Button>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {/* Submission Dialog */}
      <Dialog open={showSubmissionDialog} onOpenChange={(open) => { if (!open) closeSubmissionDialog(); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Submit Solution for Problem #{selectedProblem?.problem_id}</DialogTitle>
            <DialogDescription>
              Upload one or more photos of your handwritten solution. Our AI will grade them and provide feedback.
            </DialogDescription>
          </DialogHeader>

          {!submissionResult ? (
            <div className="space-y-4 py-4">
              {/* Upload area */}
              <div
                className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-muted-foreground/30 p-6 cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-colors"
                onClick={() => !isSubmitting && fileInputRef.current?.click()}
              >
                <ImagePlus className="h-8 w-8 text-muted-foreground" />
                <p className="text-sm font-medium">Click to add photos</p>
                <p className="text-xs text-muted-foreground">JPG, PNG, HEIC, etc. — you can add multiple</p>
                <Input
                  ref={fileInputRef}
                  id="solution-image"
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleFileSelect}
                  disabled={isSubmitting}
                  className="hidden"
                />
              </div>

              {/* Selected files preview */}
              {selectedFiles.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium">{selectedFiles.length} photo{selectedFiles.length > 1 ? 's' : ''} selected</p>
                  <div className="grid grid-cols-3 gap-2">
                    {selectedFiles.map((file, idx) => (
                      <div key={`${file.name}-${idx}`} className="relative group rounded-md overflow-hidden border bg-muted aspect-square">
                        <img
                          src={URL.createObjectURL(file)}
                          alt={`Page ${idx + 1}`}
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
                        <button
                          type="button"
                          onClick={() => handleRemoveFile(idx)}
                          disabled={isSubmitting}
                          className="absolute top-1 right-1 rounded-full bg-black/60 p-0.5 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/80 disabled:cursor-not-allowed"
                          aria-label={`Remove ${file.name}`}
                        >
                          <X className="h-3 w-3" />
                        </button>
                        <span className="absolute bottom-1 left-1 rounded bg-black/50 px-1 text-[10px] text-white leading-4">
                          {idx + 1}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4 py-4">
              <div className={`p-4 rounded-lg border ${submissionResult.answer_is_correct
                ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
                : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
                }`}>
                <div className="flex items-center gap-2 mb-2">
                  {submissionResult.answer_is_correct ? (
                    <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
                  ) : (
                    <XCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
                  )}
                  <span className={`text-lg font-semibold ${submissionResult.answer_is_correct
                    ? 'text-green-800 dark:text-green-200'
                    : 'text-red-800 dark:text-red-200'
                    }`}>
                    {submissionResult.answer_is_correct ? 'Correct Answer' : 'Incorrect Answer'}
                  </span>
                </div>

                <div className="mt-2 text-sm text-muted-foreground">
                  <span className="font-semibold">Score: </span> {submissionResult.percentage.toFixed(0)}%
                </div>

                {(submissionResult.hint_provided || submissionResult.error_summary) && (
                  <div className={`mt-3 pt-3 border-t ${submissionResult.answer_is_correct
                    ? 'border-green-200 dark:border-green-800'
                    : 'border-red-200 dark:border-red-800'
                    }`}>
                    <p className={`text-sm font-semibold mb-2 ${submissionResult.answer_is_correct
                      ? 'text-green-800 dark:text-green-200'
                      : 'text-red-800 dark:text-red-200'
                      }`}>Tutor Feedback:</p>
                    {submissionResult.hint_provided ? (
                      <div className="text-sm text-gray-700 dark:text-gray-300 space-y-2">
                        <ReactMarkdown
                          components={{
                            p: ({ children }) => <p className="my-1 leading-relaxed">{children}</p>,
                            strong: ({ children }) => <strong className="font-semibold text-gray-900 dark:text-gray-100">{children}</strong>,
                            ol: ({ children }) => <ol className="list-decimal list-inside space-y-1 ml-1">{children}</ol>,
                            ul: ({ children }) => <ul className="list-disc list-inside space-y-1 ml-1">{children}</ul>,
                            li: ({ children }) => <li className="leading-relaxed">{children}</li>,
                            h1: ({ children }) => <h1 className="font-semibold text-base text-gray-900 dark:text-gray-100 mt-3 mb-1">{children}</h1>,
                            h2: ({ children }) => <h2 className="font-semibold text-sm text-gray-900 dark:text-gray-100 mt-3 mb-1">{children}</h2>,
                            h3: ({ children }) => <h3 className="font-medium text-sm text-gray-800 dark:text-gray-200 mt-2 mb-1">{children}</h3>,
                          }}
                        >
                          {submissionResult.hint_provided}
                        </ReactMarkdown>
                      </div>
                    ) : (
                      <p className="text-sm text-gray-700 dark:text-gray-300">
                        {submissionResult.error_summary}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          <DialogFooter>
            {!submissionResult ? (
              <Button
                onClick={handleSubmitSolution}
                disabled={selectedFiles.length === 0 || isSubmitting}
              >
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isSubmitting ? 'Grading...' : 'Submit & Check'}
              </Button>
            ) : (
              <Button variant="outline" onClick={closeSubmissionDialog}>
                Close
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Problems;
