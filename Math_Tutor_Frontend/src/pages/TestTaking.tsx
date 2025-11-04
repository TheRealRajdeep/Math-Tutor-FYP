import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { api, type Problem, type MockTest } from '@/lib/api';

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
  const [test, setTest] = useState<MockTest | null>(null);
  const [currentProblemIndex, setCurrentProblemIndex] = useState(0);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const fetchTest = async () => {
      if (testId) {
        try {
          // TODO: Fetch test details from API
          // For now, we'll generate a new test if needed
          // In production, you'd fetch the test by ID
          const newTest = await api.generateMockTest();
          setTest(newTest);
        } catch (error) {
          console.error('Failed to load test:', error);
        }
      }
    };
    fetchTest();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [testId]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setSelectedFiles(Array.from(e.target.files));
    }
  };

  const handleSubmit = async () => {
    if (!testId || !test || selectedFiles.length === 0) return;

    setSubmitting(true);
    try {
      const studentId = 'student_1'; // TODO: Get from auth context
      await api.submitSolution(
        parseInt(testId),
        test.problems[currentProblemIndex].problem_id,
        studentId,
        selectedFiles
      );

      // Move to next problem or finish
      if (currentProblemIndex < test.problems.length - 1) {
        setCurrentProblemIndex((prev) => prev + 1);
        setSelectedFiles([]);
      } else {
        navigate('/submissions');
      }
    } catch (error) {
      console.error('Failed to submit:', error);
    } finally {
      setSubmitting(false);
    }
  };

  if (!test) {
    return <div>Loading test...</div>;
  }

  const currentProblem = test.problems[currentProblemIndex];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Test Taking</h1>
        <p className="text-muted-foreground">
          Problem {currentProblemIndex + 1} of {test.problems.length}
        </p>
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
                <div>
                  <label className="text-sm font-medium mb-2 block">Upload Solution Images</label>
                  <Input type="file" multiple accept="image/*" onChange={handleFileSelect} />
                  {selectedFiles.length > 0 && (
                    <p className="text-sm text-muted-foreground mt-2">
                      {selectedFiles.length} file(s) selected
                    </p>
                  )}
                </div>

                <div className="flex gap-2">
                  <Button onClick={handleSubmit} disabled={selectedFiles.length === 0 || submitting}>
                    {submitting ? 'Submitting...' : 'Submit Solution'}
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
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default TestTaking;
