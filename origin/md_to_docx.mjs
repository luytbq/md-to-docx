import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
         HeadingLevel, AlignmentType, BorderStyle, WidthType, ShadingType,
         VerticalAlign, ExternalHyperlink, LevelFormat, UnderlineType, ImageRun
       } from '/Users/luytbq/.nvm/versions/node/v22.20.0/lib/node_modules/docx/dist/index.mjs';
import { writeFileSync, readFileSync, unlinkSync } from 'fs';
import { dirname, join, basename, resolve } from 'path';
import { execSync } from 'child_process';

const FLAG_KEEP_MERMAID_TEXT = '--keep-mermaid-text';

// ── Flags ─────────────────────────────────────────────────────────────────────
const keepMermaidText = process.argv.includes(FLAG_KEEP_MERMAID_TEXT);

// ── Input ─────────────────────────────────────────────────────────────────────
const src = readFileSync(process.argv[2], 'utf8');
const parts = src.split(/^---\s*$/m);
let yamlRaw = '', body;
if (parts.length >= 3 && parts[0].trim() === '') {
  // Has YAML frontmatter: --- yaml --- body
  yamlRaw = parts[1];
  body = parts.slice(2).join('---').trim();
} else {
  // No frontmatter: treat entire file as body
  body = src.trim();
}

