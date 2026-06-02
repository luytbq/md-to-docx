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

export function tcell(text, { width, bold = false, italic = false, color, fill, size, borders: b, align = 'left' } = {}, cfg, ctx = {}) {
  const rOpts = { bold, italics: italic, size: (size ?? cfg.table.rowSize) * 2, font: cfg.body.font };
  if (color) rOpts.color = color;
  const cellOpts = {
    children: [new Paragraph({ alignment: atype(align), spacing: { after: 0 }, children: makeRuns(text, rOpts, cfg, ctx) })],
    margins: pad(cfg),
    verticalAlign: VerticalAlign.TOP,
    borders: b ?? borders(cfg),
  };
  if (width !== undefined) cellOpts.width = { size: width, type: WidthType.DXA };
  if (fill) cellOpts.shading = { fill, type: ShadingType.CLEAR };
  return new TableCell(cellOpts);
}

export function mdTable(block, cfg, CW, ctx = {}) {
  const cols = block.headers.length;
  const total = block.headers.reduce((s, h) => s + Math.max(h.length, 1), 0);
  let widths = block.headers.map(h => Math.max(700, Math.round(Math.max(h.length, 1) / total * CW)));
  const diff = CW - widths.reduce((a, b) => a + b, 0);
  widths[widths.indexOf(Math.max(...widths))] += diff;
  const fontSize = Math.max(8, cfg.table.rowSize - Math.floor(Math.max(0, cols - 3) / 2));
  const BORDERS = borders(cfg);
  const rows = [
    new TableRow({ children: block.headers.map((h, i) => tcell(h, { width: widths[i], bold: cfg.table.headerBold, color: cfg.table.headerColor, fill: cfg.table.headerFill, size: cfg.table.headerSize, borders: BORDERS, align: 'center' }, cfg, ctx)) }),
    ...block.rows.map((row, ri) => new TableRow({ children: row.map((c, i) => tcell(c, { width: widths[i], fill: ri % 2 === 0 ? cfg.table.oddFill : cfg.table.evenFill, color: cfg.table.rowColor, size: fontSize, borders: BORDERS, align: block.align[i] || 'left' }, cfg, ctx)) })),
  ];
  return new Table({ width: { size: CW, type: WidthType.DXA }, columnWidths: widths, rows });
}
