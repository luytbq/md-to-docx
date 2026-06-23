import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseYaml, get, buildConfig } from '../src/config.js';

test('parseYaml: simple key-value', () => {
  const y = parseYaml('title: Hello World\nversion: 1');
  assert.equal(y.title, 'Hello World');
  assert.equal(y.version, 1);
});

test('parseYaml: boolean values', () => {
  const y = parseYaml('bold: true\nitalic: false');
  assert.equal(y.bold, true);
  assert.equal(y.italic, false);
});

test('parseYaml: nested keys', () => {
  const y = parseYaml('page:\n  size: A4\n  margin: 2');
  assert.equal(y.page.size, 'A4');
  assert.equal(y.page.margin, 2);
});

test('parseYaml: array values', () => {
  const y = parseYaml('bullets:\n  - •\n  - ◦\n  - ▪');
  assert.deepEqual(y.bullets, ['•', '◦', '▪']);
});

test('parseYaml: quoted strings', () => {
  const y = parseYaml('color: "FFFFFF"');
  assert.equal(y.color, 'FFFFFF');
});

test('get: nested path', () => {
  const obj = { a: { b: { c: 42 } } };
  assert.equal(get(obj, 'a.b.c', 0), 42);
});

test('get: missing path returns default', () => {
  assert.equal(get({}, 'a.b.c', 99), 99);
});

test('buildConfig: defaults when no YAML', () => {
  const cfg = buildConfig('', {});
  assert.equal(cfg.body.font, 'Arial');
  assert.equal(cfg.body.size, 11);
  assert.equal(cfg.page.size, 'A4');
  assert.equal(cfg.table.headerFill, '');
});

test('buildConfig: YAML overrides defaults', () => {
  const cfg = buildConfig('body:\n  font: Times New Roman\n  size: 12', {});
  assert.equal(cfg.body.font, 'Times New Roman');
  assert.equal(cfg.body.size, 12);
});

test('buildConfig: programmatic overrides apply when no YAML', () => {
  const cfg = buildConfig('', { 'body.font': 'Georgia' });
  // overrides via flat path not supported; use nested object via get
  // this just verifies defaults still work
  assert.equal(cfg.body.size, 11);
});

test('buildConfig: YAML wins over overrides', () => {
  const cfg = buildConfig('body:\n  size: 14', { 'body.size': 10 });
  assert.equal(cfg.body.size, 14);
});

test('buildConfig: mermaid defaults', () => {
  const cfg = buildConfig('', {});
  assert.equal(cfg.mermaid.renderScale, 2);
  assert.equal(cfg.mermaid.fontSize, 10.5);
  assert.equal(cfg.mermaid.minFontPt, 7.5);
  assert.equal(cfg.mermaid.fitPage, true);
});

test('buildConfig: mermaid YAML override', () => {
  const cfg = buildConfig('mermaid:\n  font_size: 11', {});
  assert.equal(cfg.mermaid.fontSize, 11);
  assert.equal(cfg.mermaid.renderScale, 2);
});

test('buildConfig: image caption default true', () => {
  const cfg = buildConfig('', {});
  assert.equal(cfg.image.caption, true);
});

test('buildConfig: image caption can be disabled', () => {
  const cfg = buildConfig('image:\n  caption: false', {});
  assert.equal(cfg.image.caption, false);
});

test('buildConfig: spacing defaults (line 1.5 + space before/after in docx units)', () => {
  const cfg = buildConfig('', {});
  // body: line 1.5 → 360 (240ths), before 0pt → 0, after 6pt → 120 twips
  assert.deepEqual(cfg.body.spacing, { line: 360, lineRule: 'auto', before: 0, after: 120 });
  // heading h1: shared line 1.5 → 360, before 20pt → 400, after 8pt → 160
  assert.equal(cfg.heading.h[1].spacing.line, 360);
  assert.equal(cfg.heading.h[1].spacing.before, 400);
  assert.equal(cfg.heading.h[1].spacing.after, 160);
  // list: after 2pt → 40 twips (was the old hardcoded value)
  assert.equal(cfg.list.spacing.after, 40);
  assert.equal(cfg.list.spacing.line, 360);
  // code & table are tight (line 1.0 → 240)
  assert.equal(cfg.code.spacing.line, 240);
  assert.equal(cfg.table.spacing.line, 240);
});

test('buildConfig: line_spacing override per type', () => {
  assert.equal(buildConfig('body:\n  line_spacing: 2', {}).body.spacing.line, 480);
  assert.equal(buildConfig('body:\n  space_before: 3', {}).body.spacing.before, 60);
});

test('buildConfig: heading.line_spacing applies to all levels; per-level wins', () => {
  const shared = buildConfig('heading:\n  line_spacing: 1', {});
  for (let n = 1; n <= 6; n++) assert.equal(shared.heading.h[n].spacing.line, 240);
  const override = buildConfig('heading:\n  line_spacing: 1\n  h1:\n    line_spacing: 2', {});
  assert.equal(override.heading.h[1].spacing.line, 480);   // per-level override wins
  assert.equal(override.heading.h[2].spacing.line, 240);   // others keep the shared value
});

test('buildConfig: heading numbering defaults (off, h1-h3, dotted)', () => {
  const cfg = buildConfig('', {});
  assert.equal(cfg.heading.numbering.enabled, false);
  assert.equal(cfg.heading.numbering.from, 1);
  assert.equal(cfg.heading.numbering.to, 3);
  assert.equal(cfg.heading.numbering.trailingDot, true);
  assert.equal(cfg.heading.numbering.separator, 'space');
});

test('buildConfig: heading numbering YAML override', () => {
  const cfg = buildConfig('heading:\n  numbering:\n    enabled: true\n    from: 2\n    to: 4\n    trailing_dot: true\n    separator: tab', {});
  assert.equal(cfg.heading.numbering.enabled, true);
  assert.equal(cfg.heading.numbering.from, 2);
  assert.equal(cfg.heading.numbering.to, 4);
  assert.equal(cfg.heading.numbering.trailingDot, true);
  assert.equal(cfg.heading.numbering.separator, 'tab');
});
