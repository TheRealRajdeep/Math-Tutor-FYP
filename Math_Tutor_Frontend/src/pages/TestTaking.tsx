import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { api, type Problem, type MockTest, type GradingResult } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';

// KaTeX
import * as katex from 'katex';
import 'katex/dist/katex.min.css';

/**
 * Escape HTML to avoid XSS when rendering non-math text
 */
const escapeHtml = (s: string) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/**
 * Process plain-text chunk and convert simple BBCode [b]...[/b] into <strong>...</strong>
 * while escaping the rest.
 */
function processPlainChunk(text: string) {
  if (!text) return '';
  const BOLD_RE = /\[b\]([\s\S]*?)\[\/b\]/gi;
  let html = '';
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = BOLD_RE.exec(text)) !== null) {
    const before = text.slice(lastIndex, m.index);
    if (before) html += escapeHtml(before).replace(/\r?\n/g, '<br/>');
    const inner = m[1] ?? '';
    html += `<strong>${escapeHtml(inner)}</strong>`;
    lastIndex = BOLD_RE.lastIndex;
  }
  const rest = text.slice(lastIndex);
  if (rest) html += escapeHtml(rest).replace(/\r?\n/g, '<br/>');
  return html;
}

/**
 * Convert a whole string that contains mixed plain text and LaTeX math
 * into safe HTML where math parts are rendered with KaTeX and plain text
 * is escaped. Handles:
 *  - $$...$$ (display)
 *  - \[...\] (display)
 *  - $...$ (inline)
 *  - \(...\) (inline)
 *  - \begin{...}...\end{...} (treated as display)
 *
 * If KaTeX output contains an error span, we fallback to escaped raw LaTeX.
 * Also includes a small macros map (e.g. \minus -> -) to handle common non-standard tokens.
 */
function renderLaTeXToHTML(input: string): string {
  if (!input) return '';

  const MATH_REGEX = /(\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\\\([\s\S]+?\\\)|\$[^$\n]+\$|\\begin\{[^\}]+\}[\s\S]*?\\end\{[^\}]+\})/g;

  // macros map: add anything your dataset commonly uses but KaTeX doesn't know.
  const katexOptionsBase = {
    throwOnError: false,
    macros: {
      '\\minus': '-',
      // add more mappings if your dataset uses them frequently
    } as Record<string, string>,
  };

  let html = '';
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = MATH_REGEX.exec(input)) !== null) {
    const before = input.slice(lastIndex, match.index);
    if (before) {
      html += processPlainChunk(before);
    }

    const token = match[0];
    let inner = token;
    let displayMode = false;

    if (token.startsWith('$$') && token.endsWith('$$')) {
      inner = token.slice(2, -2);
      displayMode = true;
    } else if (token.startsWith('\\[') && token.endsWith('\\]')) {
      inner = token.slice(2, -2);
      displayMode = true;
    } else if (token.startsWith('\\(') && token.endsWith('\\)')) {
      inner = token.slice(2, -2);
      displayMode = false;
    } else if (token.startsWith('$') && token.endsWith('$')) {
      inner = token.slice(1, -1);
      displayMode = false;
    } else if (token.startsWith('\\begin')) {
      // keep begin...end block as-is. KaTeX can render many environments.
      inner = token;
      displayMode = true;
    }

    // Try to render with KaTeX. If KaTeX output contains an error span, fallback to escaped text.
    try {
      const rendered = katex.renderToString(inner, { ...katexOptionsBase, displayMode });
      // if KaTeX included an error, it returns a span with class `katex-error`
      if (rendered.includes('katex-error')) {
        // fallback: show escaped raw LaTeX (no red)
        html += `<span>${escapeHtml(inner)}</span>`;
      } else {
        html += rendered;
      }
    } catch (e) {
      // worst case: KaTeX threw; fallback to escaped inner
      html += `<span>${escapeHtml(inner)}</span>`;
    }

    lastIndex = MATH_REGEX.lastIndex;
  }

  const rest = input.slice(lastIndex);
  if (rest) html += processPlainChunk(rest);

  return html;
}

