# @luytbq/md-to-docx

Convert Markdown to DOCX (Word) with YAML frontmatter config, mermaid diagrams, tables, and images.

## Features

- Headings (H1–H6), paragraphs, bold, italic, inline code, links
- Internal links to headings (`[text](#heading-slug)`, GitHub-style slugs)
- Tables with column alignment and alternating row colors
- Fenced code blocks with language label
- Mermaid diagrams rendered as PNG images, font-size normalized, with optional page slicing for tall diagrams
- Local images (PNG, JPEG, etc.) with optional size override and optional captions
- Bullet and numbered lists (nested; each numbered list restarts at 1)
- Page breaks, horizontal rules
- Full style control via YAML frontmatter (font, size, color, spacing, ...)
- Programmatic API + CLI

## Requirements

- Node.js >= 18
- [`mmdc`](https://github.com/mermaid-js/mermaid-cli) for mermaid diagrams: `npm install -g @mermaid-js/mermaid-cli`
- ImageMagick (`convert`) — **optional**, only needed for `--split-tall-mermaid` (slicing tall diagrams across pages)

## Installation

```bash
npm install -g @luytbq/md-to-docx
```

## CLI

```bash
md-to-docx input.md
md-to-docx input.md -o output.docx
md-to-docx input.md -o output.docx --keep-mermaid-text
md-to-docx input.md --split-tall-mermaid
```

| Flag | Description |
|:-----|:------------|
| `-o`, `--output` | Output `.docx` path. Default: same directory as input, same filename |
| `--keep-mermaid-text` | Append mermaid source code after each rendered diagram |
| `--split-tall-mermaid` | Slice a diagram taller than one page into page-fitting images (keeps font size; needs ImageMagick) |

## Programmatic API

```js
import { convert, convertFile } from '@luytbq/md-to-docx';

// From a markdown string → Buffer
const { buffer, warnings, meta } = await convert(markdownString, {
  baseDir: '/path/to/assets',   // for resolving relative image paths
  keepMermaidText: false,
  splitTall: false,             // slice tall mermaid diagrams across pages (needs ImageMagick)
  config: { /* config overrides — see Config section */ },
});

// From a file → writes .docx file
const { outputPath, warnings, meta } = await convertFile('report.md', {
  output: 'report.docx',        // optional, defaults to same dir
  keepMermaidText: false,
  splitTall: false,
});

// warnings: [{ type: 'mermaid' | 'image' | 'link', message: string }]
for (const w of warnings) console.warn(`[${w.type}] ${w.message}`);

// meta: { hasMermaid: boolean, hasTallMermaid: boolean }
//   hasMermaid     — the document contains at least one mermaid block
//   hasTallMermaid — a diagram is taller than one page (consider splitTall)
```

## Config via YAML Frontmatter

Add a `---` block at the top of your markdown file to control document style:

```markdown
---
title: My Report

page:
  size: A4         # A4 | Letter
  margin: 2        # cm, applies to all sides

body:
  font: Arial
  size: 11
  color: 1F272E
  spacing_after: 6

heading:
  font: Arial
  h1:
    size: 20
    bold: true
    color: 1F272E
    before: 20     # spacing before (pt)
    after: 8       # spacing after (pt)
    align: null    # null | center | right
  h2:
    size: 16
  # h3–h6 follow the same structure

table:
  header:
    fill: 2D4E6E
    color: FFFFFF
    bold: true
    size: 10
  row:
    odd_fill: F0F4F8
    even_fill: FFFFFF
    color: 1F272E
    size: 10
  border: C0C8D0
  border_size: 4
  cell_padding: 0.15  # cm

code:
  font: Courier New
  size: 9
  color: 333333
  fill: F3F4F5
  indent: 0.63        # cm
  label:
    show: true
    fill: E8E8E8
    color: 666666
    size: 8

inline_code:
  font: Courier New
  color: 555555

mermaid:
  render_scale: 2      # mmdc -s: PNG rendered at Nx resolution
  base_font_px: 16     # mermaid's base font (px) at scale 1
  font_size: 9.5       # target font size (pt) for every diagram; 0 = follow body.size
  min_font_pt: 7.5     # never shrink diagram text below this when fitting
  fit_page: true       # shrink a too-tall diagram to fit one page
  fit_tolerance: 0.06  # slack before slicing (absorbs render jitter / slight margin overflow)

image:
  caption: true        # render the image alt text as an italic caption below it

list:
  indent: 0.63        # cm
  bullets:
    - •
    - ◦
    - ▪

link:
  color: 0563C1

output:
  filename: my-report   # output filename without extension
---

# Document starts here
```

## Internal Links

Link to any heading in the document using a GitHub-style slug:

```markdown
## Architecture Overview

See the [Architecture Overview](#architecture-overview) for details.
```

Slugs are lowercase, with punctuation removed and spaces replaced by `-` (unicode
letters, including Vietnamese diacritics, are preserved). Duplicate headings get
`-1`, `-2`, … suffixes (e.g. a second `## Notes` → `#notes-1`). An unresolved link
renders as plain text and emits a `link` warning.

## Mermaid Diagrams

````markdown
```mermaid
graph TD
  A[Start] --> B{Decision}
  B -->|Yes| C[Do it]
  B -->|No| D[Skip]
```
````

If `mmdc` is not found, the diagram falls back to a plain code block and a warning is emitted.

Every diagram is scaled so its text renders at roughly `mermaid.font_size` pt
(default 9.5), so diagrams across the document share a consistent text size rather
than each stretching to the full page width. A diagram taller than one page is
shrunk to fit (down to the `mermaid.min_font_pt` floor); pass `--split-tall-mermaid`
to instead slice it into page-height images at full font size (requires ImageMagick).

**Environment variables:**

| Variable | Description |
|:---------|:------------|
| `MMDC_PATH` | Path to `mmdc` binary |
| `CHROME_PATH` | Path to Chrome/Chromium used by mermaid renderer |

## Images

```markdown
![Caption](./images/chart.png)
![Caption](./images/chart.png =600x400)
![Caption](./images/chart.png){width=600 height=400}
```

Images are resolved relative to the markdown file location (CLI) or `baseDir` option (API).

When `image.caption` is enabled (default), the alt text is rendered as an italic,
centered caption below the image. Set `image.caption: false` to suppress it.

## Page Breaks

```markdown
<div style="page-break-after: always"></div>
```

Or inline:

```
page-break-after: always
```

## License

MIT
