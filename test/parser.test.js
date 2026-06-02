import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMarkdown } from '../src/parser/markdown.js';

test('parseMarkdown: heading levels', () => {
  const blocks = parseMarkdown('# H1\n## H2\n### H3');
  assert.equal(blocks[0].type, 'heading'); assert.equal(blocks[0].level, 1);
  assert.equal(blocks[1].type, 'heading'); assert.equal(blocks[1].level, 2);
  assert.equal(blocks[2].type, 'heading'); assert.equal(blocks[2].level, 3);
});

test('parseMarkdown: paragraph', () => {
  const blocks = parseMarkdown('Hello world');
  assert.equal(blocks[0].type, 'paragraph');
  assert.equal(blocks[0].text, 'Hello world');
});

test('parseMarkdown: code block with lang', () => {
  const blocks = parseMarkdown('```js\nconsole.log("hi");\n```');
  assert.equal(blocks[0].type, 'codeblock');
  assert.equal(blocks[0].lang, 'js');
  assert.equal(blocks[0].code, 'console.log("hi");');
});

test('parseMarkdown: fenced code block no lang', () => {
  const blocks = parseMarkdown('```\nsome code\n```');
  assert.equal(blocks[0].type, 'codeblock');
  assert.equal(blocks[0].lang, '');
});

test('parseMarkdown: table', () => {
  const md = '| A | B |\n|---|---|\n| 1 | 2 |';
  const blocks = parseMarkdown(md);
  assert.equal(blocks[0].type, 'table');
  assert.deepEqual(blocks[0].headers, ['A', 'B']);
  assert.deepEqual(blocks[0].rows[0], ['1', '2']);
});

test('parseMarkdown: table alignment', () => {
  const md = '| L | C | R |\n|:--|:-:|--:|\n| a | b | c |';
  const blocks = parseMarkdown(md);
  assert.deepEqual(blocks[0].align, ['left', 'center', 'right']);
});

test('parseMarkdown: bullet list with indent', () => {
  const blocks = parseMarkdown('- item 1\n  - item 2');
  assert.equal(blocks[0].type, 'bullet'); assert.equal(blocks[0].indent, 0);
  assert.equal(blocks[1].type, 'bullet'); assert.equal(blocks[1].indent, 1);
});

test('parseMarkdown: numbered list', () => {
  const blocks = parseMarkdown('1. first\n2. second');
  assert.equal(blocks[0].type, 'numbered');
  assert.equal(blocks[0].text, 'first');
});

test('parseMarkdown: blank line', () => {
  const blocks = parseMarkdown('a\n\nb');
  assert.equal(blocks[1].type, 'blank');
});

test('parseMarkdown: hr', () => {
  const blocks = parseMarkdown('---');
  assert.equal(blocks[0].type, 'hr');
});

test('parseMarkdown: page break', () => {
  const blocks = parseMarkdown('<div style="page-break-after: always"></div>');
  // HTML tag stripped, not a page break via HTML tag
  // page break is via inline style text
  const b2 = parseMarkdown('page-break-after: always');
  assert.equal(b2[0].type, 'pagebreak');
});

test('parseMarkdown: image basic', () => {
  const blocks = parseMarkdown('![alt text](./img/chart.png)');
  assert.equal(blocks[0].type, 'image');
  assert.equal(blocks[0].alt, 'alt text');
  assert.equal(blocks[0].src, './img/chart.png');
  assert.equal(blocks[0].forceW, null);
});

test('parseMarkdown: image with size =WxH', () => {
  const blocks = parseMarkdown('![alt](./img.png =400x200)');
  assert.equal(blocks[0].forceW, 400);
  assert.equal(blocks[0].forceH, 200);
});

test('parseMarkdown: image with {width=W height=H}', () => {
  const blocks = parseMarkdown('![alt](./img.png){width=300 height=150}');
  assert.equal(blocks[0].forceW, 300);
  assert.equal(blocks[0].forceH, 150);
});

test('parseMarkdown: br tag becomes blank', () => {
  const blocks = parseMarkdown('<br/>');
  assert.equal(blocks[0].type, 'blank');
});
