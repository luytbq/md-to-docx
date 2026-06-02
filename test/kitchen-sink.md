---
title: Kitchen Sink — md-to-docx Feature Demo
page:
  size: A4
  margin: 2
body:
  font: Arial
  size: 11
mermaid:
  font_size: 9.5
image:
  caption: true
output:
  filename: kitchen-sink
---

# Introduction

This document exercises **every** feature of `md-to-docx`: headings, inline
formatting, tables, code blocks, mermaid diagrams, images with captions, nested
and numbered lists, internal links, page breaks, and horizontal rules.

Quick navigation:

- Go to [Tables](#tables)
- Go to [Mermaid Diagrams](#mermaid-diagrams)
- Go to [A Tall Diagram](#a-tall-diagram)
- Go to [Images](#images)
- Go to [Lists](#lists)
- Go to [Notes](#notes) and the second [Notes](#notes-1)

## Inline Formatting

A paragraph with **bold**, _italic_, `inline code`, an [external link](https://example.com),
and an [internal link back to Introduction](#introduction).

Markers can mix: **bold with `code` inside**, and _italic spanning words_.

---

## Tables

| Feature        | Status      | Notes                         |
|:---------------|:-----------:|------------------------------:|
| Headings       | Done        | H1–H6                         |
| Internal links | Done        | `[text](#slug)`               |
| Mermaid        | Done        | font-normalized               |
| Tall slicing   | Optional    | needs ImageMagick             |

A cell with a `pipe \| escaped` and an [internal link](#tables) inside it.

## Code Block

```js
function greet(name) {
  return `Hello, ${name}!`;
}
console.log(greet('World'));
```

A fenced block with no language label:

```
plain preformatted text
  preserves    spacing
```

<div style="page-break-after: always"></div>

## Mermaid Diagrams

A normal-sized flowchart (rendered as an image, text normalized to ~9.5pt):

```mermaid
graph TD
  A[Start] --> B{Decision}
  B -->|Yes| C[Do it]
  B -->|No| D[Skip]
  C --> E[End]
  D --> E
```

### A Tall Diagram

A long vertical chain — taller than one page. Run with `--split-tall-mermaid`
(and ImageMagick installed) to slice it across pages; otherwise it is shrunk to fit.

```mermaid
graph TD
  S0[Step 0] --> S1[Step 1] --> S2[Step 2] --> S3[Step 3] --> S4[Step 4]
  S4 --> S5[Step 5] --> S6[Step 6] --> S7[Step 7] --> S8[Step 8] --> S9[Step 9]
  S9 --> S10[Step 10] --> S11[Step 11] --> S12[Step 12] --> S13[Step 13]
  S13 --> S14[Step 14] --> S15[Step 15] --> S16[Step 16] --> S17[Step 17]
  S17 --> S18[Step 18] --> S19[Step 19] --> S20[Step 20] --> S21[Step 21]
  S21 --> S22[Step 22] --> S23[Step 23] --> S24[Step 24] --> S25[Done]
```

## Images

An image with a caption (the alt text appears in italics below it):

![Sample chart rendered at 640×360](./assets/chart.png)

The same image, width-constrained to 300px:

![Constrained chart](./assets/chart.png =300x)

## Lists

Nested bullets (2- and 4-space schemes both work):

- Top level item
  - Nested level one
    - Nested level two
- Back to top level
  this wrapped line is lazily joined onto the item above

Numbered list:

1. First step
2. Second step
3. Third step

A paragraph here breaks the list, so the next list restarts numbering at 1.

1. Fresh first
2. Fresh second

## Notes

This is the first "Notes" section — its slug is `#notes`.

## Notes

This is the second "Notes" section — duplicate heading, so its slug is `#notes-1`.

---

End of the kitchen-sink document.
