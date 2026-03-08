import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { api, type AnalyticsProfile, type DomainStat } from '@/lib/api';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Target,
  CheckCircle2,
  BarChart3,
  AlertCircle,
  Trophy,
  BookOpen,
  FileText,
  Activity,
  Calendar,
  ArrowUpRight,
  ArrowDownRight,
  BrainCircuit,
} from 'lucide-react';
import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  ResponsiveContainer,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Area,
  AreaChart,
} from 'recharts';
import { cn } from '@/lib/utils';

// ─── helpers ────────────────────────────────────────────────────────────────

function strengthColor(level: DomainStat['strength_level']) {
  switch (level) {
    case 'strong':
      return {
        badge: 'bg-emerald-100 text-emerald-700 border-emerald-200',
        bar: '#10b981',
        border: 'border-l-emerald-500',
        bg: 'bg-emerald-50/50',
        text: 'text-emerald-700',
      };
    case 'developing':
      return {
        badge: 'bg-amber-100 text-amber-700 border-amber-200',
        bar: '#f59e0b',
        border: 'border-l-amber-500',
        bg: 'bg-amber-50/50',
        text: 'text-amber-700',
      };
    default:
      return {
        badge: 'bg-red-100 text-red-700 border-red-200',
        bar: '#ef4444',
        border: 'border-l-red-500',
        bg: 'bg-red-50/50',
        text: 'text-red-700',
      };
  }
}

function TrendIcon({ trend }: { trend: DomainStat['trend'] }) {
  if (trend === 'improving')
    return <TrendingUp className="w-4 h-4 text-emerald-500" />;
  if (trend === 'declining')
    return <TrendingDown className="w-4 h-4 text-red-500" />;
  return <Minus className="w-4 h-4 text-muted-foreground" />;
}

// ─── skeleton loader ─────────────────────────────────────────────────────────

function ProfileSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="pt-6">
              <Skeleton className="h-8 w-16 mb-2" />
              <Skeleton className="h-4 w-24" />
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-7">
        <Skeleton className="col-span-4 h-[400px] rounded-xl" />
        <Skeleton className="col-span-3 h-[400px] rounded-xl" />
      </div>
    </div>
  );
}

// ─── empty state ─────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <Card className="flex flex-col items-center justify-center py-20 text-center bg-muted/20 border-dashed">
      <div className="p-4 bg-background rounded-full shadow-sm mb-4">
        <BarChart3 className="w-12 h-12 text-muted-foreground" />
      </div>
      <h3 className="text-xl font-semibold mb-2">No data yet</h3>
      <p className="text-muted-foreground max-w-sm mb-6">
        Complete your first mock test to unlock your personal analytics dashboard.
      </p>
    </Card>
  );
}

// ─── stat card ───────────────────────────────────────────────────────────────

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sub?: string;
  trend?: 'up' | 'down' | 'neutral';
  trendValue?: string;
}

