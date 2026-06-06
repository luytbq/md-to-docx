/**
 * Parse a markdown body into a flat list of block objects (the renderer's "AST").
 * Line-based, not CommonMark: each line is classified independently, except for
 * fenced code blocks and tables (multi-line) and bullet/numbered list continuation.
 */
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
    // HTML comment `<!-- … -->` (single- or multi-line). Invisible in normal markdown
    // viewers, so drop it entirely — including the line carrying the closing `-->`.
    if (/^\s*<!--/.test(line)) {
      let j = i;
      while (j < lines.length && !/-->/.test(lines[j])) j++;
      i = j + 1; continue;
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

    blocks.push({ type: 'paragraph', text: trimmed });
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
