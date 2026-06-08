import { test } from 'node:test';
import assert from 'node:assert/strict';
import { convert } from '../src/index.js';

// Smoke test: a kitchen-sink document exercising the new features should build a
// non-empty docx Buffer without throwing. Does NOT require mmdc — a mermaid block
// without a renderer falls back to a code block, but hasMermaid is still reported.
const KITCHEN_SINK = `<!-- @config
title: Smoke Test
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
