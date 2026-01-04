import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { GraduationCap, Calendar, AlertCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface CurriculumSelection {
  has_selection: boolean;
  selection_id?: number;
  duration_months?: number;
  start_date?: string;
  end_date?: string;
  selected_at?: string;
  progress?: {
    days_elapsed: number;
    days_remaining: number;
    total_days: number;
    progress_percentage: number;
  };
}

const Curriculum = () => {
  const { token } = useAuth();
  const [selection, setSelection] = useState<CurriculumSelection | null>(null);
  const [loading, setLoading] = useState(true);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [selectedDuration, setSelectedDuration] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchSelection();
  }, []);

  const fetchSelection = async () => {
    if (!token) return;

    try {
      setLoading(true);
      const data = await api.getMyCurriculumSelection(token);
      setSelection(data);
      setError(null);
    } catch (err: any) {
      console.error('Failed to fetch curriculum selection', err);
      setError(err.message || 'Failed to load curriculum selection');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectPlan = (durationMonths: number) => {
    setSelectedDuration(durationMonths);
    setShowConfirmDialog(true);
  };

  const confirmSelection = async () => {
    if (!token || !selectedDuration) return;

    try {
      setError(null);
      await api.selectCurriculum(selectedDuration, token);
      setShowConfirmDialog(false);
      setSelectedDuration(null);
      await fetchSelection();
    } catch (err: any) {
      console.error('Failed to select curriculum', err);
      setError(err.message || 'Failed to select curriculum plan');
      setShowConfirmDialog(false);
    }
  };

  const curriculumPlans = [
    {
      duration: 1,
      months: 1,
      label: '1 Month',
      description: 'Quick intensive course',
      dailyCommitment: '30-45 minutes',
      color: 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-900'
    },
    {
      duration: 3,
      months: 3,
      label: '3 Months',
      description: 'Standard course',
      dailyCommitment: '30-45 minutes',
      color: 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-900'
    },
    {
      duration: 6,
      months: 6,
      label: '6 Months',
      description: 'Comprehensive course',
      dailyCommitment: '30-45 minutes',
      color: 'bg-purple-50 dark:bg-purple-950/30 border-purple-200 dark:border-purple-900'
    },
    {
      duration: 12,
      months: 12,
      label: '12 Months',
      description: 'Complete mastery program',
      dailyCommitment: '30-45 minutes',
      color: 'bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-900'
    }
  ];

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Curriculum</h1>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  // Show selection UI if no curriculum selected
  if (!selection || !selection.has_selection) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Select Your Curriculum Plan</h1>
          <p className="text-muted-foreground">
            Choose a course duration that fits your learning goals. This is a one-time selection.
          </p>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {curriculumPlans.map((plan) => (
            <Card key={plan.duration} className={plan.color}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <GraduationCap className="h-8 w-8 text-primary" />
                  <span className="text-2xl font-bold">{plan.months}</span>
                </div>
                <CardTitle>{plan.label}</CardTitle>
                <CardDescription>{plan.description}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center text-sm text-muted-foreground">
                    <Calendar className="mr-2 h-4 w-4" />
                    <span>{plan.dailyCommitment} daily</span>
                  </div>
                </div>
                <Button
                  className="w-full"
                  onClick={() => handleSelectPlan(plan.duration)}
                >
                  Select Plan
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>

        <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Confirm Curriculum Selection</DialogTitle>
              <DialogDescription className="space-y-4 pt-4 text-left">
                <p>
                  You are about to select a <strong>{selectedDuration}-month</strong> curriculum plan.
                </p>
                <div className="bg-amber-50 dark:bg-amber-950/30 p-4 rounded-md border border-amber-200 dark:border-amber-900">
                  <p className="font-semibold text-amber-800 dark:text-amber-200 mb-2">
                    ⚠️ Important
                  </p>
                  <p className="text-sm text-amber-700 dark:text-amber-300">
                    This is a <strong>one-time selection</strong> and cannot be changed later.
                    Please choose carefully.
                  </p>
                </div>
                <p>Are you sure you want to proceed?</p>
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowConfirmDialog(false)}>
                Cancel
              </Button>
              <Button onClick={confirmSelection}>
                Confirm Selection
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // Show curriculum overview if selected
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">My Curriculum</h1>
        <p className="text-muted-foreground">Track your learning progress and daily tasks</p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Curriculum Plan</CardTitle>
            <CardDescription>Your selected learning plan</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Duration</span>
              <span className="font-semibold">{selection.duration_months} Months</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Start Date</span>
              <span className="font-semibold">
                {selection.start_date ? new Date(selection.start_date).toLocaleDateString() : 'N/A'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">End Date</span>
              <span className="font-semibold">
                {selection.end_date ? new Date(selection.end_date).toLocaleDateString() : 'N/A'}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Progress</CardTitle>
            <CardDescription>Your learning journey</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {selection.progress && (
              <>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Progress</span>
                    <span className="font-semibold">
                      {selection.progress.progress_percentage.toFixed(1)}%
                    </span>
                  </div>
                  <div className="w-full bg-secondary rounded-full h-2">
                    <div
                      className="bg-primary h-2 rounded-full transition-all"
                      style={{ width: `${selection.progress.progress_percentage}%` }}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4 pt-2">
                  <div>
                    <div className="text-2xl font-bold">{selection.progress.days_elapsed}</div>
                    <div className="text-xs text-muted-foreground">Days Completed</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold">{selection.progress.days_remaining}</div>
                    <div className="text-xs text-muted-foreground">Days Remaining</div>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Daily Tasks</CardTitle>
          <CardDescription>
            Complete your daily tasks to stay on track with your curriculum
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            View your daily tasks on the Dashboard. Tasks are automatically generated based on your weaknesses and progress.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default Curriculum;