const TestTaking = () => {
  const { testId } = useParams<{ testId: string }>();
  const navigate = useNavigate();
  const { token, user } = useAuth();
  const [test, setTest] = useState<MockTest | null>(null);
  const [currentProblemIndex, setCurrentProblemIndex] = useState(0);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submittedProblems, setSubmittedProblems] = useState<Set<number>>(new Set());
  const [submittingTest, setSubmittingTest] = useState(false);
  const [gradingResults, setGradingResults] = useState<Map<number, GradingResult>>(new Map());
  const [loadingResults, setLoadingResults] = useState(false);

  useEffect(() => {
    const fetchTest = async () => {
      if (!testId || !token) {
        return;
      }

      try {
        // Fetch all tests and find the one matching testId
        const allTests = await api.getMockTests(token);
        const foundTest = allTests.find(t => t.test_id === parseInt(testId));
        
        if (foundTest) {
          setTest(foundTest);
          
          // If test is completed, fetch grading results
          if (foundTest.status === 'completed') {
            setLoadingResults(true);
            try {
              const results = await api.getTestResults(parseInt(testId), token);
              const resultsMap = new Map<number, GradingResult>();
              results.forEach(result => {
                resultsMap.set(result.problem_id, result);
              });
              setGradingResults(resultsMap);
            } catch (error) {
              console.error('Failed to load grading results:', error);
            } finally {
              setLoadingResults(false);
            }
          }
        } else {
          console.error('Test not found');
          // Optionally navigate back or show error
        }
      } catch (error) {
        console.error('Failed to load test:', error);
      }
    };
    fetchTest();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [testId, token]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setSelectedFiles(Array.from(e.target.files));
    }
  };

  const handleSubmit = async () => {
    if (!testId || !test || selectedFiles.length === 0 || !user) return;

    setSubmitting(true);
    try {
      const studentId = `${user.id}`;
      await api.submitSolution(
        parseInt(testId),
        test.problems[currentProblemIndex].problem_id,
        studentId,
        selectedFiles
      );

      // Mark this problem as submitted
      setSubmittedProblems((prev) => new Set(prev).add(test.problems[currentProblemIndex].problem_id));

      // Move to next problem or finish
      if (currentProblemIndex < test.problems.length - 1) {
        setCurrentProblemIndex((prev) => prev + 1);
        setSelectedFiles([]);
      } else {
        // All problems submitted, show message
        setSelectedFiles([]);
      }
    } catch (error) {
      console.error('Failed to submit:', error);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitTest = async () => {
    if (!testId || !test || !token) return;

    setSubmittingTest(true);
    try {
      await api.submitTest(parseInt(testId), token);
      // Navigate back to mock tests page to see results
      navigate('/mock-tests');
    } catch (error) {
      console.error('Failed to submit test:', error);
      alert('Failed to submit test. Please try again.');
    } finally {
      setSubmittingTest(false);
    }
  };

  const handleEarlySubmit = async () => {
    if (!testId || !test || !token) return;

    const unsubmittedCount = test.problems.length - submittedProblems.size;
    const confirmMessage = unsubmittedCount > 0
      ? `You have ${unsubmittedCount} unsubmitted problem(s). Are you sure you want to submit the test early?`
      : 'Are you sure you want to submit the test?';

    if (window.confirm(confirmMessage)) {
      setSubmittingTest(true);
      try {
        await api.submitTest(parseInt(testId), token);
        // Navigate back to mock tests page to see results
        navigate('/mock-tests');
      } catch (error) {
        console.error('Failed to submit test:', error);
        alert('Failed to submit test. Please try again.');
      } finally {
        setSubmittingTest(false);
      }
    }
  };

  if (!test) {
    return <div>Loading test...</div>;
  }

  const allProblemsSubmitted = test.problems.every(p => submittedProblems.has(p.problem_id));
  const currentProblem = test.problems[currentProblemIndex];
  const isCurrentProblemSubmitted = submittedProblems.has(currentProblem.problem_id);
  const isTestCompleted = test.status === 'completed';
  const currentProblemResult = gradingResults.get(currentProblem.problem_id);

  const unsubmittedCount = test.problems.length - submittedProblems.size;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Test Taking</h1>
          <p className="text-muted-foreground">
            Problem {currentProblemIndex + 1} of {test.problems.length}
          </p>
        </div>
        {test.status !== 'completed' && (
          <Button
            variant="outline"
            onClick={handleEarlySubmit}
            disabled={submittingTest}
            className="border-orange-500 text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-900/20"
          >
            {submittingTest ? 'Submitting...' : 'Early Submit Test'}
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Problem Navigator */}
        <div className="lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle>Problems</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {test.problems.map((problem, index) => (
                  <button
                    type="button"
                    key={problem.problem_id}
                    onClick={() => setCurrentProblemIndex(index)}
                    className={`w-full text-left p-3 rounded transition ${
                      index === currentProblemIndex
                        ? 'bg-primary text-primary-foreground'
                        : 'hover:bg-accent'
                    }`}
                  >
                <div className="flex items-center justify-between">
                  <span className="font-medium">Problem {index + 1}</span>
                  <div className="flex items-center gap-2">
                    {isTestCompleted && gradingResults.has(problem.problem_id) && (
                      <Badge 
                        variant={gradingResults.get(problem.problem_id)?.answer_is_correct ? "default" : "destructive"}
                        className={`text-xs ${gradingResults.get(problem.problem_id)?.answer_is_correct ? "bg-green-600" : "bg-red-600"}`}
                      >
                        {gradingResults.get(problem.problem_id)?.answer_is_correct ? "✓" : "✗"}
                      </Badge>
                    )}
                    {!isTestCompleted && submittedProblems.has(problem.problem_id) && (
                      <Badge variant="secondary" className="text-xs">Submitted</Badge>
                    )}
                  </div>
                </div>

                    {/* <div className="flex gap-1 mt-2 flex-wrap">
                      {problem.domain.map((d) => (
                        <Badge key={d} variant="secondary" className="text-xs">
                          {d}
                        </Badge>
                      ))}
                    </div> */}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Problem Area */}
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Problem {currentProblemIndex + 1}</CardTitle>
                <Badge>Difficulty: {currentProblem.difficulty_level}</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="prose max-w-none mb-6">
                {/* render mixed text + LaTeX safely */}
                <div
                  className="whitespace-pre-wrap"
                  // eslint-disable-next-line react/no-danger
                  dangerouslySetInnerHTML={{ __html: renderLaTeXToHTML(currentProblem.problem || '') }}
                />
              </div>

              <div className="space-y-4">
                {/* Show grading results if test is completed */}
                {isTestCompleted && currentProblemResult && (
                  <div className={`p-4 rounded-lg border ${
                    currentProblemResult.answer_is_correct 
                      ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
                      : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
                  }`}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`text-lg font-semibold ${
                        currentProblemResult.answer_is_correct 
                          ? 'text-green-800 dark:text-green-200'
                          : 'text-red-800 dark:text-red-200'
                      }`}>
                        {currentProblemResult.answer_is_correct ? '✓ Correct' : '✗ Incorrect'}
                      </span>
                      <Badge variant="secondary" className="text-xs">
                        Score: {currentProblemResult.percentage.toFixed(1)}%
                      </Badge>
                    </div>
                    {currentProblemResult.error_summary && (
                      <div className="mt-3">
                        <p className="text-sm font-medium mb-1 text-gray-800 dark:text-gray-200">AI Feedback:</p>
                        <div className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                          {currentProblemResult.error_summary}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Show submission UI only if test is not completed */}
                {!isTestCompleted && (
                  <>
                    {allProblemsSubmitted && (
                      <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                        <p className="text-sm font-medium text-green-800 dark:text-green-200 mb-2">
                          All problems submitted! You can now submit the test.
                        </p>
                        <Button 
                          onClick={handleSubmitTest} 
                          disabled={submittingTest}
                          className="w-full bg-green-600 hover:bg-green-700"
                        >
                          {submittingTest ? 'Submitting Test...' : 'Submit Test'}
                        </Button>
                      </div>
                    )}
                    {!allProblemsSubmitted && unsubmittedCount > 0 && (
                      <div className="p-4 bg-orange-50 dark:bg-orange-900/20 rounded-lg border border-orange-200 dark:border-orange-800">
                        <p className="text-sm font-medium text-orange-800 dark:text-orange-200 mb-2">
                          {unsubmittedCount} problem(s) remaining. You can submit the test early if needed.
                        </p>
                      </div>
                    )}
                    
                    <div>
                      <label className="text-sm font-medium mb-2 block">Upload Solution Images</label>
                      <Input type="file" multiple accept="image/*" onChange={handleFileSelect} disabled={isCurrentProblemSubmitted} />
                      {selectedFiles.length > 0 && (
                        <p className="text-sm text-muted-foreground mt-2">
                          {selectedFiles.length} file(s) selected
                        </p>
                      )}
                      {isCurrentProblemSubmitted && (
                        <p className="text-sm text-green-600 dark:text-green-400 mt-2">
                          ✓ Solution submitted for this problem
                        </p>
                      )}
                    </div>

                    <div className="flex gap-2">
                      <Button 
                        onClick={handleSubmit} 
                        disabled={selectedFiles.length === 0 || submitting || isCurrentProblemSubmitted}
                      >
                        {submitting ? 'Submitting...' : isCurrentProblemSubmitted ? 'Already Submitted' : 'Submit Solution'}
                      </Button>
                      {currentProblemIndex > 0 && (
                        <Button variant="outline" onClick={() => setCurrentProblemIndex((prev) => prev - 1)}>
                          Previous
                        </Button>
                      )}
                      {currentProblemIndex < test.problems.length - 1 && (
                        <Button variant="outline" onClick={() => setCurrentProblemIndex((prev) => prev + 1)}>
                          Next
                        </Button>
                      )}
                    </div>
                  </>
                )}

                {/* Show message if test is completed but no result for this problem */}
                {isTestCompleted && !currentProblemResult && !loadingResults && (
                  <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
                    <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                      No grading results available for this problem. It may not have been submitted.
                    </p>
                  </div>
                )}

                {loadingResults && (
                  <div className="p-4 text-center">
                    <p className="text-sm text-muted-foreground">Loading grading results...</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default TestTaking;
