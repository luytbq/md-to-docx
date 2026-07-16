import { Paragraph, Table, TableRow, TableCell,
         AlignmentType, BorderStyle, WidthType, ShadingType, VerticalAlign } from 'docx';
import { makeRuns } from '../parser/inline.js';

function atype(s) {
  return s === 'center' ? AlignmentType.CENTER : s === 'right' ? AlignmentType.RIGHT : AlignmentType.LEFT;
}

function borders(cfg) {
  const BD = { style: BorderStyle.SINGLE, size: cfg.table.borderSize, color: cfg.table.border };
  return { top: BD, bottom: BD, left: BD, right: BD, insideH: BD, insideV: BD };
}

function pad(cfg) {
  return { top: cfg.table.cellPad, bottom: cfg.table.cellPad, left: cfg.table.cellPad, right: cfg.table.cellPad };
}

export function tcell(text, { width, bold = false, italic = false, color, fill, size, borders: b, align = 'left', pageBreakBefore = false } = {}, cfg, ctx = {}) {
  const rOpts = { bold, italics: italic, size: (size ?? cfg.table.bodySize) * 2, font: cfg.body.font };
  if (color) rOpts.color = color;
  const cellOpts = {
    children: [new Paragraph({ alignment: atype(align), spacing: cfg.table.spacing, children: makeRuns(text, rOpts, cfg, ctx), pageBreakBefore })],
    margins: pad(cfg),
    verticalAlign: VerticalAlign.TOP,
    borders: b ?? borders(cfg),
  };
  if (width !== undefined) cellOpts.width = { size: width, type: WidthType.DXA };
  if (fill) cellOpts.shading = { fill, type: ShadingType.CLEAR };
  return new TableCell(cellOpts);
}

/**
 * Allocate column widths (DXA) from actual content, not just the header text.
 * Each column's "demand" is the longest cell across its header and body (markdown markers
 * stripped), capped so one very long cell wraps instead of starving the narrow columns;
 * CW is then split proportionally with a per-column minimum, leftover going to the widest.
 */
export function columnWidths(block, CW, { cap = 45, min = 800 } = {}) {
  // Measure the *rendered* width: link markdown collapses to its label (the URL never
  // appears as text — inline.js emits a hyperlink whose visible run is only the label),
  // then emphasis markers are dropped. Links first so `[**x**](url)` measures as `x`.
  const plainLen = s => s
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*_`]/g, '')
    .length;
  const weights = block.headers.map((h, i) => {
    let m = plainLen(h);
    for (const row of block.rows) m = Math.max(m, plainLen(row[i] ?? ''));
    return Math.min(Math.max(m, 1), cap);
  });
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  const widths = weights.map(w => Math.max(min, Math.round(w / total * CW)));
  const diff = CW - widths.reduce((a, b) => a + b, 0);
  widths[widths.indexOf(Math.max(...widths))] += diff;
  return widths;
}

// Per-table options from a `<!-- @table … -->` directive. `header=false` (or the bare
// `no_header` flag) renders the first row as a body row instead of a styled header.
function tableOpts(block, ctx) {
  const opts = block.opts ?? {};
  let noHeader = false;
  for (const [key, val] of Object.entries(opts)) {
    if (key === 'header' || key === 'no_header') {
      const off = key === 'no_header' ? val === true : /^(false|no|0)$/i.test(String(val));
      if (off) noHeader = true;
      else if (key === 'header' && !/^(true|yes|1)$/i.test(String(val)))
        ctx.warnings?.push({ type: 'table', message: `invalid @table value "${key}=${val}" (expected true/false)` });
    } else {
      ctx.warnings?.push({ type: 'table', message: `unknown @table option "${key}"` });
    }
  }
  return { noHeader };
}

export function mdTable(block, cfg, CW, ctx = {}, pageBreakBefore = false) {
  const cols = block.headers.length;
  const widths = columnWidths(block, CW);
  const fontSize = Math.max(8, cfg.table.bodySize - Math.floor(Math.max(0, cols - 3) / 2));
  const BORDERS = borders(cfg);
  const { noHeader } = tableOpts(block, ctx);
  const bodyRows = noHeader ? [block.headers, ...block.rows] : block.rows;
  // Body fill: a uniform `table.body.background` wins; otherwise fall back to optional zebra striping.
  const rowFill = ri => cfg.table.bodyFill || (ri % 2 === 0 ? cfg.table.oddFill : cfg.table.evenFill);
  const bodyRow = (row, ri, pb) => new TableRow({ children: row.map((c, i) => tcell(c, { width: widths[i], bold: cfg.table.bodyBold, fill: rowFill(ri), color: cfg.table.bodyColor, size: fontSize, borders: BORDERS, align: block.align[i] || 'left', pageBreakBefore: pb && i === 0 }, cfg, ctx)) });
  const rows = [
    ...(noHeader ? [] : [new TableRow({ children: block.headers.map((h, i) => tcell(h, { width: widths[i], bold: cfg.table.headerBold, color: cfg.table.headerColor, fill: cfg.table.headerFill, size: cfg.table.headerSize, borders: BORDERS, align: 'center', pageBreakBefore: pageBreakBefore && i === 0 }, cfg, ctx)) })]),
    ...bodyRows.map((row, ri) => bodyRow(row, ri, pageBreakBefore && noHeader && ri === 0)),
  ];
  return new Table({ width: { size: CW, type: WidthType.DXA }, columnWidths: widths, rows });
}
