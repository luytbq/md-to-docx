import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMarkdown } from '../src/parser/markdown.js';
import { makeRuns } from '../src/parser/inline.js';
import { buildConfig } from '../src/config.js';

const cfg = buildConfig('', {});

// docx serializes a TextRun to a tree; these reach into it to assert on the output.
const runText = r => {
  const t = r.root.find(c => c && c.rootKey === 'w:t');
  return t ? t.root.find(x => typeof x === 'string') ?? '' : null;
};
const isBreak = r => r.root.some(c => c && c.rootKey === 'w:br');
const isBold = r => {
  const rpr = r.root.find(c => c && c.rootKey === 'w:rPr');
  return !!(rpr && rpr.root.some(c => c && c.rootKey === 'w:b'));
};

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

test('parseMarkdown: bullet nesting with 4-space scheme', () => {
  const blocks = parseMarkdown('- a\n    - b\n        - c');
  assert.deepEqual(blocks.map(b => b.indent), [0, 1, 2]);
});

test('parseMarkdown: bullet nesting caps at level 2', () => {
  const blocks = parseMarkdown('- a\n  - b\n    - c\n      - d');
  assert.deepEqual(blocks.map(b => b.indent), [0, 1, 2, 2]);
});

test('parseMarkdown: bullet de-indent pops back to outer level', () => {
  const blocks = parseMarkdown('- a\n  - b\n- c');
  assert.deepEqual(blocks.map(b => b.indent), [0, 1, 0]);
});

test('parseMarkdown: lazy continuation merges into previous list item', () => {
  const blocks = parseMarkdown('- first line\ncontinued here');
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].type, 'bullet');
  assert.equal(blocks[0].text, 'first line continued here');
});

test('parseMarkdown: lazy continuation does not cross a blank line', () => {
  const blocks = parseMarkdown('- item\n\nnow a paragraph');
  assert.equal(blocks[0].type, 'bullet');
  assert.equal(blocks[0].text, 'item');
  assert.equal(blocks[2].type, 'paragraph');
});

test('parseMarkdown: blockquote joins lines into one paragraph', () => {
  const blocks = parseMarkdown('> line one\n> line two');
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].type, 'quote');
  assert.deepEqual(blocks[0].paras, ['line one line two']);
});

test('parseMarkdown: blockquote splits paragraphs on a blank quote line', () => {
  const blocks = parseMarkdown('> first\n>\n> second');
  assert.equal(blocks[0].type, 'quote');
  assert.deepEqual(blocks[0].paras, ['first', 'second']);
});

test('parseMarkdown: blockquote ends at first non-quote line', () => {
  const blocks = parseMarkdown('> quoted\nplain paragraph');
  assert.equal(blocks[0].type, 'quote');
  assert.deepEqual(blocks[0].paras, ['quoted']);
  assert.equal(blocks[1].type, 'paragraph');
  assert.equal(blocks[1].text, 'plain paragraph');
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

test('parseMarkdown: page break after a list item is not swallowed by lazy continuation', () => {
  const blocks = parseMarkdown('- item\npage-break-after: always');
  assert.equal(blocks[0].type, 'bullet');
  assert.equal(blocks[0].text, 'item');
  assert.equal(blocks[1].type, 'pagebreak');
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

test('parseMarkdown: single-line HTML comment is dropped', () => {
  const blocks = parseMarkdown('before\n<!-- a comment -->\nafter');
  assert.deepEqual(blocks.map(b => b.text), ['before', 'after']);
});

test('parseMarkdown: multi-line HTML comment is dropped', () => {
  const blocks = parseMarkdown('before\n<!-- line one\nline two -->\nafter');
  assert.deepEqual(blocks.map(b => b.text), ['before', 'after']);
});

test('parseMarkdown: HTML comment inside a code block is preserved literally', () => {
  const blocks = parseMarkdown('```\n<!-- not a comment here -->\n```');
  assert.equal(blocks[0].type, 'codeblock');
  assert.equal(blocks[0].code, '<!-- not a comment here -->');
});

test('makeRuns: <br> inserts a break run between text runs', () => {
  const runs = makeRuns('a<br>b', {}, cfg);
  assert.equal(runs.length, 3);
  assert.equal(runText(runs[0]), 'a');
  assert.ok(isBreak(runs[1]));
  assert.equal(runText(runs[2]), 'b');
});

test('makeRuns: inline markdown is parsed within each <br> segment', () => {
  const runs = makeRuns('a<br>**b**', {}, cfg);
  assert.equal(runText(runs[0]), 'a');
  assert.ok(isBreak(runs[1]));
  assert.equal(runText(runs[2]), 'b');
  assert.ok(isBold(runs[2]));
});

test('makeRuns: <br><br> produces two consecutive break runs', () => {
  const runs = makeRuns('a<br><br>b', {}, cfg);
  assert.equal(runText(runs[0]), 'a');
  assert.ok(isBreak(runs[1]));
  assert.ok(isBreak(runs[2]));
  assert.equal(runText(runs[3]), 'b');
});

test('makeRuns: <br/> and <br /> are both recognized', () => {
  assert.ok(isBreak(makeRuns('a<br/>b', {}, cfg)[1]));
  assert.ok(isBreak(makeRuns('a<br />b', {}, cfg)[1]));
});
