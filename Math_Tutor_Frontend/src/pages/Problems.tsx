import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { api, type Problem, type GradingResult } from '@/lib/api';
import { renderLaTeXToHTML } from '@/lib/latex';
import { useAuth } from '@/contexts/AuthContext';
import { CheckCircle2, XCircle, Loader2, Upload } from 'lucide-react';

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
        // If problem_id is present, fetch that specific problem
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

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setSelectedFiles(Array.from(e.target.files));
    }
  };

  const handleSubmitSolution = async () => {
    if (!selectedProblem || !user || selectedFiles.length === 0) return;

    setIsSubmitting(true);
    setSubmissionResult(null);

    try {
      // 1. Submit the solution
      // Note: We need a test_id for submission. For individual practice, the backend likely expects a dummy test ID or we need to adapt the API.
      // Assuming for now we can pass a dummy test ID (e.g. 0) or the backend handles practice mode.
      // If the backend strictly requires a valid test_id, we might need a dedicated endpoint for practice submissions.
      // Let's use a convention for practice submissions, or check if we need to adjust the API call.
      
      // Checking api.ts, submitSolution takes testId. Let's use 0 for now as a placeholder for "Practice Mode" if backend supports it,
      // or we might need to modify the backend to accept nullable test_id.
      // Assuming the backend has a way to handle this, or we might catch an error.
      // Using test_id = 0 for practice problems.
      const submission = await api.submitSolution(
        0, // Dummy test ID for practice
        selectedProblem.problem_id,
        user.id.toString(),
        selectedFiles
      );

      // 2. Poll for grading result or trigger grading immediately
      // The submitSolution returns { submission_id, message }
      
      // Trigger grading (often automatic, but let's be sure)
      await api.gradeSubmission(submission.submission_id);

      // 3. Fetch results
      // Polling loop for results
      let retries = 0;
      const maxRetries = 10;
      const pollInterval = 2000;

      const pollResults = async () => {
        try {
          const results = await api.getSubmissionResults(submission.submission_id);
          if (results && results.length > 0) {
            setSubmissionResult(results[0]);
            setIsSubmitting(false);
          } else if (retries < maxRetries) {
            retries++;
            setTimeout(pollResults, pollInterval);
          } else {
            setIsSubmitting(false);
            // Handle timeout
          }
        } catch (error) {
          console.error("Error fetching results:", error);
          setIsSubmitting(false);
        }
      };

      pollResults();

    } catch (error) {
      console.error('Failed to submit solution:', error);
      setIsSubmitting(false);
    }
  };

  const openSubmissionDialog = (problem: Problem) => {
    setSelectedProblem(problem);
    setSelectedFiles([]);
    setSubmissionResult(null);
    setShowSubmissionDialog(true);
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
      <Dialog open={showSubmissionDialog} onOpenChange={setShowSubmissionDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Submit Solution for Problem #{selectedProblem?.problem_id}</DialogTitle>
            <DialogDescription>
              Upload an image of your handwritten solution. Our AI will grade it and provide feedback.
            </DialogDescription>
          </DialogHeader>

          {!submissionResult ? (
            <div className="space-y-4 py-4">
              <div className="grid w-full max-w-sm items-center gap-1.5">
                <label htmlFor="solution-image" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                  Solution Image
                </label>
                <div className="flex items-center gap-2">
                  <Input 
                    id="solution-image" 
                    type="file" 
                    accept="image/*"
                    onChange={handleFileSelect}
                    disabled={isSubmitting}
                  />
                </div>
                {selectedFiles.length > 0 && (
                  <p className="text-sm text-muted-foreground">
                    Selected: {selectedFiles[0].name}
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-4 py-4">
               <div className={`p-4 rounded-lg border ${
                  submissionResult.answer_is_correct 
                    ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
                    : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
                }`}>
                  <div className="flex items-center gap-2 mb-2">
                    {submissionResult.answer_is_correct ? (
                      <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
                    ) : (
                      <XCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
                    )}
                    <span className={`text-lg font-semibold ${
                      submissionResult.answer_is_correct 
                        ? 'text-green-800 dark:text-green-200'
                        : 'text-red-800 dark:text-red-200'
                    }`}>
                      {submissionResult.answer_is_correct ? 'Correct Answer' : 'Incorrect Answer'}
                    </span>
                  </div>
                  
                  <div className="mt-2 text-sm text-muted-foreground">
                     <span className="font-semibold">Score: </span> {submissionResult.percentage.toFixed(0)}%
                  </div>

                  {submissionResult.error_summary && (
                    <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                      <p className="text-sm font-medium mb-1">Feedback:</p>
                      <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                        {submissionResult.error_summary}
                      </p>
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
              <Button variant="outline" onClick={() => setShowSubmissionDialog(false)}>
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
