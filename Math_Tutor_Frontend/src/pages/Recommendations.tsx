import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { api, type RecommendationsResponse, type DomainRecommendation, type RecommendedResource } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ExternalLink,
  CheckCircle2,
  Lightbulb,
  RefreshCw,
  AlertCircle,
  BookOpen,
  Sparkles,
} from 'lucide-react';

// ─── helpers ──────────────────────────────────────────────────────────────────

const TYPE_COLORS: Record<string, string> = {
  video:       'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-300 dark:border-red-800',
  article:     'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-800',
  practice:    'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-800',
  cheat_sheet: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800',
};

const STRENGTH_COLORS: Record<string, string> = {
  weak:       'border-l-red-500 bg-red-50/30 dark:bg-red-900/10',
  developing: 'border-l-amber-500 bg-amber-50/30 dark:bg-amber-900/10',
  strong:     'border-l-emerald-500 bg-emerald-50/30 dark:bg-emerald-900/10',
};

const STRENGTH_BADGE: Record<string, string> = {
  weak:       'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800',
  developing: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800',
  strong:     'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800',
};

function ScoreBar({ score }: { score: number }) {
  const color = score >= 75 ? 'bg-emerald-500 dark:bg-emerald-400' : score >= 50 ? 'bg-amber-500 dark:bg-amber-400' : 'bg-red-500 dark:bg-red-400';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-xs text-muted-foreground w-8 text-right font-medium">{score}%</span>
    </div>
  );
}

// ─── Resource card ────────────────────────────────────────────────────────────

