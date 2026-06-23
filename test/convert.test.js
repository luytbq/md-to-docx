import { test } from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { convert } from '../src/index.js';
import { dropBlankAfterHeadingPagebreak } from '../src/renderer/document.js';

// Extract word/document.xml from a generated .docx buffer (a zip) for assertions.
async function documentXml(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  return zip.file('word/document.xml').async('string');
}

// Smoke test: a kitchen-sink document exercising the new features should build a
// non-empty docx Buffer without throwing. Does NOT require mmdc — a mermaid block
// without a renderer falls back to a code block, but hasMermaid is still reported.
const KITCHEN_SINK = `<!-- @config
title: Smoke Test
heading:
  numbering:
    enabled: true
    from: 1
    to: 3
-->

# Overview

See the [details below](#details) for more.

- top level
  - nested one
    - nested two
- back to top
  continued text on the next line

1. first
2. second

A paragraph splits the list.

1. fresh one
2. fresh two

## Details

\`\`\`mermaid
graph TD
  A --> B
\`\`\`
`;

test('convert: kitchen-sink builds a non-empty buffer with mermaid meta', async () => {
  const { buffer, warnings, meta } = await convert(KITCHEN_SINK);
  assert.ok(Buffer.isBuffer(buffer));
  assert.ok(buffer.length > 0);
  assert.equal(meta.hasMermaid, true);
  assert.ok(Array.isArray(warnings));
  // its contiguous numbered headings (h1 → h2) produce no heading-numbering warnings
  assert.equal(warnings.filter(w => w.type === 'heading-numbering').length, 0);
});

test('convert: page break rides on the next block (no standalone empty break paragraph)', async () => {
  const { buffer } = await convert('text a\n\n<!-- @pagebreak -->\n\ntext b');
  const xml = await documentXml(buffer);
  // The break lands on a content paragraph...
  assert.ok(/<w:pageBreakBefore\b/.test(xml));
  // ...and "text b" is the paragraph that carries it (the break paragraph is real content,
  // not a dedicated empty one — i.e. pageBreakBefore appears in the same <w:p> as "text b").
  const breakPara = xml.match(/<w:p\b[^>]*>(?:(?!<\/w:p>).)*pageBreakBefore(?:(?!<\/w:p>).)*<\/w:p>/s);
  assert.ok(breakPara && /text b/.test(breakPara[0]));
});

test('dropBlankAfterHeadingPagebreak: drops one blank after a heading (gated)', () => {
  const types = b => b.map(x => x.type);
  // one blank after a heading is dropped when enabled
  assert.deepEqual(
    types(dropBlankAfterHeadingPagebreak([{ type: 'heading' }, { type: 'blank' }, { type: 'paragraph' }], true)),
    ['heading', 'paragraph']);
  // only the FIRST blank is dropped; a second survives
  assert.deepEqual(
    types(dropBlankAfterHeadingPagebreak([{ type: 'heading' }, { type: 'blank' }, { type: 'blank' }, { type: 'paragraph' }], true)),
    ['heading', 'blank', 'paragraph']);
  // disabled → blank after a heading is kept
  assert.deepEqual(
    types(dropBlankAfterHeadingPagebreak([{ type: 'heading' }, { type: 'blank' }, { type: 'paragraph' }], false)),
    ['heading', 'blank', 'paragraph']);
  // a blank after a pagebreak is always dropped, regardless of the heading toggle
  assert.deepEqual(
    types(dropBlankAfterHeadingPagebreak([{ type: 'pagebreak' }, { type: 'blank' }, { type: 'paragraph' }], false)),
    ['pagebreak', 'paragraph']);
  // a blank between two paragraphs is untouched
  assert.deepEqual(
    types(dropBlankAfterHeadingPagebreak([{ type: 'paragraph' }, { type: 'blank' }, { type: 'paragraph' }], true)),
    ['paragraph', 'blank', 'paragraph']);
});

test('convert: blank line right after a heading is dropped by default', async () => {
  const paras = xml => (xml.match(/<w:p\b/g) || []).length;
  const on  = await documentXml((await convert('# H\n\nbody')).buffer);
  const off = await documentXml((await convert('<!-- @config\nheading:\n  skip_blank_after: false\n-->\n# H\n\nbody')).buffer);
  // disabling the toggle keeps an extra empty paragraph; enabling (default) drops it
  assert.equal(paras(off), paras(on) + 1);
});

test('convert: body paragraphs get 1.5 line spacing by default', async () => {
  const xml = await documentXml((await convert('para text')).buffer);
  const para = xml.match(/<w:p>(?:(?!<\/w:p>).)*para text(?:(?!<\/w:p>).)*<\/w:p>/s);
  assert.ok(para && /<w:spacing[^>]*w:line="360"[^>]*w:lineRule="auto"/.test(para[0]));
});

test('convert: code and tables stay tight (single line spacing)', async () => {
  // CodeBlock paragraph style carries line 240 (set in styles.xml, inherited by each code line)
  const { buffer } = await convert('```\ncode\n```');
  const zip = await JSZip.loadAsync(buffer);
  const styles = await zip.file('word/styles.xml').async('string');
  const codeStyle = styles.match(/<w:style [^>]*w:styleId="CodeBlock"[\s\S]*?<\/w:style>/);
  assert.ok(codeStyle && /<w:spacing[^>]*w:line="240"/.test(codeStyle[0]));
  // table cell paragraphs set the tight spacing directly in document.xml
  const table = await documentXml((await convert('| a | b |\n|---|---|\n| 1 | 2 |')).buffer);
  assert.ok(/<w:spacing[^>]*w:line="240"/.test(table));
});

