# @luytbq43/md-to-docx

Convert Markdown to a styled DOCX (Word) document — with tables, mermaid
diagrams, images, and full styling controlled by invisible HTML‑comment
directives. No build step, no global tools.

## Highlights

- **Rich Markdown** — headings, bold/italic/code, internal links, nested lists,
  tables (alignment + alternating rows), fenced code, images, horizontal rules.
- **Mermaid diagrams** rendered to images out of the box (bundled `mmdc` +
  Chromium), font‑size normalized, with optional page slicing for tall diagrams.
- **Directive system** (`<!-- @… -->`) for everything else: `@config` for
  document styling, `@style` for inline run styling, `@header`/`@footer` for
  running headers/footers, `@pagebreak` for page breaks, `@table` for
  per-table options (e.g. `header=false` for headerless tables), `@toc` for
  a native Word table of contents.
- **Variables** — declare metadata/custom values (`@doc`, `vars:`) and reference
  them as `{doc.title}`, `{vars.version}`, `{page}`, `{date}` anywhere in the document.
- **CLI and programmatic API**, both returning structured warnings.

Full authoring details are in the **[Syntax & Configuration Reference](skills/write-md-to-docx/reference.md)**.

## Requirements

- **Node.js >= 18** — the only thing you install.

Everything else is bundled: the mermaid CLI (`mmdc`) and its Chromium ship as
dependencies. The first install downloads a Chromium for puppeteer, so it needs
network access.

**Optional environment overrides:**

| Variable | Description |
|:---------|:------------|
| `MMDC_PATH` | Use a specific `mmdc` binary instead of the bundled one. |
| `CHROME_PATH` | Use a system Chrome/Chromium instead of the bundled one. |
| `PUPPETEER_SKIP_DOWNLOAD=true` | Set during `npm install` to skip the Chromium download (mermaid then falls back to code blocks). |

## Installation

```bash
npm install -g @luytbq43/md-to-docx
```

Or add it to a project:

```bash
npm install @luytbq43/md-to-docx
```

## Usage

### CLI

```bash
md-to-docx input.md                                  # → input.docx (same dir)
md-to-docx input.md -o output.docx                   # explicit output path
md-to-docx input.md -o output.docx --keep-mermaid-text
md-to-docx input.md --split-tall-mermaid
```

| Flag | Description |
|:-----|:------------|
| `-o`, `--output` | Output `.docx` path. Default: same directory and filename as the input. |
| `--keep-mermaid-text` | Append the mermaid source after each rendered diagram. |
| `--split-tall-mermaid` | Slice a diagram taller than one page into page‑fitting images (keeps font size). |

### Programmatic API

```js
import { convert, convertFile } from '@luytbq43/md-to-docx';

// Markdown string → Buffer
const { buffer, warnings, meta } = await convert(markdownString, {
  baseDir: '/path/to/assets',   // resolve relative image paths
  keepMermaidText: false,
  splitTall: false,
  config: { /* config overrides — see the reference */ },
});

// File → writes a .docx file
const { outputPath, warnings, meta } = await convertFile('report.md', {
  output: 'report.docx',        // optional; defaults to the same dir
});

// warnings: [{ type: 'mermaid' | 'image' | 'link' | 'style' | 'var', message: string }]
for (const w of warnings) console.warn(`[${w.type}] ${w.message}`);

// meta: { hasMermaid: boolean, hasTallMermaid: boolean }
```

`convert()` never throws on content problems (a missing image, an unrenderable
mermaid block, an unresolved link): it degrades gracefully and reports the issue
in `warnings`.

## Documentation

- **[Syntax & Configuration Reference](skills/write-md-to-docx/reference.md)** — the full Markdown
  subset, the directive system (`@config`, `@style`, `@header`/`@footer`,
  `@pagebreak`, `@table`, `@toc`), the variable system, and every configuration key with its
  default and unit.

## Authoring with an AI agent

This repo ships a **[`write-md-to-docx` agent skill](skills/write-md-to-docx/SKILL.md)** that teaches an
AI coding agent (Claude Code, Cursor, …) to author Markdown in this tool's dialect — directives, inline
`@style`, variables, internal links — and to verify its output by running the converter and reading the
warnings. Install it into your project with [`npx skills`](https://github.com/vercel-labs/skills):

```bash
npx skills add luytbq/md-to-docx --skill write-md-to-docx
```

## Quick taste

```markdown
<!-- @doc
title: Quarterly Report
-->
<!-- @config
body:
  font: Times New Roman
  size: 12
-->
<!-- @header right="{doc.title}" skip_on_first_page=true -->
<!-- @footer center="Page {page} of {pages}" skip_on_first_page=true -->

# {doc.title}

Revenue rose <!-- @style color=green bold -->12%<!-- /style --> this quarter
(report built {date}).
```

## License

MIT
