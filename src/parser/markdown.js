/**
 * Parse a markdown body into a flat list of block objects (the renderer's "AST").
 * Line-based, not CommonMark: each line is classified independently, except for
 * fenced code blocks and tables (multi-line) and bullet/numbered list continuation.
 */
import { parseDirective, parseArgs, readComment } from './directive.js';

export function parseMarkdown(md) {
  const lines = md.split('\n');
  const blocks = [];
  // Tracks the active bullet list's indentation to derive nesting levels.
  // Any structural block (code/table/heading/hr/image) resets it, ending the list context.
  const listIndent = createIndentTracker();
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // ── Multi-line blocks ──────────────────────────────────────────────
    // HTML comment `<!-- … -->` (single- or multi-line). Ordinary comments are invisible
    // in markdown viewers, so drop them. A `@…` directive comment is interpreted: only
    // `@pagebreak` renders here; the document-level ones (@config/@doc/@header/@footer) are
    // collected by extractDirectives and dropped. A line that *starts* with an inline
    // `@style` comment is NOT consumed here — it falls through to become a paragraph so
    // inline.js can parse the styled run.
    if (/^\s*<!--/.test(line) && !/^\s*<!--\s*@?\/?style\b/i.test(line)) {
      const { inner, next } = readComment(lines, i);
      const dir = parseDirective(inner);
      if (dir && dir.name === 'pagebreak') { listIndent.reset(); blocks.push({ type: 'pagebreak' }); }
      i = next; continue;
    }
    // Self-close `<!-- @style … /-->` alone on its own line → styles the NEXT line (lets you keep
    // a long title on its own line, with the directive on the line above). The bare tag line would
    // otherwise be eaten as a stray HTML tag. `align` lifts to that paragraph.
    const scOwnLine = line.match(/^\s*<!--\s*@style\b([^>]*?)\/-->\s*$/i);
    if (scOwnLine) {
      listIndent.reset();
      const args = scOwnLine[1].trim();
      const next = lines[i + 1];
      if (next && next.trim()) {
        const pblock = { type: 'paragraph', text: `<!-- @style ${args} -->${next.trim()}<!-- /style -->` };
        const a = parseArgs(args).align;
        if (a === 'center' || a === 'right' || a === 'left') pblock.align = a;
        blocks.push(pblock); i += 2; continue;
      }
      i++; continue;   // nothing to style on the next line → drop the bare tag
    }
    // Multi-line inline-style block: `<!-- @style … -->` opening on its own line, body on the
    // following line(s), closed by `<!-- /style -->`. (The block parser otherwise eats the bare
    // opening line as a stray HTML tag.) Collapse it into the single-line `@style…/style` form so
    // inline.js styles the body, and lift `align` to the paragraph. The single-line form, where the
    // whole thing fits on one line, is handled at the paragraph fall-through below.
    // (A self-close `… /-->` is NOT a multi-line block — its args end with `/`; let it fall through
    // to the paragraph handler so inline.js styles the rest of the line.)
    const styleOpen = line.match(/^\s*<!--\s*@style\b([^>]*?)-->(.*)$/i);
    if (styleOpen && !styleOpen[1].trimEnd().endsWith('/') && !/<!--\s*@?\/style\s*-->/.test(line)) {
      listIndent.reset();
      const args = styleOpen[1];
      const bodyParts = [styleOpen[2]];
      let j = i + 1;
      while (j < lines.length && !/<!--\s*@?\/style\s*-->/.test(lines[j])) bodyParts.push(lines[j++]);
      if (j < lines.length) bodyParts.push(lines[j].replace(/<!--\s*@?\/style\s*-->[\s\S]*$/i, ''));
      const body = bodyParts.join(' ').replace(/\s+/g, ' ').trim();
      const pblock = { type: 'paragraph', text: `<!-- @style${args}-->${body}<!-- /style -->` };
      const a = parseArgs(args).align;
      if (a === 'center' || a === 'right' || a === 'left') pblock.align = a;
      blocks.push(pblock); i = j + 1; continue;
    }
    if (/^```/.test(line)) {
      listIndent.reset();
      const { block, next } = parseFence(lines, i);
      blocks.push(block); i = next; continue;
    }
    if (isTableStart(lines, i)) {
      listIndent.reset();
      const { block, next } = parseTable(lines, i);
      blocks.push(block); i = next; continue;
    }

    // ── Single-line blocks (in priority order) ─────────────────────────
    const heading = line.match(/^(#{1,6})\s+(.*)/);
    if (heading) {
      listIndent.reset();
      blocks.push({ type: 'heading', level: heading[1].length, text: heading[2].trim() });
      i++; continue;
    }

    if (/^(\*{3,}|-{3,}|_{3,})$/.test(trimmed)) {
      listIndent.reset();
      blocks.push({ type: 'hr' }); i++; continue;
    }

    const bullet = line.match(/^(\s*)[-*+]\s+(.*)/);
    if (bullet) {
      blocks.push({ type: 'bullet', text: bullet[2].trim(), indent: listIndent.levelFor(bullet[1].length) });
      i++; continue;
    }

    const numbered = line.match(/^(\s*)\d+\.\s+(.*)/);
    if (numbered) {
      blocks.push({ type: 'numbered', text: numbered[2].trim(), indent: Math.min(Math.floor(numbered[1].length / 4), 1) });
      i++; continue;
    }

    if (!trimmed) { blocks.push({ type: 'blank' }); i++; continue; }
    if (/^<br\s*\/?>$/i.test(trimmed)) { blocks.push({ type: 'blank' }); i++; continue; }
    if (/page-break-after\s*:\s*always/i.test(line)) { blocks.push({ type: 'pagebreak' }); i++; continue; }
    if (/^<[^>]+>$/.test(trimmed)) { i++; continue; }  // stray HTML tag / comment — strip and skip

    const image = parseImage(trimmed);
    if (image) {
      listIndent.reset();
      blocks.push(image); i++; continue;
    }

    // Lazy continuation — a line that is no other construct, right after a list item, joins it.
    const prev = blocks[blocks.length - 1];
    if (prev && (prev.type === 'bullet' || prev.type === 'numbered')) {
      prev.text += ' ' + trimmed;
      i++; continue;
    }

    // Paragraph-level alignment: a line that *starts* with an inline `@style` carrying an
    // `align` arg centers/right-aligns the whole paragraph (the run-level opts still apply via
    // inline.js, which ignores `align`). Lets authors make a centered "title" without a heading.
    const pblock = { type: 'paragraph', text: trimmed };
    const lead = trimmed.match(/^<!--\s*@style\b([^>]*?)-->/i);
    if (lead) {
      const a = parseArgs(lead[1]).align;
      if (a === 'center' || a === 'right' || a === 'left') pblock.align = a;
    }
    blocks.push(pblock);
    i++;
  }
  return blocks;
}

// ── Block parsers ────────────────────────────────────────────────────────────

// Fenced code block: from the opening ``` to the next ``` (or end of input).
// Returns the block and the line index just past the closing fence.
function parseFence(lines, i) {
  const lang = lines[i].slice(3).trim();
  const code = [];
  let j = i + 1;
  while (j < lines.length && !/^```/.test(lines[j])) code.push(lines[j++]);
  return { block: { type: 'codeblock', lang, code: code.join('\n') }, next: j + 1 };
}