// ── YAML parser (simple key:value + nested + arrays) ─────────────────────────
function parseYaml(text) {
  const lines = text.split('\n');
  const root = {};
  const stack = [{ obj: root, indent: -1 }];
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    if (!raw.trim() || raw.trim().startsWith('#')) continue;
    const indent = raw.search(/\S/);
    const line = raw.trim();
    while (stack.length > 1 && stack[stack.length-1].indent >= indent) stack.pop();
    const cur = stack[stack.length-1].obj;
    if (line.startsWith('- ')) {
      const key = stack[stack.length-1].lastKey;
      if (!Array.isArray(cur[key])) cur[key] = [];
      const val = line.slice(2).trim().replace(/^["']|["']$/g, '');
      cur[key].push(val);
    } else {
      const m = line.match(/^([\w_.-]+)\s*:\s*(.*)/);
      if (!m) continue;
      const [, k, v] = m;
      const val = v.trim().replace(/^["']|["']$/g, '');
      if (val === '' || val === '{}') {
        cur[k] = {};
        stack.push({ obj: cur[k], indent, lastKey: k });
      } else {
        cur[k] = val === 'true' ? true : val === 'false' ? false : isNaN(val) ? val : Number(val);
      }
      stack[stack.length-1].lastKey = k;
    }
  }
  return root;
}

function get(obj, path, def) {
  return path.split('.').reduce((o, k) => (o && o[k] !== undefined ? o[k] : undefined), obj) ?? def;
}

const y = parseYaml(yamlRaw);

// ── Config (YAML overrides defaults) ─────────────────────────────────────────
const cfg = {
  title: get(y, 'title', ''),
  outputFilename: get(y, 'output.filename', ''),
  page: { size: get(y, 'page.size', 'A4'), margin: get(y, 'page.margin', 2) },
  body: { font: get(y, 'body.font', 'Arial'), size: get(y, 'body.size', 11),
          color: get(y, 'body.color', '1F272E'), spacingAfter: get(y, 'body.spacing_after', 6) },
  heading: {
    font: get(y, 'heading.font', 'Arial'),
    h: [null,
      { size: get(y,'heading.h1.size',20), bold: get(y,'heading.h1.bold',true),  italic: get(y,'heading.h1.italic',false), color: get(y,'heading.h1.color','1F272E'), before: get(y,'heading.h1.before',20), after: get(y,'heading.h1.after',8),  align: get(y,'heading.h1.align',null) },
      { size: get(y,'heading.h2.size',16), bold: get(y,'heading.h2.bold',true),  italic: get(y,'heading.h2.italic',false), color: get(y,'heading.h2.color','1F272E'), before: get(y,'heading.h2.before',16), after: get(y,'heading.h2.after',7),  align: get(y,'heading.h2.align',null) },
      { size: get(y,'heading.h3.size',13), bold: get(y,'heading.h3.bold',true),  italic: get(y,'heading.h3.italic',false), color: get(y,'heading.h3.color','1F272E'), before: get(y,'heading.h3.before',13), after: get(y,'heading.h3.after',6),  align: get(y,'heading.h3.align',null) },
      { size: get(y,'heading.h4.size',11), bold: get(y,'heading.h4.bold',true),  italic: get(y,'heading.h4.italic',false), color: get(y,'heading.h4.color','1F272E'), before: get(y,'heading.h4.before',10), after: get(y,'heading.h4.after',5),  align: get(y,'heading.h4.align',null) },
      { size: get(y,'heading.h5.size',11), bold: get(y,'heading.h5.bold',true),  italic: get(y,'heading.h5.italic',true),  color: get(y,'heading.h5.color','1F272E'), before: get(y,'heading.h5.before',8),  after: get(y,'heading.h5.after',4),  align: get(y,'heading.h5.align',null) },
      { size: get(y,'heading.h6.size',10), bold: get(y,'heading.h6.bold',false), italic: get(y,'heading.h6.italic',true),  color: get(y,'heading.h6.color','555555'), before: get(y,'heading.h6.before',6),  after: get(y,'heading.h6.after',3),  align: get(y,'heading.h6.align',null) },
    ],
  },
  table: {
    headerFill:    get(y,'table.header.fill','2D4E6E'),
    headerColor:   get(y,'table.header.color','FFFFFF'),
    headerBold:    get(y,'table.header.bold',true),
    headerSize:    get(y,'table.header.size',10),
    oddFill:       get(y,'table.row.odd_fill','F0F4F8'),
    evenFill:      get(y,'table.row.even_fill','FFFFFF'),
    rowColor:      get(y,'table.row.color','1F272E'),
    rowSize:       get(y,'table.row.size',10),
    border:        get(y,'table.border','C0C8D0'),
    borderSize:    get(y,'table.border_size',4),
    cellPad:       Math.round(get(y,'table.cell_padding',0.15) * 567),
  },
  code: {
    font: get(y,'code.font','Courier New'), size: get(y,'code.size',9),
    color: get(y,'code.color','333333'),    fill: get(y,'code.fill','F3F4F5'),
    indentDXA: Math.round(get(y,'code.indent',0.63)*567),
    labelShow:  get(y,'code.label.show',true),
    labelFill:  get(y,'code.label.fill','E8E8E8'),
    labelColor: get(y,'code.label.color','666666'),
    labelSize:  get(y,'code.label.size',8),
  },
  inlineCode: { font: get(y,'inline_code.font','Courier New'), size: get(y,'inline_code.size',0), color: get(y,'inline_code.color','555555') },
  mermaidCode: {
    font:  get(y,'mermaid_code.font','Courier New'),
    size:  get(y,'mermaid_code.size',7),
    color: get(y,'mermaid_code.color','555555'),
    fill:  get(y,'mermaid_code.fill','F3F4F5'),
  },
  list: { indentDXA: Math.round(get(y,'list.indent',0.63)*567), bullets: get(y,'list.bullets',null) || ['•','◦','▪'] },
  link: { color: get(y,'link.color','0563C1') },
};

const PAGE_SIZES = { A4:[11906,16838], Letter:[12240,15840] };
const PAGE = PAGE_SIZES[cfg.page.size] ?? PAGE_SIZES.A4;
const mg = typeof cfg.page.margin === 'object' ? cfg.page.margin
         : { top: cfg.page.margin, right: cfg.page.margin, bottom: cfg.page.margin, left: cfg.page.margin };
const MG = { top: Math.round(mg.top*567), right: Math.round(mg.right*567), bottom: Math.round(mg.bottom*567), left: Math.round(mg.left*567) };
const CW = PAGE[0] - MG.left - MG.right;

// ── Mermaid renderer ─────────────────────────────────────────────────────────
function findMmdc() {
  const candidates = [
    '/home/luytbq/.npm-global/bin/mmdc',
    '/usr/local/bin/mmdc',
    '/opt/homebrew/bin/mmdc',
  ];
  try { return execSync('which mmdc', { stdio: 'pipe' }).toString().trim(); } catch(_) {}
  for (const p of candidates) { try { execSync(`test -x "${p}"`, { stdio: 'pipe' }); return p; } catch(_) {} }
  return null;
}
const MMDC = findMmdc();
const PUPPETEER_CFG = '/tmp/_mmdoc_puppeteer.json';
const chromeCandidates = ['/usr/bin/google-chrome', '/usr/bin/chromium-browser', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium'];
const chromeExe = chromeCandidates.find(p => { try { execSync(`test -x "${p}"`, { stdio: 'pipe' }); return true; } catch(_) { return false; } }) || chromeCandidates[0];
writeFileSync(PUPPETEER_CFG, JSON.stringify({ executablePath: chromeExe }));

function pngDims(buf) {
  if (buf[0]===0x89 && buf[1]===0x50) return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  // JPEG: scan for SOF markers (0xFFC0..0xFFC3)
  if (buf[0]===0xFF && buf[1]===0xD8) {
    let i = 2;
    while (i < buf.length - 8) {
      if (buf[i]!==0xFF) break;
      const marker = buf[i+1];
      const len = buf.readUInt16BE(i+2);
      if (marker>=0xC0 && marker<=0xC3) return { w: buf.readUInt16BE(i+7), h: buf.readUInt16BE(i+5) };
      i += 2 + len;
    }
  }
  return { w: 800, h: 600 };
}

function renderMermaid(code) {
  if (!MMDC) {
    process.stderr.write(`[mermaid] render failed:\nmmdc not found — install with: npm install -g @mermaid-js/mermaid-cli\n`);
    return null;
  }
  const id = Math.random().toString(36).slice(2);
  const inF = `/tmp/_mermaid_${id}.mmd`;
  const outF = `/tmp/_mermaid_${id}.png`;
  writeFileSync(inF, code);
  try {
    execSync(`"${MMDC}" -i "${inF}" -o "${outF}" --puppeteerConfigFile "${PUPPETEER_CFG}" -s 2 --backgroundColor white`, { stdio: 'pipe' });
    return readFileSync(outF);
  } catch(e) {
    const raw = (e.stderr?.toString() || e.message || '').trim();
    const lines = raw.split('\n').filter(l => l.trim());
    const errIdx = lines.findIndex(l => l.startsWith('Error:'));
    const snippet = (errIdx >= 0 ? lines.slice(errIdx, errIdx + 3) : lines.slice(0, 3)).join('\n');
    process.stderr.write(`[mermaid] render failed:\n${snippet}\n`);
    return null;
  } finally {
    try { unlinkSync(inF); } catch(_) {}
    try { unlinkSync(outF); } catch(_) {}
  }
}

// ── Markdown parser ───────────────────────────────────────────────────────────
function parseMarkdown(md) {
  const lines = md.split('\n');
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    // fenced code block
    if (/^```/.test(line)) {
      const lang = line.slice(3).trim();
      const code = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) code.push(lines[i++]);
      i++;
      blocks.push({ type: 'codeblock', lang, code: code.join('\n') });
      continue;
    }
    // table
    if (/^\|/.test(line) && i+1 < lines.length && /^\|[\s\-:|]+\|/.test(lines[i+1])) {
      const splitCells = s => s.replace(/\\\|/g, '\x00').split('|').map(c => c.replace(/\x00/g, '|').trim());
      const headers = splitCells(line).slice(1,-1);
      const sepCells = splitCells(lines[i+1]).slice(1,-1);
      const align = sepCells.map(s => /^:-+:$/.test(s) ? 'center' : /:-+$/.test(s) ? 'right' : 'left');
      i += 2;
      const rows = [];
      while (i < lines.length && /^\|/.test(lines[i])) {
        rows.push(splitCells(lines[i]).slice(1,-1));
        i++;
      }
      blocks.push({ type: 'table', headers, rows, align });
      continue;
    }
    // heading
    const hm = line.match(/^(#{1,6})\s+(.*)/);
    if (hm) { blocks.push({ type: 'heading', level: hm[1].length, text: hm[2].trim() }); i++; continue; }
    // hr
    if (/^(\*{3,}|-{3,}|_{3,})$/.test(line.trim())) { blocks.push({ type: 'hr' }); i++; continue; }
    // bullet
    const bm = line.match(/^(\s*)[-*+]\s+(.*)/);
    if (bm) { blocks.push({ type: 'bullet', text: bm[2].trim(), indent: Math.min(Math.floor(bm[1].length/2),2) }); i++; continue; }
    // numbered
    const nm = line.match(/^(\s*)\d+\.\s+(.*)/);
    if (nm) { blocks.push({ type: 'numbered', text: nm[2].trim(), indent: Math.min(Math.floor(nm[1].length/4),1) }); i++; continue; }
    // blank
    if (!line.trim()) { blocks.push({ type: 'blank' }); i++; continue; }
    // <br> → blank line
    if (/^<br\s*\/?>$/i.test(line.trim())) { blocks.push({ type: 'blank' }); i++; continue; }
    // page break
    if (/page-break-after\s*:\s*always/i.test(line)) { blocks.push({ type: 'pagebreak' }); i++; continue; }
    // other HTML tags — strip and skip
    if (/^<[^>]+>$/.test(line.trim())) { i++; continue; }
    // image  ![alt](path =WxH)  or  ![alt](path){width=W height=H}
    const imgm = line.trim().match(/^!\[([^\]]*)\]\(([^)]+)\)(\{([^}]*)\})?$/);
    if (imgm) {
      // parse =WxH from URL
      const sizeM = imgm[2].match(/^(.*?)\s+=(\d*)x(\d*)$/);
      const src = sizeM ? sizeM[1].trim() : imgm[2].trim();
      let forceW = sizeM && sizeM[2] ? parseInt(sizeM[2]) : null;
      let forceH = sizeM && sizeM[3] ? parseInt(sizeM[3]) : null;
      // parse {width=W height=H} attributes (supports px suffix)
      if (imgm[4]) {
        const wm = imgm[4].match(/width=(\d+)/);
        const hm = imgm[4].match(/height=(\d+)/);
        if (wm) forceW = parseInt(wm[1]);
        if (hm) forceH = parseInt(hm[1]);
      }
      blocks.push({ type: 'image', alt: imgm[1], src, forceW, forceH });
      i++; continue;
    }
    // paragraph — mỗi dòng là 1 paragraph riêng
    blocks.push({ type: 'paragraph', text: line.trim() });
    i++;
  }
  return blocks;
}

// ── Inline parser ─────────────────────────────────────────────────────────────
function makeRuns(text, base = {}) {
  if (!text) return [new TextRun({ text: '', font: cfg.body.font, ...base })];
  const re = /(\*\*([^*]+)\*\*|(?<!\w)__([^_]+)__(?!\w)|\*([^*]+)\*|(?<!\w)_([^_]+)_(?!\w)|`([^`]+)`|\[([^\]]+)\]\((https?:\/\/[^\)]+)\))/g;
  const runs = []; let last = 0; let m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) runs.push(new TextRun({ text: text.slice(last,m.index), font: cfg.body.font, ...base }));
    if (m[2]||m[3]) runs.push(new TextRun({ text: m[2]||m[3], font: cfg.body.font, bold: true, ...base }));
    else if (m[4]||m[5]) runs.push(new TextRun({ text: m[4]||m[5], font: cfg.body.font, italics: true, ...base }));
    else if (m[6]) runs.push(new TextRun({ text: m[6], font: cfg.inlineCode.font, size: (cfg.inlineCode.size || cfg.body.size)*2, color: cfg.inlineCode.color }));
    else if (m[7]) runs.push(new ExternalHyperlink({ link: m[8], children: [new TextRun({ text: m[7], font: cfg.body.font, color: cfg.link.color, underline: { type: UnderlineType.SINGLE }, ...base })] }));
    last = m.index + m[0].length;
  }
  if (last < text.length) runs.push(new TextRun({ text: text.slice(last), font: cfg.body.font, ...base }));
  return runs;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const BD = { style: BorderStyle.SINGLE, size: cfg.table.borderSize, color: cfg.table.border };
const BORDERS = { top: BD, bottom: BD, left: BD, right: BD, insideH: BD, insideV: BD };
const PAD = { top: cfg.table.cellPad, bottom: cfg.table.cellPad, left: cfg.table.cellPad, right: cfg.table.cellPad };
const atype = s => s==='center'?AlignmentType.CENTER:s==='right'?AlignmentType.RIGHT:AlignmentType.LEFT;

function tcell(text, { width, bold=false, italic=false, color, fill, size=cfg.table.rowSize, borders=BORDERS, align='left' }={}) {
  const rOpts = { bold, italics: italic, size: size*2, font: cfg.body.font };
  if (color) rOpts.color = color;
  const cellOpts = { children: [new Paragraph({ alignment: atype(align), spacing:{after:0}, children: makeRuns(text, rOpts) })],
                     margins: PAD, verticalAlign: VerticalAlign.TOP, borders };
  if (width !== undefined) cellOpts.width = { size: width, type: WidthType.DXA };
  if (fill) cellOpts.shading = { fill, type: ShadingType.CLEAR };
  return new TableCell(cellOpts);
}

function mermaidCodeBlock(code) {
  const paras = [];
  if (cfg.code.labelShow) {
    paras.push(new Paragraph({ style:'MermaidCodeBlock', children: [new TextRun({ text: 'mermaid', font: cfg.mermaidCode.font, size: cfg.code.labelSize*2, color: cfg.code.labelColor })], shading: { fill: cfg.code.labelFill, type: ShadingType.CLEAR }, spacing:{before:0,after:0} }));
  }
  for (const line of code.split('\n')) {
    paras.push(new Paragraph({ style:'MermaidCodeBlock', children:[new TextRun({ text: line||' ', font: cfg.mermaidCode.font, size: cfg.mermaidCode.size*2 })] }));
  }
  return paras;
}

function codeBlock(lang, code) {
  const paras = [];
  if (cfg.code.labelShow && lang && !['text','plain','none',''].includes(lang)) {
    paras.push(new Paragraph({ style:'CodeBlock', children: [new TextRun({ text: lang, font: cfg.code.font, size: cfg.code.labelSize*2, color: cfg.code.labelColor })], shading: { fill: cfg.code.labelFill, type: ShadingType.CLEAR }, spacing:{before:0,after:0} }));
  }
  for (const line of code.split('\n')) {
    paras.push(new Paragraph({ style:'CodeBlock', children:[new TextRun({ text: line||' ', font:cfg.code.font, size:cfg.code.size*2 })] }));
  }
  return paras;
}

function mdTable(block) {
  const cols = block.headers.length;
  const total = block.headers.reduce((s,h)=>s+Math.max(h.length,1),0);
  let widths = block.headers.map(h => Math.max(700, Math.round(Math.max(h.length,1)/total*CW)));
  const diff = CW - widths.reduce((a,b)=>a+b,0);
  widths[widths.indexOf(Math.max(...widths))] += diff;
  const fontSize = Math.max(8, cfg.table.rowSize - Math.floor(Math.max(0,cols-3)/2));
  const rows = [
    new TableRow({ children: block.headers.map((h,i) => tcell(h, { width:widths[i], bold:cfg.table.headerBold, color:cfg.table.headerColor, fill:cfg.table.headerFill, size:cfg.table.headerSize, borders:BORDERS, align:'center' })) }),
    ...block.rows.map((row,ri) => new TableRow({ children: row.map((c,i) => tcell(c, { width:widths[i], fill:ri%2===0?cfg.table.oddFill:cfg.table.evenFill, color:cfg.table.rowColor, size:fontSize, borders:BORDERS, align:block.align[i]||'left' })) }))
  ];
  return new Table({ width:{size:CW,type:WidthType.DXA}, columnWidths:widths, rows });
}

const HL = [null,HeadingLevel.HEADING_1,HeadingLevel.HEADING_2,HeadingLevel.HEADING_3,HeadingLevel.HEADING_4,HeadingLevel.HEADING_5,HeadingLevel.HEADING_6];
const blank = () => new Paragraph({ children:[new TextRun({text:'',font:cfg.body.font})], spacing:{after:40} });
const pageBreak = () => new Paragraph({ children:[new TextRun({text:'',break:1})], pageBreakBefore:true, spacing:{after:0} });

// ── Render ────────────────────────────────────────────────────────────────────
const blocks = parseMarkdown(body);
const children = [];
let hasMermaid = false;

if (cfg.title) {
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 0, after: get(y,'title.spacing_after', 50) * 20 },
    children: [new TextRun({ text: cfg.title, font: cfg.heading.font, size: get(y,'title.size',24)*2, bold: true, color: cfg.body.color })],
  }));
}
for (const b of blocks) {
  if (b.type==='heading') {
    const h = cfg.heading.h[b.level];
    const hAlign = h.align === 'center' ? AlignmentType.CENTER : h.align === 'right' ? AlignmentType.RIGHT : undefined;
    const hPara = { heading: HL[b.level], children: makeRuns(b.text, { bold: h.bold, italics: h.italic, color: h.color, size: h.size*2 }) };
    if (hAlign) hPara.alignment = hAlign;
    children.push(new Paragraph(hPara));
  } else if (b.type==='paragraph') {
    children.push(new Paragraph({ children: makeRuns(b.text), spacing:{after:cfg.body.spacingAfter*20} }));
  } else if (b.type==='bullet') {
    children.push(new Paragraph({ numbering:{reference:'bullet',level:b.indent}, children:makeRuns(b.text), spacing:{after:40} }));
  } else if (b.type==='numbered') {
    children.push(new Paragraph({ numbering:{reference:'number',level:b.indent}, children:makeRuns(b.text), spacing:{after:40} }));
  } else if (b.type==='codeblock') {
    if (b.lang === 'mermaid') {
      hasMermaid = true;
      const imgBuf = renderMermaid(b.code);
      if (imgBuf) {
        const { w, h } = pngDims(imgBuf);
        const imgPxW = Math.round(CW / 15);
        const imgPxH = Math.round(imgPxW * h / w);
        children.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new ImageRun({ data: imgBuf, transformation: { width: imgPxW, height: imgPxH }, type: 'png' })], spacing: { after: cfg.body.spacingAfter * 20 } }));
        if (keepMermaidText) children.push(...mermaidCodeBlock(b.code));
        children.push(blank());
      } else {
        children.push(...codeBlock(b.lang, b.code), blank());
      }
    } else {
      children.push(...codeBlock(b.lang, b.code), blank());
    }
  } else if (b.type==='image') {
    const imgPath = resolve(dirname(process.argv[2]), b.src);
    try {
      const imgBuf = readFileSync(imgPath);
      const { w, h } = pngDims(imgBuf);
      const maxW = Math.round(CW / 15);
      let imgPxW, imgPxH;
      if (b.forceW && b.forceH) { imgPxW = b.forceW; imgPxH = b.forceH; }
      else if (b.forceW)        { imgPxW = b.forceW; imgPxH = Math.round(b.forceW * h / w); }
      else if (b.forceH)        { imgPxH = b.forceH; imgPxW = Math.round(b.forceH * w / h); }
      else                      { imgPxW = Math.min(maxW, w); imgPxH = Math.round(imgPxW * h / w); }
      const ext = imgPath.split('.').pop().toLowerCase();
      const imgType = ext === 'jpg' ? 'jpeg' : ext;
      children.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new ImageRun({ data: imgBuf, transformation: { width: imgPxW, height: imgPxH }, type: imgType })], spacing: { after: cfg.body.spacingAfter * 20 } }));
      if (b.alt) children.push(new Paragraph({ alignment: AlignmentType.CENTER, children: makeRuns(`_${b.alt}_`), spacing: { after: cfg.body.spacingAfter * 20 } }));
    } catch(e) {
      process.stderr.write(`[image] không đọc được: ${imgPath}\n`);
      children.push(new Paragraph({ children: makeRuns(`[Image: ${b.alt || b.src}]`), spacing:{after:cfg.body.spacingAfter*20} }));
    }
  } else if (b.type==='table') {
    children.push(mdTable(b), blank());
  } else if (b.type==='hr') {
    children.push(new Paragraph({ border:{bottom:{style:BorderStyle.SINGLE,size:6,color:cfg.table.border}}, spacing:{before:120,after:120}, children:[new TextRun('')] }));
  } else if (b.type==='pagebreak') {
    children.push(pageBreak());
  } else {
    children.push(blank());
  }
}

