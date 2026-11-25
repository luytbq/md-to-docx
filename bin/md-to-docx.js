#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { convertFile } from '../src/index.js';
import { checkForUpdate, formatUpdateNotice, isUpdateCheckDisabled } from '../src/update-check.js';

const args = process.argv.slice(2);
if (!args.length || args[0] === '--help' || args[0] === '-h') {
  console.log('Usage: md-to-docx <input.md> [-o output.docx] [--keep-mermaid-text] [--split-tall-mermaid] [--no-update-check]');
  process.exit(0);
}

const inputPath = args[0];
const oIdx = args.indexOf('-o') !== -1 ? args.indexOf('-o') : args.indexOf('--output');
const output = oIdx !== -1 ? args[oIdx + 1] : undefined;
const keepMermaidText = args.includes('--keep-mermaid-text');
const splitTall = args.includes('--split-tall-mermaid');

const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
// Started before converting so the registry round-trip overlaps with rendering.
const updateCheck = args.includes('--no-update-check') || isUpdateCheckDisabled()
  ? Promise.resolve(null)
  : checkForUpdate(version);

convertFile(inputPath, { output, keepMermaidText, splitTall })
  .then(async ({ outputPath, warnings, meta }) => {
    console.log('OUTPUT: ' + outputPath);
    for (const w of warnings) process.stderr.write(`[${w.type}] ${w.message}\n`);
    if (meta.hasMermaid && !keepMermaidText) {
      console.log('Tip: use --keep-mermaid-text to include mermaid source after diagrams.');
    }
    if (meta.hasTallMermaid && !splitTall) {
      console.log('Tip: a mermaid diagram is taller than one page; use --split-tall-mermaid to slice it into page-fitting images (keeps font size).');
    }
    const update = await updateCheck;
    if (update) console.log(formatUpdateNotice(update));
  })
  .catch(err => {
    process.stderr.write(err.message + '\n');
    process.exit(1);
  });
