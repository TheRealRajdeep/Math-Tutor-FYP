import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import {
  api,
  type TeachingSession,
  type AdvanceResponse,
  type StepEvaluation,
  type TeachingSessionSummary,
  type LessonStepType,
  type StepOverview,
} from '@/lib/api';
import { renderLaTeXToHTML } from '@/lib/latex';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import {
  CheckCircle2,
  Circle,
  XCircle,
  Lightbulb,
  Loader2,
  ChevronRight,
  RotateCcw,
  GraduationCap,
  BookOpen,
  BarChart3,
  Dumbbell,
  Sparkles,
  AlertCircle,
} from 'lucide-react';

// ─── constants ────────────────────────────────────────────────────────────────

const DOMAINS = ['Algebra', 'Geometry', 'Number Theory', 'Combinatorics'];

const STEP_TYPE_META: Record<LessonStepType, { label: string; color: string; icon: React.ReactNode }> = {
  intro:      { label: 'Intro',      color: 'bg-blue-100 text-blue-700',    icon: <BookOpen className="w-3.5 h-3.5" /> },
  example:    { label: 'Example',    color: 'bg-violet-100 text-violet-700', icon: <Sparkles className="w-3.5 h-3.5" /> },
  practice:   { label: 'Practice',   color: 'bg-amber-100 text-amber-700',   icon: <Dumbbell className="w-3.5 h-3.5" /> },
  checkpoint: { label: 'Checkpoint', color: 'bg-red-100 text-red-700',       icon: <GraduationCap className="w-3.5 h-3.5" /> },
  summary:    { label: 'Summary',    color: 'bg-emerald-100 text-emerald-700', icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
};

// ─── helpers ──────────────────────────────────────────────────────────────────

function StepTypeBadge({ type }: { type: LessonStepType }) {
  const m = STEP_TYPE_META[type] ?? STEP_TYPE_META.intro;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${m.color}`}>
      {m.icon} {m.label}
    </span>
  );
}

function RenderedContent({ text }: { text: string }) {
  return (
    <div
      className="prose prose-sm max-w-none text-foreground leading-relaxed [&_.katex-display]:my-3"
      dangerouslySetInnerHTML={{ __html: renderLaTeXToHTML(text) }}
    />
  );
}

// ─── Step map sidebar ─────────────────────────────────────────────────────────

function StepMap({
  overview,
  currentIdx,
}: {
  overview: StepOverview[];
  currentIdx: number;
}) {
  return (
    <div className="space-y-1">
      {overview.map((s) => {
        const isCurrent  = s.step_index === currentIdx;
        const isDone     = s.status === 'completed';
        const isSkipped  = s.status === 'skipped';
        const meta       = STEP_TYPE_META[s.type] ?? STEP_TYPE_META.intro;

        return (
          <div
            key={s.step_index}
            className={`flex items-start gap-2.5 rounded-lg px-3 py-2.5 transition-colors ${
              isCurrent  ? 'bg-primary/10 border border-primary/30' :
              isDone     ? 'text-muted-foreground'                  :
              isSkipped  ? 'text-muted-foreground/50'               :
              'text-muted-foreground/70'
            }`}
          >
            <span className="mt-0.5 shrink-0">
              {isDone    ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> :
               isSkipped ? <XCircle      className="w-4 h-4 text-muted-foreground/40" /> :
               isCurrent ? <div className="w-4 h-4 rounded-full border-2 border-primary bg-primary/20" /> :
                           <Circle className="w-4 h-4" />}
            </span>
            <div className="min-w-0">
              <div className={`text-xs font-medium leading-snug ${isCurrent ? 'text-foreground' : ''}`}>
                {s.title}
              </div>
              <div className="mt-0.5">
                <span className={`inline-flex items-center gap-1 text-[10px] rounded px-1.5 py-0.5 ${meta.color}`}>
                  {meta.label}
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Step content area ────────────────────────────────────────────────────────

interface StepPanelProps {
  session: TeachingSession;
  advancing: boolean;
  evaluation: StepEvaluation | null;
  reexplanation: string | null;
  onAdvance: (response: string) => void;
}

function StepPanel({ session, advancing, evaluation, reexplanation, onAdvance }: StepPanelProps) {
  const [answer, setAnswer] = useState('');
  const step = session.current_step;
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Reset answer when step changes
  useEffect(() => { setAnswer(''); }, [step?.step_index]);

  if (!step) return null;

  const interactive = step.type === 'practice' || step.type === 'checkpoint';
  const showContinue = !interactive || (evaluation?.is_correct);
  const showRetry    = interactive && evaluation && !evaluation.is_correct;

  return (
    <div className="space-y-4">
      {/* Step header */}
      <div className="flex items-center gap-2 flex-wrap">
        <StepTypeBadge type={step.type} />
        <span className="text-xs text-muted-foreground">
          Step {step.step_index + 1} of {session.total_steps}
        </span>
      </div>

      <h2 className="text-xl font-bold">{step.title}</h2>

      {/* Main content */}
      <Card>
        <CardContent className="pt-5 pb-5">
          <RenderedContent text={step.content} />
        </CardContent>
      </Card>

      {/* Re-explanation (shown after failed attempt) */}
      {reexplanation && (
        <Card className="border-amber-200 bg-amber-50/40">
          <CardHeader className="pb-2 pt-4">
            <CardTitle className="text-sm flex items-center gap-2 text-amber-700">
              <Lightbulb className="w-4 h-4" /> Let's look at it differently
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-4">
            <RenderedContent text={reexplanation} />
          </CardContent>
        </Card>
      )}

      {/* Practice / Checkpoint question */}
      {interactive && (
        <Card className={step.type === 'checkpoint' ? 'border-red-200' : 'border-amber-200'}>
          <CardHeader className="pb-2 pt-4">
            <CardTitle className="text-sm">
              {step.type === 'checkpoint' ? '🎯 Checkpoint Question' : '✏️ Practice Question'}
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-4 space-y-3">
            <RenderedContent text={step.question ?? ''} />

            {/* Evaluation feedback */}
            {evaluation && (
              <div className={`rounded-lg border px-4 py-3 text-sm space-y-1 ${
                evaluation.is_correct
                  ? 'bg-emerald-50 border-emerald-200'
                  : 'bg-red-50 border-red-200'
              }`}>
                <div className="flex items-center gap-2 font-medium">
                  {evaluation.is_correct
                    ? <><CheckCircle2 className="w-4 h-4 text-emerald-600" /> Correct!</>
                    : <><XCircle className="w-4 h-4 text-red-500" /> Not quite</>}
                </div>
                <p className="text-muted-foreground">{evaluation.feedback}</p>
                {evaluation.hint && (
                  <p className="text-amber-700">
                    <span className="font-medium">Hint: </span>{evaluation.hint}
                  </p>
                )}
              </div>
            )}

            {/* Answer textarea — show only if not yet correct */}
            {!evaluation?.is_correct && (
              <div className="space-y-2">
                <Textarea
                  ref={textareaRef}
                  placeholder="Write your answer here…"
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  className="min-h-[80px] resize-none"
                  disabled={advancing}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && e.ctrlKey) {
                      e.preventDefault();
                      if (answer.trim() && !advancing) onAdvance(answer);
                    }
                  }}
                />
                <p className="text-xs text-muted-foreground">Ctrl+Enter to submit</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Action buttons */}
      <div className="flex gap-3">
        {showRetry && (
          <Button
            variant="outline"
            onClick={() => { setAnswer(''); textareaRef.current?.focus(); }}
            disabled={advancing}
            className="flex-1"
          >
            <RotateCcw className="w-4 h-4 mr-2" /> Try again
          </Button>
        )}

        {interactive && !evaluation?.is_correct && (
          <Button
            onClick={() => onAdvance(answer)}
            disabled={advancing || !answer.trim()}
            className="flex-1"
          >
            {advancing
              ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Evaluating…</>
              : <>Submit Answer <ChevronRight className="w-4 h-4 ml-1" /></>}
          </Button>
        )}

        {showContinue && (
          <Button
            onClick={() => onAdvance('')}
            disabled={advancing}
            className="flex-1"
          >
            {advancing
              ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Loading…</>
              : step.type === 'summary'
              ? <><CheckCircle2 className="w-4 h-4 mr-2" /> Finish Lesson</>
              : <>Continue <ChevronRight className="w-4 h-4 ml-1" /></>}
          </Button>
        )}
      </div>
    </div>
  );
}

// ─── Completion screen ────────────────────────────────────────────────────────

function CompletionView({
  session,
  onRestart,
}: {
  session: TeachingSession;
  onRestart: () => void;
}) {
  const done    = session.steps_overview.filter((s) => s.status === 'completed').length;
  const skipped = session.steps_overview.filter((s) => s.status === 'skipped').length;

  return (
    <div className="max-w-lg mx-auto text-center space-y-6">
      <div className="text-5xl">🎓</div>
      <div>
        <h2 className="text-2xl font-bold">Lesson Complete!</h2>
        <p className="text-muted-foreground mt-1">{session.topic}</p>
      </div>

      <Card>
        <CardContent className="pt-5 pb-5 space-y-3">
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-2xl font-bold text-emerald-600">{done}</p>
              <p className="text-xs text-muted-foreground">Steps mastered</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-amber-500">{skipped}</p>
              <p className="text-xs text-muted-foreground">Steps to revisit</p>
            </div>
            <div>
              <p className="text-2xl font-bold">{session.total_steps}</p>
              <p className="text-xs text-muted-foreground">Total steps</p>
            </div>
          </div>

          {skipped > 0 && (
            <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
              <Lightbulb className="w-4 h-4 inline mr-1" />
              Some steps were auto-advanced. Consider revisiting this topic or trying the practice section.
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex gap-3">
        <Button onClick={onRestart} className="flex-1">
          <RotateCcw className="w-4 h-4 mr-2" /> Learn Another Topic
        </Button>
        <Button variant="outline" asChild className="flex-1">
          <Link to="/practice">
            <Dumbbell className="w-4 h-4 mr-2" /> Practice Now
          </Link>
        </Button>
        <Button variant="outline" asChild className="flex-1">
          <Link to="/progress">
            <BarChart3 className="w-4 h-4 mr-2" /> Progress
          </Link>
        </Button>
      </div>
    </div>
  );
}

// ─── Topic selector ───────────────────────────────────────────────────────────

function TopicSelector({
  suggestions,
  recentSessions,
  onStart,
  loading,
  error,
}: {
  suggestions: Record<string, string[]>;
  recentSessions: TeachingSessionSummary[];
  onStart: (topic: string, domain: string) => void;
  loading: boolean;
  error: string | null;
}) {
  const [selectedDomain, setSelectedDomain] = useState('Algebra');
  const [customTopic, setCustomTopic] = useState('');
  const [pickedTopic, setPickedTopic] = useState('');

  const domainTopics = suggestions[selectedDomain] ?? [];
  const activeTopic  = pickedTopic || customTopic;

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-3xl font-bold">AI Topic Teacher</h1>
        <p className="text-muted-foreground mt-1">
          Pick a topic and the AI will build a personalised lesson — from concept
          introduction through worked examples to a checkpoint problem.
        </p>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      {/* Domain tabs */}
      <div className="flex flex-wrap gap-2">
        {DOMAINS.map((d) => (
          <button
            key={d}
            onClick={() => { setSelectedDomain(d); setPickedTopic(''); }}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              selectedDomain === d
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            }`}
          >
            {d}
          </button>
        ))}
      </div>

      {/* Suggested topics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {domainTopics.map((t) => (
          <button
            key={t}
            onClick={() => { setPickedTopic(t); setCustomTopic(''); }}
            className={`text-left rounded-lg border px-4 py-3 text-sm transition-colors ${
              pickedTopic === t
                ? 'border-primary bg-primary/5 font-medium'
                : 'hover:border-primary/50 hover:bg-muted/50'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Custom topic input */}
      <div className="space-y-1.5">
        <p className="text-sm font-medium text-muted-foreground">Or enter your own topic:</p>
        <input
          type="text"
          value={customTopic}
          onChange={(e) => { setCustomTopic(e.target.value); setPickedTopic(''); }}
          placeholder="e.g. Barycentric Coordinates, Muirhead's Inequality…"
          className="w-full rounded-lg border bg-background px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
      </div>

      <Button
        size="lg"
        disabled={loading || !activeTopic.trim()}
        onClick={() => onStart(activeTopic.trim(), selectedDomain)}
        className="w-full sm:w-auto"
      >
        {loading
          ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Generating lesson…</>
          : <><GraduationCap className="w-4 h-4 mr-2" /> Start Lesson</>}
      </Button>

      {/* Recent sessions */}
      {recentSessions.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-semibold">Recent Lessons</p>
          <div className="space-y-1.5">
            {recentSessions.slice(0, 4).map((s) => (
              <div
                key={s.session_id}
                className="flex items-center justify-between rounded-lg border px-4 py-2.5 text-sm"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Badge variant="outline" className="text-xs shrink-0">{s.domain}</Badge>
                  <span className="truncate font-medium">{s.topic}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {s.completed
                    ? <Badge className="bg-emerald-600 text-white text-xs">Done</Badge>
                    : <Badge variant="outline" className="text-xs text-primary border-primary/30">
                        Step {s.current_step + 1}/{s.total_steps}
                      </Badge>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Active lesson layout ─────────────────────────────────────────────────────

function LessonLayout({
  session,
  advancing,
  evaluation,
  reexplanation,
  onAdvance,
}: {
  session: TeachingSession;
  advancing: boolean;
  evaluation: StepEvaluation | null;
  reexplanation: string | null;
  onAdvance: (response: string) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      {/* Header strip */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold">{session.topic}</h1>
          <p className="text-sm text-muted-foreground">{session.domain}</p>
        </div>
        {/* Mobile progress dots */}
        <div className="flex gap-1.5 lg:hidden">
          {session.steps_overview.map((s) => (
            <div
              key={s.step_index}
              className={`w-2 h-2 rounded-full ${
                s.status === 'completed' ? 'bg-emerald-500' :
                s.step_index === session.current_step_index ? 'bg-primary' :
                'bg-muted-foreground/30'
              }`}
            />
          ))}
        </div>
      </div>

      <div className="flex gap-6">
        {/* Step map — hidden on mobile */}
        <aside className="hidden lg:block w-60 shrink-0">
          <div className="sticky top-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3 px-3">
              Lesson Map
            </p>
            <StepMap overview={session.steps_overview} currentIdx={session.current_step_index} />
          </div>
        </aside>

        {/* Main step content */}
        <main className="flex-1 min-w-0">
          {session.current_step ? (
            <StepPanel
              session={session}
              advancing={advancing}
              evaluation={evaluation}
              reexplanation={reexplanation}
              onAdvance={onAdvance}
            />
          ) : (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

type PageState = 'select' | 'generating' | 'lesson' | 'complete';

const Teaching = () => {
  const { token } = useAuth();
  const [searchParams] = useSearchParams();

  const [pageState, setPageState]       = useState<PageState>('select');
  const [session, setSession]           = useState<TeachingSession | null>(null);
  const [advancing, setAdvancing]       = useState(false);
  const [evaluation, setEvaluation]     = useState<StepEvaluation | null>(null);
  const [reexplanation, setReexplanation] = useState<string | null>(null);
  const [suggestions, setSuggestions]   = useState<Record<string, string[]>>({});
  const [recentSessions, setRecentSessions] = useState<TeachingSessionSummary[]>([]);
  const [startError, setStartError]     = useState<string | null>(null);

  // Load topic suggestions + recent sessions on mount
  useEffect(() => {
    api.getTopicSuggestions().then(setSuggestions).catch(() => {});
    if (token) api.getTeachingSessions(8, token).then(setRecentSessions).catch(() => {});
  }, [token]);

  // Support ?topic=...&domain=... query params (for cross-pillar links)
  useEffect(() => {
    const topic  = searchParams.get('topic');
    const domain = searchParams.get('domain');
    if (topic && domain && token) {
      handleStart(topic, domain);
    }
  }, [token]);

  async function handleStart(topic: string, domain: string) {
    if (!token) return;
    setStartError(null);
    setPageState('generating');
    try {
      const s = await api.startTeachingSession(topic, domain, token);
      setSession(s);
      setEvaluation(null);
      setReexplanation(null);
      setPageState('lesson');
    } catch (err: any) {
      setStartError(err.message || 'Failed to generate lesson');
      setPageState('select');
    }
  }

  async function handleAdvance(studentResponse: string) {
    if (!session || !token) return;
    setAdvancing(true);
    setEvaluation(null);
    setReexplanation(null);

    try {
      const result: AdvanceResponse = await api.advanceTeachingSession(
        session.session_id,
        studentResponse,
        token,
      );

      if (result.session_complete) {
        // Fetch final session state then show completion
        const final = await api.getTeachingSession(session.session_id, token);
        setSession(final);
        setPageState('complete');
        return;
      }

      if (result.step_result === 'failed') {
        // Student got it wrong — stay on same step, show evaluation + re-explanation
        setEvaluation(result.evaluation);
        setReexplanation(result.reexplanation);
        // Refresh session to reflect updated retry_count
        const updated = await api.getTeachingSession(session.session_id, token);
        setSession(updated);
      } else {
        // Advance: update session with new current step
        setEvaluation(result.step_result === 'passed' ? result.evaluation : null);
        const updated = await api.getTeachingSession(session.session_id, token);
        setSession(updated);
      }
    } catch (err: any) {
      setStartError(err.message || 'Something went wrong');
    } finally {
      setAdvancing(false);
    }
  }

  function handleRestart() {
    setSession(null);
    setEvaluation(null);
    setReexplanation(null);
    setStartError(null);
    setPageState('select');
    if (token) api.getTeachingSessions(8, token).then(setRecentSessions).catch(() => {});
  }

  return (
    <div className="space-y-4">
      {pageState === 'select' && (
        <TopicSelector
          suggestions={suggestions}
          recentSessions={recentSessions}
          onStart={handleStart}
          loading={false}
          error={startError}
        />
      )}

      {pageState === 'generating' && (
        <div className="flex flex-col items-center justify-center py-32 gap-4">
          <Loader2 className="w-10 h-10 animate-spin text-primary" />
          <p className="text-muted-foreground font-medium">Building your personalised lesson…</p>
          <p className="text-xs text-muted-foreground">This may take 10–20 seconds</p>
        </div>
      )}

      {pageState === 'lesson' && session && (
        <LessonLayout
          session={session}
          advancing={advancing}
          evaluation={evaluation}
          reexplanation={reexplanation}
          onAdvance={handleAdvance}
        />
      )}

      {pageState === 'complete' && session && (
        <CompletionView session={session} onRestart={handleRestart} />
      )}
    </div>
  );
};

export default Teaching;