// ── Document ──────────────────────────────────────────────────────────────────
const headingStyles = cfg.heading.h.slice(1).map((h,i) => ({
  id: `Heading${i+1}`, name: `Heading ${i+1}`, basedOn:'Normal', next:'Normal', quickFormat:true,
  run: { font:cfg.heading.font, size:h.size*2, bold:h.bold, italics:h.italic, color:h.color },
  paragraph: { spacing:{before:h.before*20,after:h.after*20}, outlineLevel:i }
}));

const doc = new Document({
  numbering: { config: [
    { reference:'bullet', levels: (Array.isArray(cfg.list.bullets)?cfg.list.bullets:['•','◦','▪']).map((ch,i)=>({
        level:i, format:LevelFormat.BULLET, text:ch, alignment:AlignmentType.LEFT,
        style:{run:{font:cfg.body.font},paragraph:{indent:{left:cfg.list.indentDXA*(i+1),hanging:Math.round(cfg.list.indentDXA/2)}}}
      }))
    },
    { reference:'number', levels:[
        {level:0,format:LevelFormat.DECIMAL,text:'%1.',alignment:AlignmentType.LEFT,style:{paragraph:{indent:{left:cfg.list.indentDXA,hanging:Math.round(cfg.list.indentDXA/2)}}}},
        {level:1,format:LevelFormat.LOWER_LETTER,text:'%2.',alignment:AlignmentType.LEFT,style:{paragraph:{indent:{left:cfg.list.indentDXA*2,hanging:Math.round(cfg.list.indentDXA/2)}}}},
      ]
    },
  ]},
  styles: {
    default: { document:{run:{font:cfg.body.font,size:cfg.body.size*2,color:cfg.body.color}} },
    paragraphStyles: [
      ...headingStyles,
      { id:'CodeBlock',name:'Code Block',basedOn:'Normal',next:'Normal',
        run:{font:cfg.code.font,size:cfg.code.size*2,color:cfg.code.color},
        paragraph:{shading:{fill:cfg.code.fill,type:ShadingType.CLEAR},spacing:{before:0,after:0},indent:{left:cfg.code.indentDXA,right:cfg.code.indentDXA}} },
      { id:'MermaidCodeBlock',name:'Mermaid Code Block',basedOn:'Normal',next:'Normal',
        run:{font:cfg.mermaidCode.font,size:cfg.mermaidCode.size*2,color:cfg.mermaidCode.color},
        paragraph:{shading:{fill:cfg.mermaidCode.fill,type:ShadingType.CLEAR},spacing:{before:0,after:0},indent:{left:cfg.code.indentDXA,right:cfg.code.indentDXA}} },
    ],
  },
  sections:[{ properties:{page:{size:{width:PAGE[0],height:PAGE[1]},margin:MG}}, children }],
});

const stem = basename(process.argv[2]).replace(/\.[^.]+$/,'');
const outPath = join(dirname(process.argv[2]), (cfg.outputFilename||stem)+'.docx');
Packer.toBuffer(doc).then(buf => {
  writeFileSync(outPath, buf);
  console.log('OUTPUT: '+outPath);
  if (hasMermaid && !keepMermaidText) {
    console.log(`Tip: Phát hiện tài liệu có mermaid, sử dụng ${FLAG_KEEP_MERMAID_TEXT} để giữ lại mermaid text nếu muốn.`);
  }
});
