import { test } from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { columnWidths } from '../src/renderer/table.js';
import { parseMarkdown } from '../src/parser/markdown.js';
import { convert } from '../src/index.js';

const CW = 9638; // A4 content width with 2cm margins (DXA)

function tableBlock(md) {
  return parseMarkdown(md).find(b => b.type === 'table');
}

async function documentXml(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  return zip.file('word/document.xml').async('string');
}

const TBL = '| A | B |\n|---|---|\n| a1 | b1 |\n| a2 | b2 |';

test('columnWidths: widths sum exactly to CW', () => {
  const b = tableBlock('| A | B | C |\n|---|---|---|\n| 1 | 2 | 3 |');
  const w = columnWidths(b, CW);
  assert.equal(w.reduce((a, x) => a + x, 0), CW);
});

test('columnWidths: a short-content column is narrower than a long-content column', () => {
  // "Value" holds 2-digit numbers; "Note" holds one long sentence.
  const md = [
    '| Value | Channel | Note |',
    '|-------|---------|------|',
    '| 36 | Visa/Master/JCB | |',
    '| 37 | Bank Account | |',
    '| 45 | ZaloPay Pay Later | Mã này không có trong online docs, được đầu mối ZaloPay cung cấp. |',
  ].join('\n');
  const b = tableBlock(md);
  const [value, channel, note] = columnWidths(b, CW);
  assert.ok(value < channel, `Value (${value}) should be < Channel (${channel})`);
  assert.ok(channel < note, `Channel (${channel}) should be < Note (${note})`);
  // the long Note column should take the majority of the width
  assert.ok(note > CW / 2, `Note (${note}) should exceed half of CW (${CW})`);
  // every column keeps a readable minimum
  assert.ok(value >= 800);
});

test('columnWidths: a link cell is sized by its label, not its URL', () => {
  // The Link column holds a 3-char label wrapping a ~55-char URL; the URL is not
  // rendered, so it must not inflate the column past the longer plain "Detail" text.
  const md = [
    '| Link | Detail |',
    '|------|--------|',
    '| [doc](https://example.com/a/very/long/path/that/should/not/count) | a longer sentence of detail here |',
  ].join('\n');
  const b = tableBlock(md);
  const [link, detail] = columnWidths(b, CW);
  assert.ok(link < detail, `Link (${link}) should be < Detail (${detail}) — URL must not count`);
});

test('columnWidths: header length still drives width when body is empty/short', () => {
  const b = tableBlock('| Name | X |\n|---|---|\n| a | b |');
  const [name, x] = columnWidths(b, CW);
  assert.ok(name > x, 'longer header "Name" should be wider than "X"');
});

test('@table directive: opts attach to the table that follows', () => {
  const b = tableBlock(`<!-- @table header=false -->\n${TBL}`);
  assert.equal(b.opts.header, 'false');
});

test('@table directive: blank lines between directive and table are allowed', () => {
  const b = tableBlock(`<!-- @table header=false -->\n\n\n${TBL}`);
  assert.equal(b.opts.header, 'false');
});

test('@table directive: any other block in between orphans the directive', () => {
  const b = tableBlock(`<!-- @table header=false -->\n\nsome paragraph\n\n${TBL}`);
  assert.equal(b.opts, undefined);
});

test('@table header=false: first row renders as a body row (no bold header)', async () => {
  // Zebra striping is opt-in (no default tint), so enable it to prove the first row
  // is restyled with body — not header — styling.
  const ZEBRA = '<!-- @config\ntable:\n  row:\n    odd_fill: F0F4F8\n-->';
  const withHeader = await documentXml((await convert(`${ZEBRA}\n${TBL}`)).buffer);
  const noHeader = await documentXml((await convert(`${ZEBRA}\n<!-- @table header=false -->\n${TBL}`)).buffer);
  // header row is the only bold source in this doc
  assert.ok(/<w:b\/>/.test(withHeader));
  assert.equal(/<w:b\/>/.test(noHeader), false);
  // same number of rows either way — the first row is kept, just restyled
  assert.equal((noHeader.match(/<w:tr>/g) || []).length, (withHeader.match(/<w:tr>/g) || []).length);
  // restyled first row picks up the body zebra fill
  const firstRow = noHeader.match(/<w:tr>[\s\S]*?<\/w:tr>/)[0];
  assert.ok(/w:fill="F0F4F8"/.test(firstRow));
});

test('@table: bare no_header flag works too', async () => {
  const xml = await documentXml((await convert(`<!-- @table no_header -->\n${TBL}`)).buffer);
  assert.equal(/<w:b\/>/.test(xml), false);
});

test('@table: unknown option produces a table warning', async () => {
  const { warnings } = await convert(`<!-- @table foo=1 -->\n${TBL}`);
  const w = warnings.filter(w => w.type === 'table');
  assert.equal(w.length, 1);
  assert.match(w[0].message, /unknown @table option "foo"/);
});

test('@table: invalid header value warns and keeps the header', async () => {
  const { buffer, warnings } = await convert(`<!-- @table header=maybe -->\n${TBL}`);
  const xml = await documentXml(buffer);
  assert.ok(/<w:b\/>/.test(xml), 'header stays styled');
  assert.equal(warnings.filter(w => w.type === 'table').length, 1);
});
