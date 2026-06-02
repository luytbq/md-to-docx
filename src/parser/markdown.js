export function parseMarkdown(md) {
  const lines = md.split('\n');
  const blocks = [];
  let i = 0;
  let listIndentStack = [];  // stack of seen leading-space widths → bullet nesting levels
  while (i < lines.length) {
    const line = lines[i];

    // fenced code block
    if (/^```/.test(line)) {
      listIndentStack = [];
      const lang = line.slice(3).trim();
      const code = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) code.push(lines[i++]);
      i++;
      blocks.push({ type: 'codeblock', lang, code: code.join('\n') });
      continue;
    }

    // table
    if (/^\|/.test(line) && i + 1 < lines.length && /^\|[\s\-:|]+\|/.test(lines[i + 1])) {
      listIndentStack = [];
      const splitCells = s => s.replace(/\\\|/g, '\x00').split('|').map(c => c.replace(/\x00/g, '|').trim());
      const headers = splitCells(line).slice(1, -1);
      const sepCells = splitCells(lines[i + 1]).slice(1, -1);
      const align = sepCells.map(s => /^:-+:$/.test(s) ? 'center' : /-+:$/.test(s) ? 'right' : 'left');
      i += 2;
      const rows = [];
      while (i < lines.length && /^\|/.test(lines[i])) {
        rows.push(splitCells(lines[i]).slice(1, -1));
        i++;
      }
      blocks.push({ type: 'table', headers, rows, align });
      continue;
    }

    // heading
    const hm = line.match(/^(#{1,6})\s+(.*)/);
    if (hm) { listIndentStack = []; blocks.push({ type: 'heading', level: hm[1].length, text: hm[2].trim() }); i++; continue; }

    // hr
    if (/^(\*{3,}|-{3,}|_{3,})$/.test(line.trim())) { listIndentStack = []; blocks.push({ type: 'hr' }); i++; continue; }

    // bullet — derive nesting level from relative indentation (handles 2- or 4-space schemes)
    const bm = line.match(/^(\s*)[-*+]\s+(.*)/);
    if (bm) {
      const spaces = bm[1].length;
      while (listIndentStack.length && listIndentStack[listIndentStack.length - 1] > spaces) listIndentStack.pop();
      if (!listIndentStack.length || listIndentStack[listIndentStack.length - 1] < spaces) listIndentStack.push(spaces);
      blocks.push({ type: 'bullet', text: bm[2].trim(), indent: Math.min(listIndentStack.length - 1, 2) });
      i++; continue;
    }

    // numbered
    const nm = line.match(/^(\s*)\d+\.\s+(.*)/);
    if (nm) { blocks.push({ type: 'numbered', text: nm[2].trim(), indent: Math.min(Math.floor(nm[1].length / 4), 1) }); i++; continue; }

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
      listIndentStack = [];
      const sizeM = imgm[2].match(/^(.*?)\s+=(\d*)x(\d*)$/);
      const src = sizeM ? sizeM[1].trim() : imgm[2].trim();
      let forceW = sizeM && sizeM[2] ? parseInt(sizeM[2]) : null;
      let forceH = sizeM && sizeM[3] ? parseInt(sizeM[3]) : null;
      if (imgm[4]) {
        const wm = imgm[4].match(/width=(\d+)/);
        const hm = imgm[4].match(/height=(\d+)/);
        if (wm) forceW = parseInt(wm[1]);
        if (hm) forceH = parseInt(hm[1]);
      }
      blocks.push({ type: 'image', alt: imgm[1], src, forceW, forceH });
      i++; continue;
    }

    // lazy continuation — a line that is no other construct, right after a list item, joins it
    const prev = blocks[blocks.length - 1];
    if (prev && (prev.type === 'bullet' || prev.type === 'numbered')) {
      prev.text += ' ' + line.trim();
      i++; continue;
    }

    // paragraph
    blocks.push({ type: 'paragraph', text: line.trim() });
    i++;
  }
  return blocks;
}
