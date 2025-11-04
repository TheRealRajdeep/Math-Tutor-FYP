import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const Progress = () => {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Progress & Analytics</h1>
        <p className="text-muted-foreground">Track your performance and identify areas for improvement</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Performance Metrics</CardTitle>
          <CardDescription>Your progress over time</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">Charts will be implemented here</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Domain-wise Performance</CardTitle>
          <CardDescription>Your strengths and weaknesses by domain</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">Domain breakdown will be shown here</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Mistakes Tracking</CardTitle>
          <CardDescription>Common mistakes and recommendations</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">Mistake tracking will be implemented here</p>
        </CardContent>
      </Card>
    </div>
  );
};

export default Progress;

