import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';

const Settings = () => {
  const { user } = useAuth();
  const studentId = user ? `${user.id}` : '';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground">Manage your preferences and account settings</p>
      </div>


      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>Update your profile information</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="student-id">Student ID</Label>
            <Input id="student-id" placeholder="1" value={studentId} disabled />
            <p className="text-sm text-muted-foreground">This ID is automatically assigned and cannot be changed</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input id="name" placeholder="John Doe" defaultValue={user?.name || ''} readOnly />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" placeholder="john@example.com" defaultValue={user?.email || ''} readOnly />
          </div>
          <div className="space-y-2">
            <Label htmlFor="school">School</Label>
            <Input id="school" placeholder="School Name" defaultValue={user?.school || ''} readOnly />
          </div>
          <div className="space-y-2">
            <Label htmlFor="date-of-birth">Date of Birth</Label>
            <Input id="date-of-birth" type="date" defaultValue={user?.date_of_birth || ''} readOnly />
          </div>
          <div className="space-y-2">
            <Label htmlFor="grade">Grade</Label>
            <Input id="grade" placeholder="Grade 10" defaultValue={user?.grade || ''} readOnly />
          </div>
          <Button>Save Changes</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Study Goals</CardTitle>
          <CardDescription>Set your learning targets</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="daily-goal">Daily Practice Goal (problems)</Label>
            <Input id="daily-goal" type="number" placeholder="5" defaultValue="5" />
          </div>
          <Button>Save Goals</Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default Settings;

