/**
 * Directive grammar for HTML-comment directives.
 *
 * A comment whose inner text starts with the sigil `@` is a *directive*; any other
 * comment is an ordinary comment (dropped, invisible — as in markdown viewers).
 *
 * Two body shapes share one parser:
 *   - inline args:  `@name key=value flag`          (one line)   → parseArgs(argStr)
 *   - YAML body:    `@config\n  title: x\n  …`       (multi-line) → parseYaml(body)
 *
 * Directive families:
 *   @config / @doc   — document config (replaces YAML frontmatter); body is mini-YAML
 *   @header / @footer — running header/footer (3 zones + tokens)
 *   @style … /style   — inline run styling (handled in inline.js, not here)
 *   @pagebreak        — page break (alias)
 */
import { ShadingType, UnderlineType } from 'docx';
import { parseYaml } from '../config.js';

export const SIGIL = '@';

/**
 * Parse a comment's inner text (the part between `<!--` and `-->`) into a directive.
 * @returns {{name: string, argStr: string, body: string} | null} null if not a directive.
 */
export function parseDirective(inner) {
  const t = inner.trim();
  if (!t.startsWith(SIGIL)) return null;
  const m = t.slice(SIGIL.length).match(/^(\/?[\w-]+)[ \t]*([\s\S]*)$/);
  if (!m) return null;
  const after = m[2];
  // argStr = remainder of the first line (inline args); body = everything after the name (for YAML).
  return { name: m[1].toLowerCase(), argStr: after.split('\n', 1)[0].trim(), body: after };
}

/**
 * Resolve a directive's parameters as an object, picking the right body shape:
 * a multi-line body is parsed as YAML; a single-line one as inline args.
 */
export function directiveOptions(dir) {
  return /\n/.test(dir.body.trim()) ? parseYaml(dir.body) : parseArgs(dir.argStr);
}

/**
 * Tokenize an inline argument string into an object.
 *   flag          → true
 *   key=value     → "value"
 *   key="a b c"   → "a b c"   (also single-quoted)
 */
export function parseArgs(s) {
  const args = {};
  const re = /([\w-]+)(?:=(?:"([^"]*)"|'([^']*)'|(\S+)))?/g;
  let m;
  while ((m = re.exec(s)) !== null) {
    const val = m[2] ?? m[3] ?? m[4];
    args[m[1]] = val === undefined ? true : val;
  }
  return args;
}

// ── Inline @style → TextRun options ──────────────────────────────────────────

const NAMED_COLORS = {
  black: '000000', white: 'FFFFFF', red: 'FF0000', green: '008000', blue: '0000FF',
  yellow: 'FFFF00', orange: 'FFA500', purple: '800080', gray: '808080', grey: '808080',
  silver: 'C0C0C0', maroon: '800000', olive: '808000', lime: '00FF00', aqua: '00FFFF',
  cyan: '00FFFF', teal: '008080', navy: '000080', fuchsia: 'FF00FF', magenta: 'FF00FF',
  pink: 'FFC0CB',
};

/** Normalize `#abc` / `#aabbcc` / `aabbcc` / a named color → 6-digit hex, or null. */
export function resolveColor(raw) {
  if (!raw || raw === true) return null;
  let s = String(raw).trim().toLowerCase();
  if (NAMED_COLORS[s]) return NAMED_COLORS[s];
  s = s.replace(/^#/, '');
  if (/^[0-9a-f]{3}$/.test(s)) s = s.split('').map(c => c + c).join('');
  return /^[0-9a-f]{6}$/.test(s) ? s.toUpperCase() : null;
}

/**
 * Map parsed @style args to TextRun base options. Unknown/invalid values are skipped
 * (a warning is pushed to `warnings` when provided). `size` is pt → half-points (×2).
 */
export function parseStyleOpts(args, warnings) {
  const o = {};
  if (args.color) {
    const c = resolveColor(args.color);
    if (c) o.color = c;
    else warnings?.push({ type: 'style', message: `invalid color "${args.color}"` });
  }
  if (args.bg) {
    const c = resolveColor(args.bg);
    if (c) o.shading = { type: ShadingType.CLEAR, fill: c, color: 'auto' };
    else warnings?.push({ type: 'style', message: `invalid bg "${args.bg}"` });
  }
  if (args.highlight) o.highlight = String(args.highlight);
  if (args.bold) o.bold = true;
  if (args.italic) o.italics = true;
  if (args.underline) o.underline = { type: UnderlineType.SINGLE };
  if (args.strike) o.strike = true;
  if (args.sup) o.superScript = true;
  if (args.sub) o.subScript = true;
  if (args.font) o.font = String(args.font);
  if (args.size) {
    const n = Number(args.size);
    if (!isNaN(n)) o.size = Math.round(n * 2);
    else warnings?.push({ type: 'style', message: `invalid size "${args.size}"` });
  }
  return o;
}

// ── Comment scanning (shared by markdown.js block parsing and extractDirectives) ──

/**
 * Read a comment starting at lines[i] (assumed to match /^\s*<!--/) through its `-->`.
 * @returns {{inner: string, next: number}} inner text between the delimiters, and the
 *   index of the line just past the closing `-->`.
 */
export function readComment(lines, i) {
  let j = i;
  while (j < lines.length && !/-->/.test(lines[j])) j++;
  const slice = lines.slice(i, j + 1).join('\n');
  const inner = slice.replace(/^\s*<!--/, '').replace(/-->[\s\S]*$/, '');
  return { inner, next: j + 1 };
}

/**
 * Scan raw markdown for document-level directive comments (`@config`, `@doc`,
 * `@header`, `@footer`) — the layer that replaces YAML frontmatter. Inline `@style`
 * and render-positioned `@pagebreak` are NOT collected here (they belong to the
 * parser/renderer).
 *
 * `@config` bodies feed styling config (and may carry `doc:`/`vars:` sections);
 * `@doc` bodies feed the `doc.*` variable namespace. Both are returned as merged
 * mini-YAML strings (later blocks win on key collision).
 *
 * @returns {{configYaml: string, docYaml: string, header: object|null, footer: object|null}}
 */
export function extractDirectives(md) {
  const lines = md.split('\n');
  const configBodies = [];
  const docBodies = [];
  let header = null, footer = null;
  for (let i = 0; i < lines.length;) {
    if (!/^\s*<!--/.test(lines[i])) { i++; continue; }
    const { inner, next } = readComment(lines, i);
    const dir = parseDirective(inner);
    if (dir) {
      if (dir.name === 'config') configBodies.push(dir.body);
      else if (dir.name === 'doc') docBodies.push(dir.body);
      else if (dir.name === 'header') header = directiveOptions(dir);
      else if (dir.name === 'footer') footer = directiveOptions(dir);
    }
    i = next;
  }
  return { configYaml: configBodies.join('\n'), docYaml: docBodies.join('\n'), header, footer };
}
