import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { api, type Problem } from '@/lib/api';

import { renderLaTeXToHTML } from '@/lib/latex';

const Problems = () => {
  const [problems, setProblems] = useState<Problem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedDomain, setSelectedDomain] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    fetchProblems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDomain]);

  useEffect(() => {
    // Handle scroll to specific problem from query parameter
    const urlParams = new URLSearchParams(window.location.search);
    const problemId = urlParams.get('problem_id');
    if (problemId && problems.length > 0) {
      const targetId = parseInt(problemId, 10);
      const element = document.getElementById(`problem-${targetId}`);
      if (element) {
        setTimeout(() => {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          element.classList.add('ring-2', 'ring-primary', 'ring-offset-2');
          setTimeout(() => {
            element.classList.remove('ring-2', 'ring-primary', 'ring-offset-2');
          }, 3000);
        }, 100);
      }
    }
  }, [problems]);

  const fetchProblems = async () => {
    setLoading(true);
    try {
      if (selectedDomain === 'all') {
        const data = await api.getProblems(20);
        setProblems(data);
      } else {
        const data = await api.getProblemsByDomain(selectedDomain, 20);
        setProblems(data);
      }
    } catch (error) {
      console.error('Failed to fetch problems:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredProblems = problems.filter((problem) =>
    (problem.problem || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Problem Practice</h1>
        <p className="text-muted-foreground">Browse and practice math problems by domain</p>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent className="flex gap-4">
          <Input
            placeholder="Search problems..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="max-w-sm"
          />
          <Select value={selectedDomain} onValueChange={setSelectedDomain}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Select domain" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Domains</SelectItem>
              <SelectItem value="Algebra">Algebra</SelectItem>
              <SelectItem value="Number Theory">Number Theory</SelectItem>
              <SelectItem value="Geometry">Geometry</SelectItem>
              <SelectItem value="Combinatorics">Combinatorics</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Problems List */}
      <div className="grid gap-4">
        {loading ? (
          <div>Loading problems...</div>
        ) : filteredProblems.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center">
              <p className="text-muted-foreground">No problems found.</p>
            </CardContent>
          </Card>
        ) : (
          filteredProblems.map((problem) => {
            const rendered = renderLaTeXToHTML(problem.problem || '');

            return (
              <Card key={problem.problem_id} id={`problem-${problem.problem_id}`}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle>Problem #{problem.problem_id}</CardTitle>
                    <Badge>Difficulty: {problem.difficulty_level}</Badge>
                  </div>
                  <CardDescription>
                    <div className="flex gap-2 mt-2">
                      {problem.domain.map((d) => (
                        <Badge key={d} variant="secondary">
                          {d}
                        </Badge>
                      ))}
                    </div>
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="prose max-w-none mb-4">
                    <p
                      className="whitespace-pre-wrap"
                      // eslint-disable-next-line react/no-danger
                      dangerouslySetInnerHTML={{ __html: rendered }}
                    />
                  </div>
                  <Button variant="outline">View Details</Button>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
};

export default Problems;
