import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDirective, parseArgs, resolveColor, parseStyleOpts, extractDirectives } from '../src/parser/directive.js';
import { parseMarkdown } from '../src/parser/markdown.js';
import { makeRuns } from '../src/parser/inline.js';
import { buildConfig, resolveVar } from '../src/config.js';
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
const isBreak = r => r.root.some(c => c && c.rootKey === 'w:br');
const colorOf = r => {
  const rpr = r.root.find(c => c && c.rootKey === 'w:rPr');
  if (!rpr) return null;
  const col = rpr.root.find(c => c && c.rootKey === 'w:color');
  if (!col) return null;
  const attr = col.root.find(c => c && c.rootKey === '_attr');
  return attr ? attr.root.val : null;
};
const sizeOf = r => {
  const rpr = r.root.find(c => c && c.rootKey === 'w:rPr');
  if (!rpr) return null;
  const sz = rpr.root.find(c => c && c.rootKey === 'w:sz');
  if (!sz) return null;
  const attr = sz.root.find(c => c && c.rootKey === '_attr');
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

test('extractDirectives: @doc feeds the doc namespace (not styling config)', () => {
  const { configYaml, docYaml } = extractDirectives('<!-- @doc\ntitle: Hello\n-->');
  assert.equal(buildConfig(configYaml, {}).title, '');   // @doc no longer feeds buildConfig
  assert.match(docYaml, /title: Hello/);                 // it feeds the doc.* variable namespace
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

// ── variables ────────────────────────────────────────────────────────────────

const joinText = runs => runs.map(r => runText(r) ?? '').join('');

test('resolveVar: dotted path, scalar, missing, and object', () => {
  const v = { doc: { title: 'X' }, n: 3 };
  assert.equal(resolveVar(v, 'doc.title'), 'X');
  assert.equal(resolveVar(v, 'n'), 3);
  assert.equal(resolveVar(v, 'doc.nope'), undefined);
  assert.equal(resolveVar(v, 'doc'), undefined);   // points at a map, not a scalar
});

test('makeRuns: resolves {doc.*} / {vars.*} / {date} in body text', () => {
  const ctx = { vars: { date: '2026-06-08', doc: { title: 'Hello' }, vars: { v: '2.1' } }, warnings: [] };
  const runs = makeRuns('T={doc.title} v={vars.v} d={date}', {}, cfg, ctx);
  assert.equal(joinText(runs), 'T=Hello v=2.1 d=2026-06-08');
});

test('makeRuns: unknown variable stays literal and warns', () => {
  const ctx = { vars: { doc: {} }, warnings: [] };
  assert.equal(joinText(makeRuns('{doc.missing}', {}, cfg, ctx)), '{doc.missing}');
  assert.equal(ctx.warnings.filter(w => w.type === 'var').length, 1);
});

test('makeRuns: {page}/{pages} stay literal in body (header/footer fields only)', () => {
  const ctx = { vars: {}, warnings: [] };
  assert.equal(joinText(makeRuns('p {page}/{pages}', {}, cfg, ctx)), 'p {page}/{pages}');
});

test('makeRuns: a variable inside inline code is not expanded', () => {
  const ctx = { vars: { doc: { title: 'Hello' } }, warnings: [] };
  assert.equal(joinText(makeRuns('`{doc.title}`', {}, cfg, ctx)), '{doc.title}');
});

test('makeRuns: variables resolve inside *italic* / **bold**', () => {
  const ctx = { vars: { doc: { title: 'Hi' } }, warnings: [] };
  assert.equal(joinText(makeRuns('*{doc.title}*', {}, cfg, ctx)), 'Hi');
  assert.equal(joinText(makeRuns('**{doc.title}**', {}, cfg, ctx)), 'Hi');
});

test('convert: {doc.title} resolves in body and header without a var warning', async () => {
  const md = '<!-- @doc\ntitle: Report\n-->\n<!-- @header center="{doc.title}" -->\n# H\n\nName: {doc.title}';
  const { buffer, warnings } = await convert(md);
  assert.ok(buffer.length > 0);
  assert.equal(warnings.filter(w => w.type === 'var').length, 0);
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

// ── @style paragraph alignment ───────────────────────────────────────────────

test('parseMarkdown: leading @style with align sets paragraph align', () => {
  const blocks = parseMarkdown('<!-- @style align=center size=28 bold -->Title<!-- /style -->');
  assert.equal(blocks[0].type, 'paragraph');
  assert.equal(blocks[0].align, 'center');
});

test('parseMarkdown: @style align=right is honored', () => {
  const blocks = parseMarkdown('<!-- @style align=right -->x<!-- /style -->');
  assert.equal(blocks[0].align, 'right');
});

test('parseMarkdown: @style without align leaves paragraph unaligned', () => {
  const blocks = parseMarkdown('<!-- @style color=red -->x<!-- /style -->');
  assert.equal(blocks[0].align, undefined);
});

// ── multi-line @style block ───────────────────────────────────────────────────

test('parseMarkdown: multi-line @style collapses into one aligned paragraph', () => {
  const blocks = parseMarkdown('<!-- @style align=center bold -->\nLine one\nLine two\n<!-- /style -->');
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].type, 'paragraph');
  assert.equal(blocks[0].align, 'center');
  assert.match(blocks[0].text, /Line one Line two/);   // body lines joined with a space
  assert.match(blocks[0].text, /@style.*\/style/s);    // collapsed to the single-line wrapping form
});

test('makeRuns: multi-line @style body is styled', () => {
  const blocks = parseMarkdown('<!-- @style color=red -->\nhello\n<!-- /style -->');
  const runs = makeRuns(blocks[0].text, {}, cfg);
  assert.ok(runs.find(r => runText(r) === 'hello' && colorOf(r) === 'FF0000'));
});

test('makeRuns: <br> inside an @style span becomes a break and keeps the style', () => {
  const runs = makeRuns('<!-- @style color=red -->a<br>b<!-- /style -->', {}, cfg);
  assert.equal(colorOf(runs.find(r => runText(r) === 'a')), 'FF0000');
  assert.equal(colorOf(runs.find(r => runText(r) === 'b')), 'FF0000');
  assert.ok(runs.some(isBreak));
});

test('parseMarkdown: multi-line @style with <br> lines keeps the breaks (not collapsed)', () => {
  const blocks = parseMarkdown('<!-- @style color=red -->\nLine\n<br><br>\n<!-- /style -->');
  const runs = makeRuns(blocks[0].text, {}, cfg);
  assert.equal(colorOf(runs.find(r => runText(r)?.trim() === 'Line')), 'FF0000');
  assert.equal(runs.filter(isBreak).length, 2);
});

// ── self-closing @style (styles the rest of the line) ─────────────────────────

test('makeRuns: self-close @style styles the rest of the line', () => {
  const runs = makeRuns('a <!-- @style color=red /-->b c', {}, cfg);
  assert.equal(runText(runs[0]), 'a ');
  assert.equal(colorOf(runs[0]), null);
  assert.ok(runs.find(r => runText(r) === 'b c' && colorOf(r) === 'FF0000'));
});

test('makeRuns: self-close @style applies bold + size', () => {
  const runs = makeRuns('<!-- @style size=28 bold /-->hello', {}, cfg);
  const h = runs.find(r => runText(r) === 'hello');
  assert.ok(isBold(h));
  assert.equal(sizeOf(h), 56);   // 28pt → 56 half-points
});

test('makeRuns: chained self-close @style overrides from its point onward', () => {
  const runs = makeRuns('<!-- @style color=blue /-->x <!-- @style color=red /-->y', {}, cfg);
  assert.equal(colorOf(runs.find(r => runText(r) === 'x ')), '0000FF');
  assert.equal(colorOf(runs.find(r => runText(r) === 'y')), 'FF0000');
});

test('parseMarkdown: leading self-close @style sets paragraph align and is not a block', () => {
  const blocks = parseMarkdown('<!-- @style align=center size=28 /-->Title');
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].type, 'paragraph');
  assert.equal(blocks[0].align, 'center');
});

test('parseMarkdown: self-close @style alone on a line styles the next line', () => {
  const blocks = parseMarkdown('<!-- @style align=center size=26 bold /-->\nLong Title Here\n\nbody');
  assert.equal(blocks[0].type, 'paragraph');
  assert.equal(blocks[0].align, 'center');
  assert.match(blocks[0].text, /Long Title Here/);
  const t = makeRuns(blocks[0].text, {}, cfg).find(r => runText(r) === 'Long Title Here');
  assert.ok(isBold(t));
  assert.equal(sizeOf(t), 52);   // 26pt → 52 half-points
  // the line after the title is a separate, ordinary paragraph
  assert.ok(blocks.find(b => b.type === 'paragraph' && b.text === 'body' && b.align === undefined));
});

// ── integration ──────────────────────────────────────────────────────────────

test('convert: @config title builds a non-empty buffer', async () => {
  const { buffer } = await convert('<!-- @config\ntitle: T\n-->\n# H\n\nbody');
  assert.ok(buffer.length > 0);
});

test('convert: self-close @style title builds a non-empty buffer', async () => {
  const { buffer } = await convert('<!-- @style align=center size=28 bold /-->My Title\n\nbody');
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

test('convert: skip_on_first_page=N splits into two sections, restarts numbering', async () => {
  const md = '<!-- @footer center="{page}" skip_on_first_page=2 -->\n' +
    '# Cover\n\ntext\n\n<!-- @pagebreak -->\n# TOC\n\ntext\n\n<!-- @pagebreak -->\n# Body\n\ntext';
  const { buffer, warnings } = await convert(md);
  assert.equal(warnings.filter(w => w.type === 'skip-pages').length, 0);
  const { default: JSZip } = await import('jszip');
  const xml = await (await JSZip.loadAsync(buffer)).file('word/document.xml').async('string');
  const sects = xml.match(/<w:sectPr[\s\S]*?<\/w:sectPr>/g) || [];
  assert.equal(sects.length, 2, 'expected two sections');
  assert.ok(!/headerReference|footerReference/.test(sects[0]), 'front section has no header/footer');
  assert.ok(/footerReference/.test(sects[1]), 'body section keeps the footer');
  assert.ok(/w:pgNumType w:start="1"/.test(sects[1]), 'body section restarts numbering at 1');
});

test('convert: skip_on_first_page=N warns and falls back when too few page breaks', async () => {
  const { warnings } = await convert('<!-- @footer center="{page}" skip_on_first_page=2 -->\n# H\n\nbody');
  assert.ok(warnings.some(w => w.type === 'skip-pages'));
});
