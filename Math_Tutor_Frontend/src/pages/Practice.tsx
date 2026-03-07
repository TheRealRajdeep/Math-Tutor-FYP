import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import {
  api,
  type PracticeSession,
  type PracticeGradeResult,
  type PracticeSessionSummary,
  type DomainStat,
} from '@/lib/api';
import { renderLaTeXToHTML } from '@/lib/latex';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Target,
  ChevronRight,
  Upload,
  X,
  CheckCircle2,
  XCircle,
  TrendingUp,
  TrendingDown,
  Minus,
  RotateCcw,
  BarChart3,
  Loader2,
  ImagePlus,
  ArrowRight,
  Trophy,
} from 'lucide-react';
import { API_BASE_URL } from '@/lib/constants';

// ─── Domain config ────────────────────────────────────────────────────────────

const DOMAINS = [
  { name: 'Algebra', emoji: '📐', description: 'Equations, polynomials, inequalities' },
  { name: 'Geometry', emoji: '📏', description: 'Angles, triangles, circles, proofs' },
  { name: 'Number Theory', emoji: '🔢', description: 'Divisibility, primes, modular arithmetic' },
  { name: 'Combinatorics', emoji: '🎲', description: 'Counting, permutations, probability' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function strengthBadge(level?: DomainStat['strength_level']) {
  if (!level) return null;
  const map = {
    weak: 'bg-red-100 text-red-700 border-red-200',
    developing: 'bg-amber-100 text-amber-700 border-amber-200',
    strong: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  };
  return (
    <Badge variant="outline" className={`text-xs capitalize ${map[level]}`}>
      {level}
    </Badge>
  );
}

function DifficultyBar({ value, max = 10 }: { value: number; max?: number }) {
  const pct = Math.min(100, (value / max) * 100);
  const color = value <= 4 ? 'bg-emerald-400' : value <= 7 ? 'bg-amber-400' : 'bg-red-400';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-muted rounded-full">
        <div className={`h-1.5 rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-muted-foreground w-6 text-right">{value}</span>
    </div>
  );
}

function DecisionBadge({ decision }: { decision: PracticeGradeResult['decision'] }) {
  if (decision === 'harder')
    return (
      <span className="flex items-center gap-1 text-emerald-600 font-medium text-sm">
        <TrendingUp className="w-4 h-4" /> Stepping up
      </span>
    );
  if (decision === 'easier')
    return (
      <span className="flex items-center gap-1 text-amber-600 font-medium text-sm">
        <TrendingDown className="w-4 h-4" /> Stepping down
      </span>
    );
  return (
    <span className="flex items-center gap-1 text-muted-foreground font-medium text-sm">
      <Minus className="w-4 h-4" /> Same level
    </span>
  );
}

// ─── Sub-views ────────────────────────────────────────────────────────────────

/** Domain picker shown before any session starts */
function DomainSelector({
  domainStats,
  recentSessions,
  onSelect,
  loading,
}: {
  domainStats: Record<string, DomainStat>;
  recentSessions: PracticeSessionSummary[];
  onSelect: (domain: string) => void;
  loading: boolean;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Adaptive Practice</h1>
        <p className="text-muted-foreground mt-1">
          Choose a domain. The AI adjusts difficulty after each problem based on your score.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {DOMAINS.map((d) => {
          const stat = domainStats[d.name];
          return (
            <button
              key={d.name}
              onClick={() => onSelect(d.name)}
              disabled={loading}
              className="text-left border rounded-xl p-5 hover:border-primary hover:bg-primary/5 transition-all group disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{d.emoji}</span>
                  <span className="font-semibold text-lg">{d.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  {stat && strengthBadge(stat.strength_level)}
                  <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                </div>
              </div>
              <p className="text-sm text-muted-foreground mb-3">{d.description}</p>
              {stat ? (
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Avg score</span>
                    <span className="font-medium text-foreground">{stat.avg_score}%</span>
                  </div>
                  <DifficultyBar value={Math.round((stat.avg_score / 100) * 7)} max={7} />
                </div>
              ) : (
                <p className="text-xs text-muted-foreground italic">No history yet</p>
              )}
            </button>
          );
        })}
      </div>

      {recentSessions.length > 0 && (
        <div>
          <h2 className="text-base font-semibold mb-3">Recent Sessions</h2>
          <div className="space-y-2">
            {recentSessions.map((s) => (
              <div
                key={s.session_id}
                className="flex items-center justify-between rounded-lg border px-4 py-3 text-sm"
              >
                <div className="flex items-center gap-3">
                  <Badge variant="outline" className="text-xs">{s.domain}</Badge>
                  <span className="text-muted-foreground">
                    {s.problems_correct}/{s.problems_attempted} correct
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={`font-semibold ${
                      s.accuracy >= 75
                        ? 'text-emerald-600'
                        : s.accuracy >= 50
                        ? 'text-amber-600'
                        : 'text-red-600'
                    }`}
                  >
                    {s.accuracy}%
                  </span>
                  <Badge
                    variant="outline"
                    className={
                      s.status === 'completed'
                        ? 'text-xs bg-muted text-muted-foreground'
                        : 'text-xs bg-primary/10 text-primary'
                    }
                  >
                    {s.status}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Progress strip shown at the top during an active session */
function SessionProgress({
  attempted,
  correct,
  target,
  difficulty,
  domain,
}: {
  attempted: number;
  correct: number;
  target: number;
  difficulty: number;
  domain: string;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-muted/30 px-5 py-3 mb-5">
      <div className="flex items-center gap-3">
        <Badge variant="outline">{domain}</Badge>
        <span className="text-sm text-muted-foreground">
          Problem <span className="font-semibold text-foreground">{attempted + 1}</span> of{' '}
          <span className="font-semibold text-foreground">{target}</span>
        </span>
      </div>
      <div className="flex items-center gap-4">
        <span className="text-sm text-muted-foreground">
          Score:{' '}
          <span className="font-semibold text-foreground">
            {correct}/{attempted}
          </span>
        </span>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Target className="w-3.5 h-3.5" />
          <span>Difficulty</span>
          <span className="font-semibold text-foreground">{difficulty}/10</span>
        </div>
      </div>
      {/* mini progress dots */}
      <div className="flex gap-1.5">
        {Array.from({ length: target }).map((_, i) => (
          <div
            key={i}
            className={`w-2.5 h-2.5 rounded-full transition-colors ${
              i < attempted ? 'bg-primary' : 'bg-muted-foreground/30'
            }`}
          />
        ))}
      </div>
    </div>
  );
}

/** Problem card with image upload */
function ProblemView({
  problem,
  sessionState,
  sessionId,
  mockTestId,
  userId,
  onGraded,
}: {
  problem: NonNullable<PracticeSession['current_problem']>;
  sessionState: PracticeSession['session_state'];
  sessionId: number;
  mockTestId: number;
  userId: string;
  onGraded: (result: PracticeGradeResult) => void;
}) {
  const { token } = useAuth();
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [grading, setGrading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reset file state when problem changes
  useEffect(() => {
    setFiles([]);
    setPreviews([]);
    setError(null);
  }, [problem.problem_id]);

  function handleFiles(newFiles: File[]) {
    const valid = newFiles.filter((f) => f.type.startsWith('image/'));
    setFiles((prev) => [...prev, ...valid]);
    valid.forEach((f) => {
      const reader = new FileReader();
      reader.onload = (e) => setPreviews((prev) => [...prev, e.target?.result as string]);
      reader.readAsDataURL(f);
    });
  }

  function removeFile(idx: number) {
    setFiles((f) => f.filter((_, i) => i !== idx));
    setPreviews((p) => p.filter((_, i) => i !== idx));
  }

  async function handleSubmit() {
    if (!files.length) {
      setError('Upload at least one image of your solution.');
      return;
    }
    setError(null);

    try {
      setUploading(true);
      // Step 1: upload images (reuses existing upload endpoint)
      const formData = new FormData();
      formData.append('test_id', mockTestId.toString());
      formData.append('problem_id', problem.problem_id.toString());
      formData.append('student_id', userId);
      files.forEach((f) => formData.append('image_files', f));

      const uploadRes = await fetch(`${API_BASE_URL}/api/submit_solution`, {
        method: 'POST',
        body: formData,
      });
      if (!uploadRes.ok) throw new Error('Upload failed: ' + (await uploadRes.text()));
      const { submission_id } = await uploadRes.json();

      // Step 2: grade
      setUploading(false);
      setGrading(true);
      const gradeResult = await api.gradePracticeSession(sessionId, submission_id, token);
      onGraded(gradeResult);
    } catch (err: any) {
      setError(err.message || 'Something went wrong');
    } finally {
      setUploading(false);
      setGrading(false);
    }
  }

  const busy = uploading || grading;

  return (
    <div className="space-y-4">
      <SessionProgress
        attempted={sessionState.problems_attempted}
        correct={sessionState.problems_correct}
        target={sessionState.target}
        difficulty={sessionState.current_difficulty}
        domain="Practice"
      />

      {/* Problem card */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Problem</CardTitle>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs">
                Difficulty: {problem.difficulty_level.toFixed(1)}
              </Badge>
              {Array.isArray(problem.domain)
                ? problem.domain.map((d: string) => (
                    <Badge key={d} variant="outline" className="text-xs">{d}</Badge>
                  ))
                : null}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div
            className="prose prose-sm max-w-none text-foreground leading-relaxed"
            dangerouslySetInnerHTML={{ __html: renderLaTeXToHTML(problem.problem) }}
          />
        </CardContent>
      </Card>

      {/* Upload section */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Your Solution</CardTitle>
          <CardDescription>
            Write your solution on paper, photograph it, and upload here.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Drop zone */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={busy}
            className="w-full border-2 border-dashed rounded-lg p-6 flex flex-col items-center gap-2 text-muted-foreground hover:border-primary hover:text-primary transition-colors disabled:opacity-50"
          >
            <ImagePlus className="w-8 h-8" />
            <span className="text-sm font-medium">Click to add images</span>
            <span className="text-xs">JPG, PNG, WEBP supported</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => handleFiles(Array.from(e.target.files || []))}
          />

          {/* Previews */}
          {previews.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {previews.map((src, i) => (
                <div key={i} className="relative group">
                  <img
                    src={src}
                    alt={`Page ${i + 1}`}
                    className="w-full h-32 object-cover rounded-lg border"
                  />
                  <button
                    onClick={() => removeFile(i)}
                    className="absolute top-1 right-1 bg-background/80 rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                  <span className="absolute bottom-1 left-1 text-xs bg-background/80 rounded px-1">
                    p.{i + 1}
                  </span>
                </div>
              ))}
            </div>
          )}

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          <Button
            onClick={handleSubmit}
            disabled={busy || !files.length}
            className="w-full"
          >
            {uploading ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Uploading & reading…</>
            ) : grading ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Grading your work…</>
            ) : (
              <><Upload className="w-4 h-4 mr-2" /> Submit Solution</>
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

/** Result shown after grading a problem */
function ResultView({
  result,
  onNext,
}: {
  result: PracticeGradeResult;
  onNext: () => void;
}) {
  const { score, decision, feedback_message, session_complete, next_problem } = result;
  const pct = score.percentage;

  const scoreColor =
    pct >= 80 ? 'text-emerald-600' : pct >= 50 ? 'text-amber-600' : 'text-red-600';
  const scoreBg =
    pct >= 80 ? 'bg-emerald-50 border-emerald-200' : pct >= 50 ? 'bg-amber-50 border-amber-200' : 'bg-red-50 border-red-200';

  return (
    <div className="space-y-4 max-w-xl mx-auto">
      {/* Score card */}
      <Card className={`border ${scoreBg}`}>
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <div className={`text-5xl font-bold ${scoreColor}`}>{pct}%</div>
            <div>
              {score.is_correct ? (
                <div className="flex items-center gap-1.5 text-emerald-700 font-semibold">
                  <CheckCircle2 className="w-5 h-5" /> Correct answer
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-red-600 font-semibold">
                  <XCircle className="w-5 h-5" /> Incorrect answer
                </div>
              )}
              <p className="text-sm text-muted-foreground mt-0.5">
                Logic score: {Math.round(score.logical_flow_score * 100)}%
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Adaptive feedback */}
      <Card>
        <CardContent className="pt-5 space-y-2">
          <div className="flex items-center justify-between">
            <p className="font-medium">{feedback_message}</p>
            <DecisionBadge decision={decision} />
          </div>
          {score.error_summary && (
            <div className="rounded-lg bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">Error: </span>
              {score.error_summary}
            </div>
          )}
          {score.answer_reasoning && !score.is_correct && (
            <div className="rounded-lg bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">Feedback: </span>
              {score.answer_reasoning}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Action */}
      {session_complete ? (
        <Button onClick={onNext} className="w-full" size="lg">
          <Trophy className="w-4 h-4 mr-2" /> View Session Summary
        </Button>
      ) : next_problem ? (
        <Button onClick={onNext} className="w-full" size="lg">
          Next Problem <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      ) : (
        <Button onClick={onNext} variant="outline" className="w-full" size="lg">
          <RotateCcw className="w-4 h-4 mr-2" /> Try Another Domain
        </Button>
      )}
    </div>
  );
}

/** Session complete summary */
function CompletionView({
  domain,
  attempted,
  correct,
  sessionProblems,
  onRestart,
}: {
  domain: string;
  attempted: number;
  correct: number;
  sessionProblems: PracticeSession['session_state']['session_problems'];
  onRestart: () => void;
}) {
  const accuracy = attempted > 0 ? Math.round((correct / attempted) * 100) : 0;
  const scoreColor =
    accuracy >= 75 ? 'text-emerald-600' : accuracy >= 50 ? 'text-amber-600' : 'text-red-600';

  return (
    <div className="space-y-5 max-w-lg mx-auto text-center">
      <div className="text-5xl">🎯</div>
      <div>
        <h2 className="text-2xl font-bold">Session Complete!</h2>
        <p className="text-muted-foreground mt-1">{domain} · {attempted} problems</p>
      </div>

      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className={`text-5xl font-bold ${scoreColor}`}>{accuracy}%</div>
          <p className="text-muted-foreground">
            <span className="font-semibold text-foreground">{correct}</span> correct out of{' '}
            <span className="font-semibold text-foreground">{attempted}</span>
          </p>

          {sessionProblems && sessionProblems.length > 0 && (
            <div className="space-y-2 text-left mt-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">
                Problem breakdown
              </p>
              {sessionProblems.map((p, i) => (
                <div
                  key={p.problem_id}
                  className="flex items-center justify-between text-sm rounded-lg border px-3 py-2"
                >
                  <span className="text-muted-foreground">Problem {i + 1}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground">
                      Difficulty {p.difficulty}
                    </span>
                    <span
                      className={`font-semibold ${
                        p.score >= 80
                          ? 'text-emerald-600'
                          : p.score >= 50
                          ? 'text-amber-600'
                          : 'text-red-600'
                      }`}
                    >
                      {p.score}%
                    </span>
                    {p.is_correct ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    ) : (
                      <XCircle className="w-4 h-4 text-red-400" />
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex gap-3">
        <Button onClick={onRestart} className="flex-1">
          <RotateCcw className="w-4 h-4 mr-2" /> Practice Again
        </Button>
        <Button variant="outline" asChild className="flex-1">
          <Link to="/progress">
            <BarChart3 className="w-4 h-4 mr-2" /> View Progress
          </Link>
        </Button>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

type PageState = 'select' | 'loading' | 'problem' | 'result' | 'complete';

const Practice = () => {
  const { token, user } = useAuth();
  const [pageState, setPageState] = useState<PageState>('select');
  const [session, setSession] = useState<PracticeSession | null>(null);
  const [gradeResult, setGradeResult] = useState<PracticeGradeResult | null>(null);
  const [domainStats, setDomainStats] = useState<Record<string, DomainStat>>({});
  const [recentSessions, setRecentSessions] = useState<PracticeSessionSummary[]>([]);
  const [startError, setStartError] = useState<string | null>(null);

  // Load analytics + recent sessions on mount
  useEffect(() => {
    if (!token) return;
    api.getAnalyticsProfile(token).then((p) => {
      const map: Record<string, DomainStat> = {};
      p.domains.forEach((d) => { map[d.name] = d; });
      setDomainStats(map);
    }).catch(() => {});

    api.getMySessions(5, token).then(setRecentSessions).catch(() => {});
  }, [token]);

  async function handleDomainSelect(domain: string) {
    if (!token) return;
    setStartError(null);
    setPageState('loading');
    try {
      const s = await api.startPracticeSession(domain, token);
      setSession(s);
      setPageState('problem');
    } catch (err: any) {
      setStartError(err.message || 'Failed to start session');
      setPageState('select');
    }
  }

  function handleGraded(result: PracticeGradeResult) {
    setGradeResult(result);
    setPageState('result');
  }

  function handleNext() {
    if (!gradeResult) return;

    if (gradeResult.session_complete) {
      setPageState('complete');
      return;
    }

    if (gradeResult.next_problem && session) {
      // Advance to next problem: update session state locally
      setSession((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          current_problem: gradeResult.next_problem,
          session_state: {
            ...prev.session_state,
            problems_attempted: gradeResult.problems_attempted,
            problems_correct: gradeResult.problems_correct,
            current_difficulty: gradeResult.next_difficulty,
          },
        };
      });
      setGradeResult(null);
      setPageState('problem');
    } else {
      // No next problem — treat as complete
      setPageState('complete');
    }
  }

  function handleRestart() {
    setSession(null);
    setGradeResult(null);
    setPageState('select');
    // Refresh sessions list
    if (token) {
      api.getMySessions(5, token).then(setRecentSessions).catch(() => {});
    }
  }

  return (
    <div className="max-w-2xl mx-auto py-2">
      {pageState === 'select' && (
        <>
          {startError && (
            <div className="mb-4 rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              {startError}
            </div>
          )}
          <DomainSelector
            domainStats={domainStats}
            recentSessions={recentSessions}
            onSelect={handleDomainSelect}
            loading={false}
          />
        </>
      )}

      {pageState === 'loading' && (
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <Loader2 className="w-10 h-10 animate-spin text-primary" />
          <p className="text-muted-foreground">Setting up your session…</p>
        </div>
      )}

      {pageState === 'problem' && session?.current_problem && (
        <ProblemView
          problem={session.current_problem}
          sessionState={session.session_state}
          sessionId={session.session_id}
          mockTestId={session.mock_test_id}
          userId={user?.id.toString() ?? ''}
          onGraded={handleGraded}
        />
      )}

      {pageState === 'result' && gradeResult && session && (
        <div className="space-y-4">
          <SessionProgress
            attempted={gradeResult.problems_attempted}
            correct={gradeResult.problems_correct}
            target={session.session_state.target}
            difficulty={gradeResult.next_difficulty}
            domain={session.domain}
          />
          <ResultView result={gradeResult} onNext={handleNext} />
        </div>
      )}

      {pageState === 'complete' && session && (
        <CompletionView
          domain={session.domain}
          attempted={gradeResult?.problems_attempted ?? session.session_state.problems_attempted}
          correct={gradeResult?.problems_correct ?? session.session_state.problems_correct}
          sessionProblems={session.session_state.session_problems}
          onRestart={handleRestart}
        />
      )}
    </div>
  );
};

export default Practice;