function StatCard({
  icon,
  label,
  value,
  sub,
  trend,
  trendValue,
}: StatCardProps) {
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-6">
        <div className="flex items-center justify-between space-y-0 pb-2">
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
            {icon}
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <div className="text-2xl font-bold">{value}</div>
          <div className="flex items-center text-xs text-muted-foreground">
            {trend && (
              <span
                className={cn(
                  'flex items-center font-medium mr-2',
                  trend === 'up'
                    ? 'text-emerald-500'
                    : trend === 'down'
                    ? 'text-red-500'
                    : 'text-muted-foreground'
                )}
              >
                {trend === 'up' ? (
                  <ArrowUpRight className="h-3 w-3 mr-1" />
                ) : trend === 'down' ? (
                  <ArrowDownRight className="h-3 w-3 mr-1" />
                ) : (
                  <Minus className="h-3 w-3 mr-1" />
                )}
                {trendValue}
              </span>
            )}
            {sub}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── domain card ─────────────────────────────────────────────────────────────

function DomainCard({ domain }: { domain: DomainStat }) {
  const colors = strengthColor(domain.strength_level);
  return (
    <div
      className={cn(
        'group flex flex-col gap-3 rounded-lg border p-4 transition-all hover:shadow-md',
        colors.bg,
        colors.border,
        'border-l-4 bg-opacity-30'
      )}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-sm">{domain.name}</span>
          <TrendIcon trend={domain.trend} />
        </div>
        <Badge variant="outline" className={cn('capitalize', colors.badge)}>
          {domain.strength_level}
        </Badge>
      </div>

      <div className="space-y-1">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Mastery</span>
          <span className="font-medium text-foreground">
            {domain.avg_score}%
          </span>
        </div>
        <div className="h-2 w-full rounded-full bg-background/50 overflow-hidden">
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${domain.avg_score}%`,
              backgroundColor: colors.bar,
            }}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 pt-1 border-t border-border/10">
        <div className="text-xs text-muted-foreground">
          Accuracy:{' '}
          <span className="font-medium text-foreground">
            {domain.accuracy}%
          </span>
        </div>
        <div className="text-xs text-muted-foreground text-right">
          {domain.correct}/{domain.total_attempted} correct
        </div>
      </div>
    </div>
  );
}

// ─── custom charts ───────────────────────────────────────────────────────────

function CustomRadarTick({
  x = 0,
  y = 0,
  payload,
  cx = 0,
  cy = 0,
}: {
  x?: number | string;
  y?: number | string;
  payload?: { value: string };
  cx?: number | string;
  cy?: number | string;
}) {
  const nx = typeof x === 'number' ? x : Number(x) || 0;
  const ny = typeof y === 'number' ? y : Number(y) || 0;
  const ncx = typeof cx === 'number' ? cx : Number(cx) || 0;
  const ncy = typeof cy === 'number' ? cy : Number(cy) || 0;
  const dx = nx - ncx;
  const dy = ny - ncy;
  const anchor = dx > 5 ? 'start' : dx < -5 ? 'end' : 'middle';
  const offsetX = dx > 5 ? 8 : dx < -5 ? -8 : 0;
  const offsetY = dy > 5 ? 12 : dy < -5 ? -8 : 0;
  return (
    <text
      x={nx + offsetX}
      y={ny + offsetY}
      textAnchor={anchor}
      fontSize={10}
      className="fill-muted-foreground font-medium uppercase tracking-wider"
    >
      {payload?.value}
    </text>
  );
}

function BarTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const item = payload[0]?.payload;
  return (
    <div className="bg-background/95 backdrop-blur-sm border rounded-lg px-3 py-2 shadow-lg text-sm z-50">
      <p className="font-semibold mb-1">{label}</p>
      <div className="flex flex-col gap-1 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <Calendar className="w-3 h-3" />
          <span>{item?.date}</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span>Score:</span>
          <span className="font-bold text-primary">{payload[0]?.value}%</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span>Correct:</span>
          <span>
            {item?.correct}/{item?.total}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── main component ──────────────────────────────────────────────────────────

const Progress = () => {
  const { token } = useAuth();
  const [profile, setProfile] = useState<AnalyticsProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      if (!token) return;
      try {
        setLoading(true);
        setError(null);
        const data = await api.getAnalyticsProfile(token);
        setProfile(data);
      } catch (err: any) {
        setError(err.message || 'Failed to load analytics');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [token]);

  const hasData =
    profile &&
    (profile.overall.total_attempted > 0 || profile.domains.length > 0);

  // Radar data normalised to 0–100
  const radarData =
    profile?.domains.map((d) => ({
      domain: d.name.length > 14 ? d.name.slice(0, 13) + '…' : d.name,
      score: d.avg_score,
      fullMark: 100,
    })) ?? [];

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* ── page header ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Analytics</h1>
          <p className="text-muted-foreground mt-1">
            Track your progress, identify weaknesses, and improve your scores.
          </p>
        </div>
      </div>

      {loading && <ProfileSkeleton />}

      {!loading && error && (
        <Card className="flex items-center gap-3 p-6 border-destructive/50 bg-destructive/5">
          <AlertCircle className="w-5 h-5 text-destructive shrink-0" />
          <p className="text-sm text-destructive font-medium">{error}</p>
        </Card>
      )}

      {!loading && !error && !hasData && <EmptyState />}

      {!loading && !error && hasData && profile && (
        <div className="space-y-8">
          {/* ── top stat cards ── */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard
              icon={<Activity className="w-4 h-4" />}
              label="Avg Score"
              value={`${profile.overall.avg_score}%`}
              sub="Across all tests"
              trend={profile.overall.avg_score >= 70 ? 'up' : 'neutral'}
              trendValue={profile.overall.avg_score >= 70 ? 'Good' : 'Average'}
            />
            <StatCard
              icon={<CheckCircle2 className="w-4 h-4" />}
              label="Accuracy"
              value={`${profile.overall.accuracy}%`}
              sub={`${profile.overall.total_correct}/${profile.overall.total_attempted} problems`}
            />
            <StatCard
              icon={<FileText className="w-4 h-4" />}
              label="Tests Completed"
              value={profile.overall.tests_completed}
              sub="Total mock tests"
            />
            <StatCard
              icon={<BookOpen className="w-4 h-4" />}
              label="Problems Solved"
              value={profile.overall.total_attempted}
              sub="Total problems"
            />
          </div>

          <Tabs defaultValue="overview" className="space-y-6">
            <TabsList className="grid w-full grid-cols-3 lg:w-[400px]">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="performance">Performance</TabsTrigger>
              <TabsTrigger value="history">History</TabsTrigger>
            </TabsList>

            {/* ── tab 1: overview ── */}
            <TabsContent value="overview" className="space-y-6">
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-7">
                {/* Main Chart */}
                <Card className="col-span-4">
                  <CardHeader>
                    <CardTitle>Score History</CardTitle>
                    <CardDescription>
                      Your average score over the last 10 tests.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="pl-2">
                    {profile.test_history.length === 0 ? (
                      <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                        No test history available.
                      </div>
                    ) : (
                      <ResponsiveContainer width="100%" height={300}>
                        <AreaChart
                          data={profile.test_history}
                          margin={{
                            top: 10,
                            right: 30,
                            left: 0,
                            bottom: 0,
                          }}
                        >
                          <defs>
                            <linearGradient
                              id="colorScore"
                              x1="0"
                              y1="0"
                              x2="0"
                              y2="1"
                            >
                              <stop
                                offset="5%"
                                stopColor="#6366f1"
                                stopOpacity={0.3}
                              />
                              <stop
                                offset="95%"
                                stopColor="#6366f1"
                                stopOpacity={0}
                              />
                            </linearGradient>
                          </defs>
                          <CartesianGrid
                            strokeDasharray="3 3"
                            vertical={false}
                            stroke="#e5e7eb"
                          />
                          <XAxis
                            dataKey="label"
                            tickLine={false}
                            axisLine={false}
                            tick={{ fontSize: 12, fill: '#6b7280' }}
                            dy={10}
                          />
                          <YAxis
                            tickLine={false}
                            axisLine={false}
                            tick={{ fontSize: 12, fill: '#6b7280' }}
                            tickFormatter={(value) => `${value}%`}
                            domain={[0, 100]}
                          />
                          <Tooltip content={<BarTooltip />} />
                          <Area
                            type="monotone"
                            dataKey="avg_score"
                            stroke="#6366f1"
                            strokeWidth={2}
                            fillOpacity={1}
                            fill="url(#colorScore)"
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    )}
                  </CardContent>
                </Card>

                {/* Radar Chart */}
                <Card className="col-span-3">
                  <CardHeader>
                    <CardTitle>Skill Radar</CardTitle>
                    <CardDescription>
                      Performance across different domains.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {radarData.length === 0 ? (
                      <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                        No domain data available.
                      </div>
                    ) : (
                      <div className="h-[300px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <RadarChart
                            cx="50%"
                            cy="50%"
                            outerRadius="70%"
                            data={radarData}
                          >
                            <PolarGrid stroke="#e5e7eb" />
                            <PolarAngleAxis
                              dataKey="domain"
                              tick={(props) => <CustomRadarTick {...props} />}
                            />
                            <Radar
                              name="Score"
                              dataKey="score"
                              stroke="#8b5cf6"
                              fill="#8b5cf6"
                              fillOpacity={0.3}
                            />
                            <Tooltip />
                          </RadarChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Recent Activity & Focus Areas */}
              <div className="grid gap-6 md:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <BrainCircuit className="w-5 h-5 text-primary" />
                      Focus Areas
                    </CardTitle>
                    <CardDescription>
                      Domains that need more attention based on your performance.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {profile.domains.filter(
                      (d) => d.strength_level !== 'strong'
                    ).length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-8 text-center">
                        <Trophy className="w-12 h-12 text-emerald-500 mb-2" />
                        <p className="font-medium text-emerald-700">
                          Great job! You're performing well in all areas.
                        </p>
                      </div>
                    ) : (
                      profile.domains
                        .filter((d) => d.strength_level !== 'strong')
                        .sort((a, b) => a.avg_score - b.avg_score)
                        .slice(0, 3)
                        .map((d) => (
                          <div
                            key={d.name}
                            className="flex items-center justify-between p-3 rounded-lg border bg-muted/40"
                          >
                            <div className="space-y-1">
                              <p className="font-medium text-sm">{d.name}</p>
                              <div className="text-xs text-muted-foreground">
                                Score: {d.avg_score}%
                              </div>
                            </div>
                            <Badge
                              variant="outline"
                              className={
                                d.strength_level === 'weak'
                                  ? 'border-red-200 text-red-700 bg-red-50'
                                  : 'border-amber-200 text-amber-700 bg-amber-50'
                              }
                            >
                              {d.strength_level}
                            </Badge>
                          </div>
                        ))
                    )}
                    {profile.recent_error_themes.length > 0 && (
                      <div className="pt-4 border-t">
                        <p className="text-sm font-medium mb-3">
                          Common Error Patterns
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {profile.recent_error_themes.map((theme, i) => (
                            <Badge
                              key={i}
                              variant="secondary"
                              className="text-xs"
                            >
                              {theme}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Target className="w-5 h-5 text-primary" />
                      Strongest Domains
                    </CardTitle>
                    <CardDescription>
                      Areas where you are excelling.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {profile.domains.filter((d) => d.strength_level === 'strong')
                      .length === 0 ? (
                      <div className="py-8 text-center text-muted-foreground text-sm">
                        Keep practicing to build your strengths!
                      </div>
                    ) : (
                      profile.domains
                        .filter((d) => d.strength_level === 'strong')
                        .sort((a, b) => b.avg_score - a.avg_score)
                        .slice(0, 3)
                        .map((d) => (
                          <div
                            key={d.name}
                            className="flex items-center justify-between p-3 rounded-lg border border-emerald-100 bg-emerald-50/30"
                          >
                            <div className="space-y-1">
                              <p className="font-medium text-sm">{d.name}</p>
                              <div className="text-xs text-muted-foreground">
                                Score: {d.avg_score}%
                              </div>
                            </div>
                            <Badge
                              variant="outline"
                              className="border-emerald-200 text-emerald-700 bg-emerald-50"
                            >
                              Strong
                            </Badge>
                          </div>
                        ))
                    )}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* ── tab 2: performance ── */}
            <TabsContent value="performance" className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {profile.domains.map((d) => (
                  <DomainCard key={d.name} domain={d} />
                ))}
              </div>
            </TabsContent>

            {/* ── tab 3: history ── */}
            <TabsContent value="history" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Detailed Test History</CardTitle>
                  <CardDescription>
                    Review your past test performance.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="rounded-md border">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/50 transition-colors">
                          <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">
                            Test Name
                          </th>
                          <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">
                            Date
                          </th>
                          <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">
                            Type
                          </th>
                          <th className="h-12 px-4 text-right align-middle font-medium text-muted-foreground">
                            Score
                          </th>
                          <th className="h-12 px-4 text-right align-middle font-medium text-muted-foreground">
                            Status
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {profile.test_history.length === 0 ? (
                          <tr>
                            <td
                              colSpan={5}
                              className="p-4 text-center text-muted-foreground"
                            >
                              No tests found.
                            </td>
                          </tr>
                        ) : (
                          profile.test_history.map((t) => (
                            <tr
                              key={t.test_id}
                              className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted"
                            >
                              <td className="p-4 align-middle font-medium">
                                {t.label}
                              </td>
                              <td className="p-4 align-middle text-muted-foreground">
                                {t.date || '—'}
                              </td>
                              <td className="p-4 align-middle">
                                <Badge variant="secondary" className="text-xs">
                                  {t.test_type}
                                </Badge>
                              </td>
                              <td className="p-4 align-middle text-right">
                                <span
                                  className={cn(
                                    'font-bold',
                                    t.avg_score >= 70
                                      ? 'text-emerald-600'
                                      : t.avg_score >= 50
                                      ? 'text-amber-600'
                                      : 'text-red-600'
                                  )}
                                >
                                  {t.avg_score}%
                                </span>
                              </td>
                              <td className="p-4 align-middle text-right">
                                <Badge variant="outline">Completed</Badge>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      )}
    </div>
  );
};

export default Progress;
