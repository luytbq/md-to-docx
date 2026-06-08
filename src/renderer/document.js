import { Document, Packer, Paragraph, TextRun, HeadingLevel, Bookmark,
         AlignmentType, BorderStyle, ShadingType, LevelFormat, Header, Footer, PageNumber,
         Tab, TabStopType } from 'docx';
import { makeRuns } from '../parser/inline.js';
import { slugify } from '../parser/slug.js';
import { mdTable } from './table.js';
import { codeBlock } from './code.js';
import { imageBlock } from './image.js';
import { mermaidBlockParagraphs } from './mermaid.js';
import { resolveVar } from '../config.js';

const HL = [null, HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3,
            HeadingLevel.HEADING_4, HeadingLevel.HEADING_5, HeadingLevel.HEADING_6];

const PAGE_SIZES = { A4: [11906, 16838], Letter: [12240, 15840] };

function blank(cfg) {
  return new Paragraph({ children: [new TextRun({ text: '', font: cfg.body.font })], spacing: { after: 40 } });
}

function pageBreak() {
  return new Paragraph({ children: [new TextRun({ text: '', break: 1 })], pageBreakBefore: true, spacing: { after: 0 } });
}

// ── Running header/footer (3 zones + tokens) ─────────────────────────────────

// Expand a zone string into TextRuns: {page}/{pages} become page-number fields, every
// other {var} resolves through the document variables (e.g. {doc.title}, {date}); an
// unresolved token and ordinary text stay literal.
function runningRuns(text, runOpts, vars) {
  const out = [];
  for (const part of String(text).split(/(\{[a-zA-Z_][\w.]*\})/g)) {
    if (part === '') continue;
    const tok = /^\{([a-zA-Z_][\w.]*)\}$/.exec(part);
    if (!tok)                    { out.push(new TextRun({ ...runOpts, text: part })); continue; }
    if (tok[1] === 'page')       { out.push(new TextRun({ ...runOpts, children: [PageNumber.CURRENT] })); continue; }
    if (tok[1] === 'pages')      { out.push(new TextRun({ ...runOpts, children: [PageNumber.TOTAL_PAGES] })); continue; }
    const v = resolveVar(vars, tok[1]);
    out.push(new TextRun({ ...runOpts, text: v !== undefined ? String(v) : part }));
  }
  return out;
}

// Build a header/footer paragraph: left zone at the start, center after a center tab,
// right after a right tab — the standard 3-zone OOXML layout.
function runningParagraph(zones, cfg, CW, vars) {
  const runOpts = {
    font:  zones.font ?? cfg.footer.font ?? cfg.body.font,
    size:  (Number(zones.size) || cfg.footer.size || cfg.body.size) * 2,
    color: String(zones.color ?? cfg.footer.color ?? cfg.body.color),
  };
  const children = [];
  if (zones.left)   children.push(...runningRuns(zones.left, runOpts, vars));
  if (zones.center) children.push(new TextRun({ children: [new Tab()] }), ...runningRuns(zones.center, runOpts, vars));
  if (zones.right)  children.push(new TextRun({ children: [new Tab()] }), ...runningRuns(zones.right, runOpts, vars));
  const border = zones.border_top    ? { top:    { style: BorderStyle.SINGLE, size: 4, color: cfg.table.border } }
               : zones.border_bottom ? { bottom: { style: BorderStyle.SINGLE, size: 4, color: cfg.table.border } }
               : undefined;
  return new Paragraph({
    tabStops: [{ type: TabStopType.CENTER, position: Math.round(CW / 2) }, { type: TabStopType.RIGHT, position: CW }],
    ...(border ? { border } : {}),
    children,
  });
}

