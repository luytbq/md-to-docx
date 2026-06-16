import { test } from 'node:test';
import assert from 'node:assert/strict';
import { convert } from '../src/index.js';

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
