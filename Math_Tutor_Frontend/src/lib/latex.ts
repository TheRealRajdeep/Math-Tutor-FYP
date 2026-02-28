// LaTeX rendering utility
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
export function renderLaTeXToHTML(input: string): string {
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