// A table starts with a `|…` row immediately followed by a `|---|---|` separator row.
function isTableStart(lines, i) {
  return /^\|/.test(lines[i]) && i + 1 < lines.length && /^\|[\s\-:|]+\|/.test(lines[i + 1]);
}

// Parse a table (assumes isTableStart). Reads the header, the alignment row, then body rows
// until a non-`|` line. Returns the block and the line index just past the table.
function parseTable(lines, i) {
  const headers = splitRow(lines[i]);
  const align = splitRow(lines[i + 1]).map(s =>
    /^:-+:$/.test(s) ? 'center' : /-+:$/.test(s) ? 'right' : 'left');
  let j = i + 2;
  const rows = [];
  while (j < lines.length && /^\|/.test(lines[j])) rows.push(splitRow(lines[j++]));
  return { block: { type: 'table', headers, rows, align }, next: j };
}

// Split a `| a | b |` row into trimmed cell texts, honoring `\|` escapes and dropping the
// empty leading/trailing cells produced by the outer pipes.
function splitRow(s) {
  return s.replace(/\\\|/g, '\x00').split('|').map(c => c.replace(/\x00/g, '|').trim()).slice(1, -1);
}

// Parse a standalone image line, with optional size via `path =WxH` or `{width=W height=H}`.
// Returns an image block, or null if the line is not an image.
function parseImage(line) {
  const m = line.match(/^!\[([^\]]*)\]\(([^)]+)\)(?:\{([^}]*)\})?$/);
  if (!m) return null;
  const [, alt, target, attrs] = m;

  const sizeM = target.match(/^(.*?)\s+=(\d*)x(\d*)$/);
  const src = (sizeM ? sizeM[1] : target).trim();
  let forceW = sizeM && sizeM[2] ? parseInt(sizeM[2]) : null;
  let forceH = sizeM && sizeM[3] ? parseInt(sizeM[3]) : null;
  if (attrs) {
    const w = attrs.match(/width=(\d+)/);
    const h = attrs.match(/height=(\d+)/);
    if (w) forceW = parseInt(w[1]);
    if (h) forceH = parseInt(h[1]);
  }
  return { type: 'image', alt, src, forceW, forceH };
}

// ── Bullet nesting ───────────────────────────────────────────────────────────

// Maps leading-space widths to nesting levels (0-based, capped at 2) by tracking a stack of
// seen indents — works for both 2- and 4-space schemes. `reset()` ends the current list.
function createIndentTracker() {
  let stack = [];
  return {
    reset() { stack = []; },
    levelFor(spaces) {
      while (stack.length && stack[stack.length - 1] > spaces) stack.pop();
      if (!stack.length || stack[stack.length - 1] < spaces) stack.push(spaces);
      return Math.min(stack.length - 1, 2);
    },
  };
}
