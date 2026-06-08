import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDirective, parseArgs, resolveColor, parseStyleOpts, extractDirectives } from '../src/parser/directive.js';
import { parseMarkdown } from '../src/parser/markdown.js';
import { makeRuns } from '../src/parser/inline.js';
import { buildConfig } from '../src/config.js';
import { convert } from '../src/index.js';

const cfg = buildConfig('', {});

const runText = r => {
  const t = r.root.find(c => c && c.rootKey === 'w:t');
  return t ? t.root.find(x => typeof x === 'string') ?? '' : null;
};
const isBold = r => {
  const rpr = r.root.find(c => c && c.rootKey === 'w:rPr');
  return !!(rpr && rpr.root.some(c => c && c.rootKey === 'w:b'));
};
const colorOf = r => {
  const rpr = r.root.find(c => c && c.rootKey === 'w:rPr');
  if (!rpr) return null;
  const col = rpr.root.find(c => c && c.rootKey === 'w:color');
  if (!col) return null;
  const attr = col.root.find(c => c && c.rootKey === '_attr');
  return attr ? attr.root.val : null;
};

// ── parseDirective ───────────────────────────────────────────────────────────

test('parseDirective: non-directive comment returns null', () => {
  assert.equal(parseDirective(' a normal comment '), null);
});

test('parseDirective: inline args form', () => {
  const d = parseDirective(' @style color=red bold ');
  assert.equal(d.name, 'style');
  assert.equal(d.argStr, 'color=red bold');
});

test('parseDirective: closing name with @/slash form', () => {
  // The bare `<!-- /style -->` closer has no sigil (handled by the inline regex);
  // the `@/style` form is a directive whose name keeps the slash.
  assert.equal(parseDirective('/style'), null);
  assert.equal(parseDirective('@/style').name, '/style');
});

test('parseDirective: multi-line YAML body', () => {
  const d = parseDirective('@config\ntitle: X\nbody:\n  size: 9');
  assert.equal(d.name, 'config');
  assert.match(d.body, /title: X/);
});

// ── parseArgs ────────────────────────────────────────────────────────────────

test('parseArgs: flags and key=value', () => {
  assert.deepEqual(parseArgs('bold color=red'), { bold: true, color: 'red' });
});

test('parseArgs: quoted value with spaces', () => {
  assert.deepEqual(parseArgs('font="Times New Roman"'), { font: 'Times New Roman' });
});

// ── resolveColor ─────────────────────────────────────────────────────────────

test('resolveColor: named, hex, 3-digit, invalid', () => {
  assert.equal(resolveColor('red'), 'FF0000');
  assert.equal(resolveColor('#1f272e'), '1F272E');
  assert.equal(resolveColor('abc'), 'AABBCC');
  assert.equal(resolveColor('zzz'), null);
});

// ── parseStyleOpts ───────────────────────────────────────────────────────────

test('parseStyleOpts: maps args to TextRun options', () => {
  const o = parseStyleOpts({ color: 'red', bold: true, italic: true, size: '9' });
  assert.equal(o.color, 'FF0000');
  assert.equal(o.bold, true);
  assert.equal(o.italics, true);
  assert.equal(o.size, 18); // pt → half-points
});

test('parseStyleOpts: invalid color pushes a warning, skips the key', () => {
  const warnings = [];
  const o = parseStyleOpts({ color: 'nope' }, warnings);
  assert.equal(o.color, undefined);
  assert.equal(warnings.filter(w => w.type === 'style').length, 1);
});

// ── extractDirectives ────────────────────────────────────────────────────────

test('extractDirectives: @config feeds buildConfig', () => {
  const { configYaml } = extractDirectives('<!-- @config\ntitle: X\nbody:\n  size: 9\n-->\n# H');
  const c = buildConfig(configYaml, {});
  assert.equal(c.title, 'X');
  assert.equal(c.body.size, 9);
});

test('extractDirectives: multiple @config merge, later wins', () => {
  const { configYaml } = extractDirectives('<!-- @config\nbody:\n  size: 9\n-->\n<!-- @config\nbody:\n  size: 12\n-->');
  assert.equal(buildConfig(configYaml, {}).body.size, 12);
});

test('extractDirectives: @doc is an alias feeding config', () => {
  const { configYaml } = extractDirectives('<!-- @doc\ntitle: Hello\n-->');
  assert.equal(buildConfig(configYaml, {}).title, 'Hello');
});

test('extractDirectives: @footer zones', () => {
  const { footer } = extractDirectives('<!-- @footer left="A" right="{page}" -->');
  assert.equal(footer.left, 'A');
  assert.equal(footer.right, '{page}');
});

test('extractDirectives: @header skip_on_first_page parsed', () => {
  const { header } = extractDirectives('<!-- @header center="X" skip_on_first_page=true -->');
  assert.equal(header.skip_on_first_page, 'true');
});

// ── markdown.js block handling ───────────────────────────────────────────────

test('parseMarkdown: @pagebreak directive emits a page break', () => {
  const blocks = parseMarkdown('<!-- @pagebreak -->');
  assert.equal(blocks[0].type, 'pagebreak');
});

test('parseMarkdown: @config block is dropped (not rendered)', () => {
  const blocks = parseMarkdown('<!-- @config\ntitle: X\n-->\nhi');
  assert.deepEqual(blocks.map(b => b.text).filter(Boolean), ['hi']);
});

test('parseMarkdown: plain comment still dropped', () => {
  const blocks = parseMarkdown('<!-- just a note -->\nhi');
  assert.deepEqual(blocks.map(b => b.text).filter(Boolean), ['hi']);
});

test('parseMarkdown: line starting with inline @style is NOT consumed as a block', () => {
  const blocks = parseMarkdown('<!-- @style color=red -->hi<!-- /style -->');
  assert.equal(blocks[0].type, 'paragraph');
  assert.match(blocks[0].text, /@style/);
});

// ── inline @style ────────────────────────────────────────────────────────────

test('makeRuns: @style applies color + bold to wrapped text', () => {
  const runs = makeRuns('a <!-- @style color=red bold -->B<!-- /style --> c', {}, cfg);
  const b = runs.find(r => runText(r) === 'B');
  assert.ok(b);
  assert.ok(isBold(b));
  assert.equal(colorOf(b), 'FF0000');
});

test('makeRuns: markdown inside @style still parses', () => {
  const runs = makeRuns('<!-- @style color=blue -->**x**<!-- /style -->', {}, cfg);
  const x = runs.find(r => runText(r) === 'x');
  assert.ok(isBold(x));
  assert.equal(colorOf(x), '0000FF');
});

test('makeRuns: @style works inside a table-cell context (no literal newline)', () => {
  const runs = makeRuns('lo<br><!-- @style color=red -->hi<!-- /style -->', {}, cfg);
  assert.ok(runs.find(r => runText(r) === 'hi' && colorOf(r) === 'FF0000'));
});

// ── integration ──────────────────────────────────────────────────────────────

test('convert: @config title builds a non-empty buffer', async () => {
  const { buffer } = await convert('<!-- @config\ntitle: T\n-->\n# H\n\nbody');
  assert.ok(buffer.length > 0);
});

test('convert: @footer with page tokens builds', async () => {
  const { buffer } = await convert('<!-- @footer center="{page} / {pages}" -->\n# H');
  assert.ok(buffer.length > 0);
});

test('convert: @footer skip_on_first_page builds (title-page section)', async () => {
  const { buffer } = await convert('<!-- @footer center="{page}" skip_on_first_page=true -->\n# H\n\nbody');
  assert.ok(buffer.length > 0);
});