export async function buildDocument(blocks, cfg, { baseDir, keepMermaidText = false, splitTall = false, header = null, footer = null, vars = {} } = {}) {
  const warnings = [];
  const PAGE = PAGE_SIZES[cfg.page.size] ?? PAGE_SIZES.A4;
  const mg = typeof cfg.page.margin === 'object' ? cfg.page.margin
    : { top: cfg.page.margin, right: cfg.page.margin, bottom: cfg.page.margin, left: cfg.page.margin };
  const MG = { top: Math.round(mg.top * 567), right: Math.round(mg.right * 567), bottom: Math.round(mg.bottom * 567), left: Math.round(mg.left * 567) };
  const CW = PAGE[0] - MG.left - MG.right;

  const children = [];
  let hasMermaid = false;
  let hasTallMermaid = false;

  // Pre-pass: assign a bookmark id to each heading, map slug → id (GitHub-style dedupe: -1, -2…).
  // ctx carries the anchorMap (for resolving `[text](#heading)` links) and the warnings sink to makeRuns.
  const anchorMap = {};
  { const seen = {}; let n = 0;
    for (const b of blocks) {
      if (b.type !== 'heading') continue;
      let slug = slugify(b.text);
      if (seen[slug] != null) { seen[slug]++; slug = `${slug}-${seen[slug]}`; } else seen[slug] = 0;
      b.anchorId = `_h${n++}`;
      anchorMap[slug] = b.anchorId;
    }
  }
  const ctx = { anchorMap, warnings, vars };

  // The document title is not auto-rendered; `cfg.title` only feeds the `{title}`
  // header/footer token. A visible title is just normal body content the author writes.

  // Each separate numbered list needs its own instance so it restarts at 1 (a shared reference keeps counting up).
  // A list stays continuous across blank lines and nested bullets; only a real content block
  // (paragraph, heading, hr, table, code, image) breaks it → the next numbered list then resets to 1.
  const RESETS_NUMBERING = b => !['numbered', 'blank', 'bullet'].includes(b.type);
  let numInstance = 0;
  let inNumberedList = false;

  for (const b of blocks) {
    if (RESETS_NUMBERING(b)) inNumberedList = false;

    if (b.type === 'heading') {
      const h = cfg.heading.h[b.level];
      const hAlign = h.align === 'center' ? AlignmentType.CENTER : h.align === 'right' ? AlignmentType.RIGHT : undefined;
      const hRuns = makeRuns(b.text, { bold: h.bold, italics: h.italic, color: h.color, size: h.size * 2 }, cfg, ctx);
      const hPara = { heading: HL[b.level], children: b.anchorId ? [new Bookmark({ id: b.anchorId, children: hRuns })] : hRuns };
      if (hAlign) hPara.alignment = hAlign;
      children.push(new Paragraph(hPara));

    } else if (b.type === 'paragraph') {
      children.push(new Paragraph({ children: makeRuns(b.text, {}, cfg, ctx), spacing: { after: cfg.body.spacingAfter * 20 } }));

    } else if (b.type === 'bullet') {
      children.push(new Paragraph({ numbering: { reference: 'bullet', level: b.indent }, children: makeRuns(b.text, {}, cfg, ctx), spacing: { after: 40 } }));

    } else if (b.type === 'numbered') {
      if (!inNumberedList) { numInstance++; inNumberedList = true; }
      children.push(new Paragraph({ numbering: { reference: 'number', level: b.indent, instance: numInstance }, children: makeRuns(b.text, {}, cfg, ctx), spacing: { after: 40 } }));

    } else if (b.type === 'codeblock') {
      if (b.lang === 'mermaid') {
        hasMermaid = true;
        const { paras, tall } = mermaidBlockParagraphs(b.code, cfg, { CW, PAGE, MG }, splitTall, keepMermaidText, warnings);
        if (tall) hasTallMermaid = true;
        children.push(...paras, blank(cfg));
      } else {
        children.push(...codeBlock(b.lang, b.code, cfg), blank(cfg));
      }

    } else if (b.type === 'image') {
      children.push(...imageBlock(b, cfg, CW, baseDir, warnings, ctx));

    } else if (b.type === 'table') {
      children.push(mdTable(b, cfg, CW, ctx), blank(cfg));

    } else if (b.type === 'hr') {
      children.push(new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: cfg.table.border } }, spacing: { before: 120, after: 120 }, children: [new TextRun('')] }));

    } else if (b.type === 'pagebreak') {
      children.push(pageBreak());

    } else {
      children.push(blank(cfg));
    }
  }

  const headingStyles = cfg.heading.h.slice(1).map((h, i) => ({
    id: `Heading${i + 1}`, name: `Heading ${i + 1}`, basedOn: 'Normal', next: 'Normal', quickFormat: true,
    run: { font: cfg.heading.font, size: h.size * 2, bold: h.bold, italics: h.italic, color: h.color },
    paragraph: { spacing: { before: h.before * 20, after: h.after * 20 }, outlineLevel: i },
  }));

  const bullets = Array.isArray(cfg.list.bullets) ? cfg.list.bullets : ['•', '◦', '▪'];

  // Running header/footer. A `@header`/`@footer` directive (3 zones + tokens) wins;
  // otherwise legacy `cfg.footer.pageNumber` renders a right-aligned page number.
  // `skip_on_first_page` uses a Word title-page section (`titlePage`) so page 1 gets
  // an empty `first` header/footer while later pages keep the `default` one.
  const isTrue = v => v === true || v === 'true';
  if (footer && footer.page_number && !footer.left && !footer.center && !footer.right) footer.right = '{page}';
  const skipHeaderFirst = !!(header && isTrue(header.skip_on_first_page));
  const skipFooterFirst = !!(footer && isTrue(footer.skip_on_first_page));
  const titlePage = skipHeaderFirst || skipFooterFirst;
  const emptyPara = () => new Paragraph({ children: [] });

  let headersOpt, footersOpt;
  if (header) {
    headersOpt = { default: new Header({ children: [runningParagraph(header, cfg, CW, vars)] }) };
    if (titlePage) headersOpt.first = skipHeaderFirst ? new Header({ children: [emptyPara()] }) : new Header({ children: [runningParagraph(header, cfg, CW, vars)] });
  }
  const footerZones = footer ?? (cfg.footer.pageNumber ? { right: '{page}' } : null);
  if (footerZones) {
    footersOpt = { default: new Footer({ children: [runningParagraph(footerZones, cfg, CW, vars)] }) };
    if (titlePage) footersOpt.first = skipFooterFirst ? new Footer({ children: [emptyPara()] }) : new Footer({ children: [runningParagraph(footerZones, cfg, CW, vars)] });
  }

  const doc = new Document({
    numbering: {
      config: [
        {
          reference: 'bullet',
          levels: bullets.map((ch, i) => ({
            level: i, format: LevelFormat.BULLET, text: ch, alignment: AlignmentType.LEFT,
            style: { run: { font: cfg.body.font }, paragraph: { indent: { left: cfg.list.indentDXA * (i + 1), hanging: Math.round(cfg.list.indentDXA / 2) } } },
          })),
        },
        {
          reference: 'number',
          levels: [
            { level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: cfg.list.indentDXA, hanging: Math.round(cfg.list.indentDXA / 2) } } } },
            { level: 1, format: LevelFormat.LOWER_LETTER, text: '%2.', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: cfg.list.indentDXA * 2, hanging: Math.round(cfg.list.indentDXA / 2) } } } },
          ],
        },
      ],
    },
    styles: {
      default: { document: { run: { font: cfg.body.font, size: cfg.body.size * 2, color: cfg.body.color } } },
      paragraphStyles: [
        ...headingStyles,
        {
          id: 'CodeBlock', name: 'Code Block', basedOn: 'Normal', next: 'Normal',
          run: { font: cfg.code.font, size: cfg.code.size * 2, color: cfg.code.color },
          paragraph: { shading: { fill: cfg.code.fill, type: ShadingType.CLEAR }, spacing: { before: 0, after: 0 }, indent: { left: cfg.code.indentDXA, right: cfg.code.indentDXA } },
        },
        {
          id: 'MermaidCodeBlock', name: 'Mermaid Code Block', basedOn: 'Normal', next: 'Normal',
          run: { font: cfg.mermaidCode.font, size: cfg.mermaidCode.size * 2, color: cfg.mermaidCode.color },
          paragraph: { shading: { fill: cfg.mermaidCode.fill, type: ShadingType.CLEAR }, spacing: { before: 0, after: 0 }, indent: { left: cfg.code.indentDXA, right: cfg.code.indentDXA } },
        },
      ],
    },
    sections: [{
      properties: { page: { size: { width: PAGE[0], height: PAGE[1] }, margin: MG }, ...(titlePage ? { titlePage: true } : {}) },
      children,
      ...(headersOpt ? { headers: headersOpt } : {}),
      ...(footersOpt ? { footers: footersOpt } : {}),
    }],
  });

  const buffer = await Packer.toBuffer(doc);
  return { buffer, warnings, meta: { hasMermaid, hasTallMermaid } };
}
