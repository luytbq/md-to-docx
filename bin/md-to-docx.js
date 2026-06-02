#!/usr/bin/env node
import { convertFile } from '../src/index.js';

const args = process.argv.slice(2);
if (!args.length || args[0] === '--help' || args[0] === '-h') {
  console.log('Usage: md-to-docx <input.md> [-o output.docx] [--keep-mermaid-text] [--split-tall-mermaid]');
  process.exit(0);
}

const inputPath = args[0];
const oIdx = args.indexOf('-o') !== -1 ? args.indexOf('-o') : args.indexOf('--output');
const output = oIdx !== -1 ? args[oIdx + 1] : undefined;
const keepMermaidText = args.includes('--keep-mermaid-text');
const splitTall = args.includes('--split-tall-mermaid');

convertFile(inputPath, { output, keepMermaidText, splitTall })
  .then(({ outputPath, warnings, meta }) => {
    console.log('OUTPUT: ' + outputPath);
    for (const w of warnings) process.stderr.write(`[${w.type}] ${w.message}\n`);
    if (meta.hasMermaid && !keepMermaidText) {
      console.log('Tip: use --keep-mermaid-text to include mermaid source after diagrams.');
    }
    if (meta.hasTallMermaid && !splitTall) {
      console.log('Tip: a mermaid diagram is taller than one page; use --split-tall-mermaid to slice it into page-fitting images (keeps font size).');
    }
  })
  .catch(err => {
    process.stderr.write(err.message + '\n');
    process.exit(1);
  });
