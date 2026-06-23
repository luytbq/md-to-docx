---
name: write-md-to-docx
description: >-
  Use when authoring or editing Markdown that will be converted to .docx with the md-to-docx
  tool. Covers its directive system (@config / @doc / @header / @footer / @pagebreak), inline
  & block @style, {doc.*}/{vars.*}/{date} variables, internal #slug links, heading numbering,
  tables, and mermaid. Write to this dialect — not plain Markdown — and verify by running the
  converter and reading its warnings.
---

# Writing Markdown for md-to-docx

md-to-docx is **not** CommonMark. It is a line-by-line parser with an HTML-comment directive
layer. Author to the rules below, then **always run the validation loop** at the end.

Full detail (every config key, default, and unit) is in [`reference.md`](reference.md). This file
is the working cheat-sheet — read `reference.md` when you need a value you don't see here.

## Rule #1 — config lives in directives, NOT YAML frontmatter

There is **no `---` frontmatter**. A leading `---` is parsed as a horizontal rule. All document
config goes in `<!-- @config … -->` / `<!-- @doc … -->` comment blocks (mini-YAML body).

```markdown
<!-- @doc
title: Quarterly Report
author: Finance Team
-->
<!-- @config
page:
  size: A4
  margin: 2
body:
  font: Arial
  size: 11
heading:
  numbering:
    enabled: true
    from: 1
    to: 3
vars:
  version: v1.0
-->
```

`@doc` keys → `{doc.*}` variables. `@config vars:` → `{vars.*}`. Later blocks win on key collision.

## Directives

| Directive | Purpose | Example |
|:--|:--|:--|
| `@config` | Document styling/layout (mini-YAML body) | see above |
| `@doc` | Metadata → `{doc.*}` vars (mini-YAML body) | see above |
| `@header` / `@footer` | Running header/footer, 3 zones | `<!-- @footer center="Page {page} of {pages}" skip_on_first_page=true -->` |
| `@pagebreak` | Hard page break | `<!-- @pagebreak -->` |
| `@style` | Inline / block run styling | see below |

Header/footer args: `left=`, `center=`, `right=` (quote values with spaces), plus `size`, `color`,
`font`, `border_top`/`border_bottom`, `skip_on_first_page` (bool, or an int N to leave the
first N `@pagebreak` segments un-numbered and restart page numbering at 1 after them).
`{page}`/`{pages}` become real page-number fields **only here** (in body they stay literal).

## @style — three forms

```markdown
Inline (wrapping):  This is <!-- @style color=#cc0000 bold -->important<!-- /style --> text.
Self-close (to end of line):  Price: <!-- @style color=red bold /-->1,000,000 VND
Self-close alone (styles the NEXT line; align only works here):
<!-- @style align=center size=20 bold /-->
Centered Title On Its Own Line
```

Keys: `color`, `bg`, `highlight`, `bold`, `italic`, `underline`, `strike`, `sup`, `sub`, `font`,
`size` (pt), `align` (`left`/`center`/`right`, **paragraph-level — only when @style starts the line**).
Colors: named (`red`, `blue`, `green`, `orange`, `gray`, …) or hex (`#cc0000` / `cc0000`).
Markdown still parses inside a styled span.

## Variables

- `{doc.*}`, `{vars.*}`, `{date}`, `{now}` — expand **everywhere**: prose, headings, list items,
  table cells, bold/italic spans, link labels, and header/footer.
- `{page}` / `{pages}` — page-number fields **in header/footer only**; literal in body.
- Inside inline code `` `{doc.title}` `` they are **not** expanded (verbatim).
- Unknown refs stay literal and emit a `var` warning (so typos are caught).

## Standard Markdown + parser gotchas

Bold `**x**`, italic `*x*`, inline code `` `x` ``, external `[t](https://…)`, **internal
`[t](#heading-slug)`** (slug = GitHub-style: lowercase, spaces→`-`, punctuation stripped; Vietnamese
diacritics kept; duplicate headings get `-1`, `-2`). Tables, fenced code, images `![alt](path)`, `>`
blockquotes, `---` HR all work.

Watch out — these differ from CommonMark:

- **No paragraph merging.** Each non-blank line is its own block. To keep text together, let it ride
  as **lazy continuation**: an unmarked line *immediately after* a bullet/numbered item is appended
  to that item (no blank line between).
- **List nesting caps at level 2**; indent is relative (2- or 4-space schemes both work). Any
  heading/code/table/quote/image/HR resets the list.
- **A line starting with `<!--` is consumed as a comment/directive** and won't render as text
  (except a line-starting inline `@style`, which falls through). Mid-line comments are *not* stripped.
- **Escape `\|` inside table cells.** Use `<br>` for a line break inside a cell or a styled span.
- Consecutive numbered lists restart at 1 when separated by a paragraph.

## Mermaid

A ```` ```mermaid ```` fenced block renders to an image. Quote node labels containing special
characters. If rendering fails (bad syntax, or `mmdc`/Chromium unavailable) it degrades to a code
block and emits a `mermaid` warning. Pass `--split-tall-mermaid` for diagrams taller than a page.

## Validation loop — REQUIRED

After writing or editing the `.md`, convert it and resolve every warning before considering the
task done. `convert()` never throws — it reports problems in `warnings` instead.

```bash
npx -p @luytbq43/md-to-docx md-to-docx <file>.md
# (if md-to-docx is already a project dependency: `npx md-to-docx <file>.md`)
```

Read the printed warnings and fix the source until clean:

| Warning | Meaning | Fix |
|:--|:--|:--|
| `var` | A `{ref}` didn't resolve — left literal | Fix the typo, or declare it in `@doc`/`vars:` |
| `link` | `[t](#slug)` matched no heading | Correct the slug to the target heading's GitHub slug |
| `style` | Bad `@style` value (color/size) | Use a valid named/hex color or numeric size |
| `mermaid` | Diagram didn't render | Fix mermaid syntax; quote special-char labels |
| `image` | Image unreadable/missing | Fix the path (relative to the doc / `baseDir`) |
| `heading-numbering` | Level skip or bad `from`/`to` range | Don't skip heading levels inside the numbered range |

Programmatic equivalent: `const { warnings } = await convert(md, opts)` from `@luytbq43/md-to-docx`.