function ResourceCard({
  resource,
  onComplete,
  completing,
}: {
  resource: RecommendedResource;
  onComplete: (id: number) => void;
  completing: boolean;
}) {
  const typeColor = TYPE_COLORS[resource.type] ?? 'bg-muted text-muted-foreground';

  return (
    <div
      className={`flex flex-col gap-3 rounded-lg border p-4 transition-all ${
        resource.is_completed 
          ? 'bg-muted/30 border-muted opacity-70' 
          : 'bg-card hover:border-primary/30 hover:shadow-sm'
      }`}
    >
      {/* top row */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2 min-w-0">
          <span className="text-lg shrink-0">{resource.icon}</span>
          <div className="min-w-0">
            <p className="font-medium text-sm leading-snug truncate">{resource.title}</p>
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
              {resource.description}
            </p>
          </div>
        </div>
        <Badge
          variant="outline"
          className={`text-xs capitalize shrink-0 ${typeColor}`}
        >
          {resource.type.replace('_', ' ')}
        </Badge>
      </div>

      {/* actions */}
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          asChild
          className="h-7 text-xs px-2"
        >
          <a href={resource.url} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="w-3 h-3 mr-1" /> Open
          </a>
        </Button>

        {resource.is_completed ? (
          <span className="flex items-center gap-1 text-xs text-emerald-600 font-medium">
            <CheckCircle2 className="w-3.5 h-3.5" /> Done
          </span>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs px-2 text-muted-foreground hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
            onClick={() => onComplete(resource.recommendation_id)}
            disabled={completing}
          >
            <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Mark done
          </Button>
        )}
      </div>
    </div>
  );
}

// ─── Domain section ───────────────────────────────────────────────────────────

function DomainSection({
  domain,
  onComplete,
  completingId,
}: {
  domain: DomainRecommendation;
  onComplete: (id: number) => void;
  completingId: number | null;
}) {
  const borderBg = STRENGTH_COLORS[domain.strength_level] ?? '';
  const badgeColor = STRENGTH_BADGE[domain.strength_level] ?? '';

  return (
    <Card className={`border-l-4 ${borderBg}`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 min-w-0">
            <CardTitle className="text-lg truncate">{domain.domain}</CardTitle>
            <Badge variant="outline" className={`text-xs capitalize shrink-0 ${badgeColor}`}>
              {domain.strength_level}
            </Badge>
          </div>
          <div className="flex flex-col items-end gap-1 min-w-[120px] shrink-0">
            <span className="text-xs text-muted-foreground">Avg score</span>
            <ScoreBar score={domain.avg_score} />
          </div>
        </div>

        {/* Error themes */}
        {domain.error_themes.length > 0 && (
          <div className="min-w-0 space-y-1.5 mt-2">
            {domain.error_themes.map((t, i) => (
              <div
                key={i}
                className="text-xs bg-red-50 text-red-700 border border-red-200 dark:bg-red-900/20 dark:text-red-300 dark:border-red-800 rounded-md px-3 py-2 line-clamp-2 wrap-break-word"
                title={t}
              >
                {t}
              </div>
            ))}
          </div>
        )}
      </CardHeader>

      <CardContent className="space-y-4">
        {/* AI study tip */}
        {domain.study_tip && (
          <div className="flex gap-3 rounded-lg bg-primary/5 border border-primary/20 px-4 py-3 dark:bg-primary/10 dark:border-primary/30 min-w-0">
            <Sparkles className="w-4 h-4 text-primary mt-0.5 shrink-0" />
            <div className="min-w-0" title={domain.study_tip}>
              <p className="text-xs font-semibold text-primary mb-1">AI Study Tip</p>
              <p className="text-sm text-foreground/80 leading-relaxed line-clamp-4 wrap-break-word">{domain.study_tip}</p>
            </div>
          </div>
        )}

        {/* Resources */}
        {domain.resources.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">
            All resources for this domain are completed — great work!
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {domain.resources.map((r) => (
              <ResourceCard
                key={r.recommendation_id}
                resource={r}
                onComplete={onComplete}
                completing={completingId === r.recommendation_id}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2].map((i) => (
        <Card key={i} className="border-l-4 border-l-muted">
          <CardHeader>
            <Skeleton className="h-6 w-36" />
            <Skeleton className="h-3 w-full mt-2" />
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3">
              {[1, 2, 3, 4].map((j) => (
                <Skeleton key={j} className="h-24 w-full rounded-lg" />
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

const Recommendations = () => {
  const { token } = useAuth();
  const [data, setData] = useState<RecommendationsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [completingId, setCompletingId] = useState<number | null>(null);

  async function load(showRefreshSpinner = false) {
    if (!token) return;
    setError(null);
    if (showRefreshSpinner) setRefreshing(true);
    else setLoading(true);
    try {
      const result = await api.getRecommendations(3, token);
      setData(result);
    } catch (err: any) {
      setError(err.message || 'Failed to load recommendations');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => { load(); }, [token]);

  async function handleComplete(recommendationId: number) {
    if (!token) return;
    setCompletingId(recommendationId);
    try {
      await api.completeRecommendation(recommendationId, token);
      // Optimistically update local state
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          weak_domains: prev.weak_domains.map((d) => ({
            ...d,
            resources: d.resources.map((r) =>
              r.recommendation_id === recommendationId
                ? { ...r, is_completed: true }
                : r
            ),
          })),
        };
      });
    } catch (err: any) {
      setError(err.message || 'Failed to mark as complete');
    } finally {
      setCompletingId(null);
    }
  }

  const totalResources = data?.weak_domains.reduce((s, d) => s + d.resources.length, 0) ?? 0;
  const completedResources = data?.weak_domains.reduce(
    (s, d) => s + d.resources.filter((r) => r.is_completed).length, 0
  ) ?? 0;

  return (
    <div className="space-y-6">
      {/* ── header ── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold">Resources & Recommendations</h1>
          <p className="text-muted-foreground mt-1">
            Curated resources personalised to your weak areas, with AI study tips.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => load(true)}
          disabled={refreshing || loading}
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* ── progress bar ── */}
      {data && totalResources > 0 && (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="flex items-center justify-between gap-4 pt-4 pb-4">
            <div className="flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium">
                {completedResources} / {totalResources} resources completed
              </span>
            </div>
            <div className="flex-1 max-w-xs h-2 bg-primary/20 rounded-full dark:bg-primary/30">
              <div
                className="h-2 bg-primary rounded-full transition-all"
                style={{ width: totalResources ? `${(completedResources / totalResources) * 100}%` : '0%' }}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── error ── */}
      {error && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="flex items-center gap-3 pt-4">
            <AlertCircle className="w-4 h-4 text-destructive shrink-0" />
            <p className="text-sm text-destructive">{error}</p>
          </CardContent>
        </Card>
      )}

      {/* ── loading ── */}
      {loading && <LoadingSkeleton />}

      {/* ── all complete ── */}
      {!loading && !error && data?.all_completed && (
        <Card className="text-center py-16">
          <CardContent>
            <div className="text-4xl mb-4">🎉</div>
            <h3 className="text-xl font-semibold mb-2">All caught up!</h3>
            <p className="text-muted-foreground mb-4">
              You've completed all current recommendations. Keep practising to unlock more.
            </p>
            <Button onClick={() => load(true)} variant="outline">
              <RefreshCw className="w-4 h-4 mr-2" /> Check for new resources
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ── domain sections ── */}
      {!loading && !error && data && !data.all_completed && (
        <>
          {/* info banner */}
          <Card className="border-amber-200 bg-amber-50/40 dark:bg-amber-900/10 dark:border-amber-800">
            <CardContent className="flex items-start gap-3 pt-4 pb-4">
              <Lightbulb className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
              <p className="text-sm text-amber-800 dark:text-amber-200">
                Resources are selected based on your weakest domains and specific error patterns
                from your graded tests. Mark resources as done after you've studied them — the
                next refresh will suggest new ones.
              </p>
            </CardContent>
          </Card>

          <div className="space-y-5">
            {data.weak_domains
              .filter((d) => d.resources.length > 0 || d.study_tip)
              .map((domain) => (
                <DomainSection
                  key={domain.domain}
                  domain={domain}
                  onComplete={handleComplete}
                  completingId={completingId}
                />
              ))}
          </div>
        </>
      )}
    </div>
  );
};

export default Recommendations;
