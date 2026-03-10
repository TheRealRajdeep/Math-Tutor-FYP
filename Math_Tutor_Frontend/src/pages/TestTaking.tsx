import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { api, type MockTest, type GradingResult } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { ImagePlus, X, CheckCircle2, XCircle, AlertCircle } from 'lucide-react';

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
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
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

  // Clear selected files when switching to a different problem
  useEffect(() => {
    setSelectedFiles([]);
  }, [currentProblemIndex]);

  // Create object URLs for previews and revoke on cleanup
  useEffect(() => {
    const urls = selectedFiles.map((f) => URL.createObjectURL(f));
    setPreviewUrls(urls);
    return () => {
      urls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [selectedFiles]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files).filter((f) => f.type.startsWith('image/'));
      setSelectedFiles((prev) => {
        const existingNames = new Set(prev.map((f) => f.name));
        const deduplicated = newFiles.filter((f) => !existingNames.has(f.name));
        return [...prev, ...deduplicated];
      });
      e.target.value = '';
    }
  };

  const handleRemoveFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (!testId || !test || selectedFiles.length === 0 || !user) return;

    const currentProblemId = test.problems[currentProblemIndex].problem_id;
    const isResubmission = submittedProblems.has(currentProblemId);

    setSubmitting(true);
    try {
      const studentId = `${user.id}`;
      await api.submitSolution(
        parseInt(testId),
        currentProblemId,
        studentId,
        selectedFiles
      );

      // Mark this problem as submitted
      setSubmittedProblems((prev) => new Set(prev).add(currentProblemId));
      setSelectedFiles([]);

      // Only auto-advance to next problem on first-time submission
      if (!isResubmission && currentProblemIndex < test.problems.length - 1) {
        setCurrentProblemIndex((prev) => prev + 1);
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

      if (test.test_type === 'RMO Entry Mock Test') {
        navigate('/curriculum');
      } else {
        navigate('/mock-tests');
      }
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
                    className={`w-full text-left p-3 rounded transition ${index === currentProblemIndex
                        ? 'bg-primary text-primary-foreground'
                        : 'hover:bg-accent'
                      }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium">Problem {index + 1}</span>
                      <div className="flex items-center gap-2">
                        {isTestCompleted && gradingResults.has(problem.problem_id) && (() => {
                          const r = gradingResults.get(problem.problem_id)!;
                          const v = r.verdict ?? (r.percentage >= 90 ? 'correct' : r.percentage >= 50 ? 'partially_correct' : 'incorrect');
                          if (v === 'correct') return (
                            <Badge className="text-xs bg-green-600">✓</Badge>
                          );
                          if (v === 'partially_correct') return (
                            <Badge className="text-xs bg-amber-500">~</Badge>
                          );
                          return <Badge variant="destructive" className="text-xs">✗</Badge>;
                        })()}
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
                {isTestCompleted && currentProblemResult && (() => {
                  const r = currentProblemResult;
                  const verdict = r.verdict ?? (r.percentage >= 90 ? 'correct' : r.percentage >= 50 ? 'partially_correct' : 'incorrect');
                  const config = {
                    correct: {
                      bg: 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800',
                      textColor: 'text-green-800 dark:text-green-200',
                      feedbackBg: 'bg-green-50/50 dark:bg-green-900/10 border-green-100 dark:border-green-800',
                      feedbackText: 'text-green-900/80 dark:text-green-200',
                      icon: <CheckCircle2 className="w-5 h-5 inline mr-1" />,
                      label: 'Correct',
                    },
                    partially_correct: {
                      bg: 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800',
                      textColor: 'text-amber-800 dark:text-amber-200',
                      feedbackBg: 'bg-amber-50/50 dark:bg-amber-900/10 border-amber-100 dark:border-amber-800',
                      feedbackText: 'text-amber-900/80 dark:text-amber-200',
                      icon: <AlertCircle className="w-5 h-5 inline mr-1" />,
                      label: 'Partially Correct',
                    },
                    incorrect: {
                      bg: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800',
                      textColor: 'text-red-800 dark:text-red-200',
                      feedbackBg: 'bg-muted/50 border-muted',
                      feedbackText: 'text-muted-foreground',
                      icon: <XCircle className="w-5 h-5 inline mr-1" />,
                      label: 'Incorrect',
                    },
                  } as const;
                  const cfg = config[verdict];
                  return (
                    <div className={`p-4 rounded-lg border space-y-3 ${cfg.bg}`}>
                      <div className="flex items-center gap-2">
                        <span className={`text-lg font-semibold ${cfg.textColor}`}>
                          {cfg.icon}{cfg.label}
                        </span>
                        <Badge variant="secondary" className="text-xs">
                          Score: {r.percentage.toFixed(1)}%
                        </Badge>
                      </div>

                      {/* Error / logic summary for non-perfect answers */}
                      {r.error_summary && verdict !== 'correct' && (
                        <div>
                          <p className="text-sm font-medium mb-1 text-gray-800 dark:text-gray-200">Error detected:</p>
                          <div className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                            {r.error_summary}
                          </div>
                        </div>
                      )}

                      {/* AI Tutor feedback */}
                      {r.hint_provided && (
                        <div className={`rounded-lg border p-3 ${cfg.feedbackBg}`}>
                          <p className="text-xs font-medium uppercase tracking-wide mb-2 text-gray-600 dark:text-gray-400">
                            AI Tutor Feedback
                          </p>
                          <div className={`text-sm whitespace-pre-wrap leading-relaxed ${cfg.feedbackText}`}>
                            {r.hint_provided}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}

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

                    <div className="space-y-3">
                      <label className="text-sm font-medium block">Upload Solution Images</label>
                      {isCurrentProblemSubmitted && (
                        <p className="text-sm text-green-600 dark:text-green-400">
                          ✓ Solution already submitted — upload new images below to replace it
                        </p>
                      )}
                      <div
                        className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-muted-foreground/30 p-6 cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-colors"
                        onClick={() => fileInputRef.current?.click()}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            fileInputRef.current?.click();
                          }
                        }}
                        role="button"
                        tabIndex={0}
                        aria-label="Add solution photos"
                      >
                        <ImagePlus className="h-8 w-8 text-muted-foreground" />
                        <p className="text-sm font-medium">Click to add photos</p>
                        <p className="text-xs text-muted-foreground">JPG, PNG, HEIC, etc. — you can add multiple</p>
                        <Input
                          ref={fileInputRef}
                          type="file"
                          accept="image/*"
                          multiple
                          onChange={handleFileSelect}
                          className="hidden"
                        />
                      </div>
                      {selectedFiles.length > 0 && (
                        <div className="space-y-2">
                          <p className="text-sm font-medium">
                            {selectedFiles.length} photo{selectedFiles.length !== 1 ? 's' : ''} selected
                          </p>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            {selectedFiles.map((file, idx) => (
                              <div
                                key={`${file.name}-${idx}`}
                                className="relative group rounded-md overflow-hidden border bg-muted aspect-square"
                              >
                                <img
                                  src={previewUrls[idx]}
                                  alt={`Page ${idx + 1}`}
                                  className="w-full h-full object-cover"
                                />
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleRemoveFile(idx);
                                  }}
                                  className="absolute top-1 right-1 rounded-full bg-black/60 p-0.5 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/80"
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

                    <div className="flex gap-2">
                      <Button
                        onClick={handleSubmit}
                        disabled={selectedFiles.length === 0 || submitting}
                      >
                        {submitting
                          ? 'Submitting...'
                          : isCurrentProblemSubmitted
                          ? 'Re-submit Solution'
                          : 'Submit Solution'}
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
