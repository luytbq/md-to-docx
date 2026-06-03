import { test } from 'node:test';
import assert from 'node:assert/strict';
import { columnWidths } from '../src/renderer/table.js';
import { parseMarkdown } from '../src/parser/markdown.js';

const CW = 9638; // A4 content width with 2cm margins (DXA)

function tableBlock(md) {
  return parseMarkdown(md).find(b => b.type === 'table');
}

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

test('columnWidths: header length still drives width when body is empty/short', () => {
  const b = tableBlock('| Name | X |\n|---|---|\n| a | b |');
  const [name, x] = columnWidths(b, CW);
  assert.ok(name > x, 'longer header "Name" should be wider than "X"');
});
