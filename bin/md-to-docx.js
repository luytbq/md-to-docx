#!/usr/bin/env node
import { convertFile } from '../src/index.js';

const args = process.argv.slice(2);
if (!args.length || args[0] === '--help' || args[0] === '-h') {
  console.log('Usage: md-to-docx <input.md> [-o output.docx] [--keep-mermaid-text]');
  process.exit(0);
}

const inputPath = args[0];
const oIdx = args.indexOf('-o') !== -1 ? args.indexOf('-o') : args.indexOf('--output');
const output = oIdx !== -1 ? args[oIdx + 1] : undefined;
const keepMermaidText = args.includes('--keep-mermaid-text');

convertFile(inputPath, { output, keepMermaidText })
  .then(({ outputPath, warnings }) => {
    console.log('OUTPUT: ' + outputPath);
    for (const w of warnings) process.stderr.write(`[${w.type}] ${w.message}\n`);
    if (warnings.some(w => w.type === 'mermaid') && !keepMermaidText) {
      console.log('Tip: use --keep-mermaid-text to include mermaid source after diagrams.');
    }
  })
  .catch(err => {
    process.stderr.write(err.message + '\n');
    process.exit(1);
  });
