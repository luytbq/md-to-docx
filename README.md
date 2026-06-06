# @luytbq/md-to-docx

Convert Markdown to DOCX (Word) with YAML frontmatter config, mermaid diagrams, tables, and images.

## Features

- Headings (H1–H6), paragraphs, bold, italic, inline code, links
- Internal links to headings (`[text](#heading-slug)`, GitHub-style slugs)
- Manual line breaks with `<br>` (works inside table cells)
- HTML comments `<!-- … -->` on their own line(s) (single- and multi-line) are skipped, like in normal markdown viewers
- Tables with column alignment and alternating row colors
- Fenced code blocks with language label
- Mermaid diagrams rendered as PNG images, font-size normalized, with optional page slicing for tall diagrams
- Local images (PNG, JPEG, etc.) with optional size override and optional captions
- Bullet and numbered lists (nested; each numbered list restarts at 1)
- Page breaks, horizontal rules
- Full style control via YAML frontmatter (font, size, color, spacing, ...)
- Footer with page number (configurable font, size, color)
- Programmatic API + CLI

## Requirements

- **Node.js >= 18** — that's the only thing you install.

Everything else is bundled. The mermaid CLI (`mmdc`) and its Chromium come in as
dependencies, so mermaid diagrams render out of the box after `npm install` — no
global tools, no ImageMagick. The first install downloads a Chromium for
puppeteer, so it needs network access.

**Optional overrides** (env vars):

| Variable | Description |
|:---------|:------------|
| `MMDC_PATH` | Use a specific `mmdc` binary instead of the bundled one |
| `CHROME_PATH` | Use a system Chrome/Chromium instead of the bundled one |
| `PUPPETEER_SKIP_DOWNLOAD=true` | Set during `npm install` to skip the Chromium download (mermaid then falls back to code blocks)|

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

footer:
  page_number: false   # set to true to show page number in footer
  font: Arial          # default: body.font
  size: 9              # default: body.size
  color: 888888        # default: body.color

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

## Line Breaks

Use `<br>` (or `<br/>`) to force a line break inside a single block — most useful in
table cells, where a literal newline can't exist because one row must stay on one
source line:

```markdown
| Tình huống | Mô tả |
| --- | --- |
| Case A | Dòng 1<br>Dòng 2<br>**Dòng 3 đậm** |
```

Inline markdown (`**bold**`, `` `code` ``, links, …) is still parsed within each line,
and `<br><br>` produces consecutive blank lines. A line that is *only* `<br>` (on its
own, outside a table) is treated as a blank paragraph instead.

## Comments

HTML comments that **start a line** are dropped, single- or multi-line:

```markdown
<!-- this whole line is skipped -->

<!-- so is a
multi-line comment -->
```

The closing `-->` line is dropped in full, so don't put visible text after it on the
same line. A comment that begins mid-line (e.g. `text <!-- note -->`) is **not**
stripped — it renders literally.

## Mermaid Diagrams

````markdown
```mermaid
graph TD
  A[Start] --> B{Decision}
  B -->|Yes| C[Do it]
  B -->|No| D[Skip]
```
````

`mmdc` is bundled, so this works out of the box. If it can't be found or rendering
fails (e.g. the Chromium download was skipped), the diagram falls back to a plain
code block and a warning is emitted.

Every diagram is scaled so its text renders at roughly `mermaid.font_size` pt
(default 9.5), so diagrams across the document share a consistent text size rather
than each stretching to the full page width. A diagram taller than one page is
shrunk to fit (down to the `mermaid.min_font_pt` floor); pass `--split-tall-mermaid`
to instead slice it into page-height images at full font size.

To point at a specific `mmdc` or browser, use the `MMDC_PATH` / `CHROME_PATH` env
vars (see [Requirements](#requirements)).

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