test('convert: body.line_spacing override flows through to the XML', async () => {
  const xml = await documentXml((await convert('para text', { config: { body: { line_spacing: 2 } } })).buffer);
  const para = xml.match(/<w:p>(?:(?!<\/w:p>).)*para text(?:(?!<\/w:p>).)*<\/w:p>/s);
  assert.ok(para && /<w:spacing[^>]*w:line="480"/.test(para[0]));
});

test('convert: body.align justify applies to list items too', async () => {
  const bullet = await documentXml((await convert('- item one', { config: { body: { align: 'justify' } } })).buffer);
  const numbered = await documentXml((await convert('1. item one', { config: { body: { align: 'justify' } } })).buffer);
  assert.ok(/<w:jc w:val="both"\/>/.test(bullet));    // JUSTIFIED renders as w:jc="both"
  assert.ok(/<w:jc w:val="both"\/>/.test(numbered));
  // default (no align) leaves list items unaligned (left)
  const plain = await documentXml((await convert('- item one')).buffer);
  assert.equal(/<w:jc /.test(plain), false);
});

test('convert: lazy continuation under a list item keeps the line break', async () => {
  const bullet = await documentXml((await convert('- first line\ncontinued here')).buffer);
  // one bullet (single numbering ref) containing a hard line break between the two lines
  assert.ok(/<w:br\/>/.test(bullet));
  assert.equal((bullet.match(/<w:numPr>/g) || []).length, 1);
  assert.ok(/first line/.test(bullet) && /continued here/.test(bullet));
  // numbered list behaves the same
  const numbered = await documentXml((await convert('1. a\nb')).buffer);
  assert.ok(/<w:br\/>/.test(numbered));
  // a blank line still ends the item (no break merged); the next text is its own paragraph
  const split = await documentXml((await convert('- item\n\nnow a paragraph')).buffer);
  assert.equal(/<w:br\/>/.test(split), false);
});

test('convert: a trailing page break is dropped (no empty page)', async () => {
  const { buffer } = await convert('last line\n\n<!-- @pagebreak -->');
  const xml = await documentXml(buffer);
  assert.equal(/<w:pageBreakBefore\b/.test(xml), false);
});

test('convert: blockquote renders without literal > and as italic indented text', async () => {
  const { buffer } = await convert('> **Key:** quoted text\n> spanning two lines');
  const xml = await documentXml(buffer);
  // the joined quote text is present, without the leading `>` marker
  assert.ok(/quoted text spanning two lines/.test(xml));
  assert.equal(/&gt; \*\*Key/.test(xml), false);
  // rendered italic (base run opt) and left-indented
  assert.ok(/<w:i\b/.test(xml));
  assert.ok(/<w:ind\b[^>]*w:left/.test(xml));
});

test('convert: resolved internal link emits no link warning', async () => {
  const md = '# Intro\n\nGo to [section](#intro).';
  const { warnings } = await convert(md);
  assert.equal(warnings.filter(w => w.type === 'link').length, 0);
});

test('convert: unresolved internal link records a link warning', async () => {
  const md = '# Intro\n\nGo to [missing](#nope).';
  const { warnings } = await convert(md);
  assert.equal(warnings.filter(w => w.type === 'link').length, 1);
});

const HN = body => `<!-- @config\nheading:\n  numbering:\n    enabled: true\n${body}-->\n`;

test('convert: heading numbering off by default → no numbering warnings on a skip', async () => {
  const { warnings } = await convert('# One\n### Three (skipped h2)\n');
  assert.equal(warnings.filter(w => w.type === 'heading-numbering').length, 0);
});

test('convert: numbered contiguous headings build cleanly (no warnings)', async () => {
  const { buffer, warnings } = await convert(HN('') + '# A\n## B\n### C\n## D\n# E\n');
  assert.ok(buffer.length > 0);
  assert.equal(warnings.filter(w => w.type === 'heading-numbering').length, 0);
});

test('convert: level skip within numbered range warns', async () => {
  const { warnings } = await convert(HN('') + '# One\n### Three (skip)\n');
  const w = warnings.filter(w => w.type === 'heading-numbering');
  assert.equal(w.length, 1);
  assert.match(w[0].message, /skips a level/);
});

test('convert: a heading outside the numbered range is not numbered and never warns', async () => {
  // h1-h3 numbered by default; the h5 below the h3 is out of range, so no skip warning.
  const { warnings } = await convert(HN('') + '# One\n## Two\n### Three\n##### Five (unnumbered)\n');
  assert.equal(warnings.filter(w => w.type === 'heading-numbering').length, 0);
});

test('convert: from > to disables numbering with a warning', async () => {
  const { warnings } = await convert(HN('    from: 4\n    to: 2\n') + '# One\n');
  const w = warnings.filter(w => w.type === 'heading-numbering');
  assert.equal(w.length, 1);
  assert.match(w[0].message, /numbering disabled/);
});

test('convert: out-of-range to is clamped with a warning', async () => {
  const { buffer, warnings } = await convert(HN('    to: 9\n') + '# One\n## Two\n');
  assert.ok(buffer.length > 0);
  assert.equal(warnings.filter(w => /out of range/.test(w.message)).length, 1);
});
