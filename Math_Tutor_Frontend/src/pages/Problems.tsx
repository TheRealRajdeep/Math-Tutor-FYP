import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { api, type Problem } from '@/lib/api';

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
      '\\equal': '=',
      '\\plus': '+',
      '\\times': '×',
      '\\div': '÷',
      '\\sqrt': '√',
      '\\frac': '⁄',
      '\\infty': '∞',
      '\\pi': 'π',
      '\\theta': 'θ',
      '\\phi': 'φ',
      '\\alpha': 'α',
      '\\beta': 'β',
      '\\gamma': 'γ',
      '\\delta': 'δ',
      '\\epsilon': 'ε',
      '\\zeta': 'ζ',
      '\\eta': 'η',
      '\\omega': 'ω',
      '\\sigma': 'σ',
      '\\tau': 'τ',
      '\\upsilon': 'υ',
      '\\chi': 'χ',
      '\\psi': 'ψ',
      '\\rho': 'ρ',
      '\\nu': 'ν',
      // add more mappings if your dataset uses them frequently
      // '\\l': '\\ell' // example mapping
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

const Problems = () => {
  const [problems, setProblems] = useState<Problem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedDomain, setSelectedDomain] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    fetchProblems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDomain]);

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
              <Card key={problem.problem_id}>
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
