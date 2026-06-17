// ── YAML parser (simple key:value + nested + arrays) ─────────────────────────
export function parseYaml(text) {
  const lines = text.split('\n');
  const root = {};
  const stack = [{ obj: root, indent: -1 }];
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    if (!raw.trim() || raw.trim().startsWith('#')) continue;
    const indent = raw.search(/\S/);
    const line = raw.trim();
    while (stack.length > 1 && stack[stack.length - 1].indent >= indent) stack.pop();
    const cur = stack[stack.length - 1].obj;
    if (line.startsWith('- ')) {
      let idx = stack.length - 1;
      const key = stack[idx].lastKey;
      let targetObj = stack[idx].obj;
      // If targetObj is an empty placeholder created for 'key', the array belongs at parent level
      if (stack.length >= 2 &&
          typeof targetObj === 'object' && !Array.isArray(targetObj) &&
          Object.keys(targetObj).length === 0 &&
          stack[idx - 1].obj[key] === targetObj) {
        stack[idx - 1].obj[key] = [];
        stack[idx - 1].lastKey = key;
        stack.pop();
        idx--;
        targetObj = stack[idx].obj;
      }
      if (!Array.isArray(targetObj[key])) targetObj[key] = [];
      const val = line.slice(2).trim().replace(/^["']|["']$/g, '');
      targetObj[key].push(val);
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
      stack[stack.length - 1].lastKey = k;
    }
  }
  return root;
}

export function get(obj, path, def) {
  return path.split('.').reduce((o, k) => (o && o[k] !== undefined ? o[k] : undefined), obj) ?? def;
}

/**
 * Resolve a `{variable}` reference (a dotted path) against the variables object to a
 * scalar string/number/boolean, or `undefined` when the path is missing or points at a
 * map. Used for document-wide `{doc.title}` / `{vars.x}` / `{date}` substitution.
 */
export function resolveVar(vars, path) {
  const v = get(vars, path, undefined);
  return (v == null || typeof v === 'object') ? undefined : v;
}

/**
 * Build config from three layers (lowest → highest priority):
 *   1. hardcoded defaults
 *   2. overrides (programmatic opts.config)
 *   3. YAML frontmatter parsed from yamlRaw
 */
export function buildConfig(yamlRaw = '', overrides = {}) {
  const y = parseYaml(yamlRaw);

  // merge helper: YAML wins over overrides wins over defaults
  const g = (path, def) => get(y, path, get(overrides, path, def));

  return {
    title:          g('title', ''),
    outputFilename: g('output.filename', ''),
    page: {
      size:   g('page.size', 'A4'),
      margin: g('page.margin', 2),
    },
    body: {
      font:         g('body.font', 'Arial'),
      size:         g('body.size', 11),
      color:        g('body.color', '1F272E'),
      spacingAfter: g('body.spacing_after', 6),
    },
    heading: {
      font: g('heading.font', 'Arial'),
      numbering: {
        enabled:     g('heading.numbering.enabled', false),
        from:        g('heading.numbering.from', 1),
        to:          g('heading.numbering.to', 3),
        trailingDot: g('heading.numbering.trailing_dot', true),
        separator:   g('heading.numbering.separator', 'space'),  // space | tab | none
      },
      h: [null,
        { size: g('heading.h1.size', 20), bold: g('heading.h1.bold', true),  italic: g('heading.h1.italic', false), color: g('heading.h1.color', '1F272E'), before: g('heading.h1.before', 20), after: g('heading.h1.after', 8),  align: g('heading.h1.align', null) },
        { size: g('heading.h2.size', 16), bold: g('heading.h2.bold', true),  italic: g('heading.h2.italic', false), color: g('heading.h2.color', '1F272E'), before: g('heading.h2.before', 16), after: g('heading.h2.after', 7),  align: g('heading.h2.align', null) },
        { size: g('heading.h3.size', 13), bold: g('heading.h3.bold', true),  italic: g('heading.h3.italic', false), color: g('heading.h3.color', '1F272E'), before: g('heading.h3.before', 13), after: g('heading.h3.after', 6),  align: g('heading.h3.align', null) },
        { size: g('heading.h4.size', 11), bold: g('heading.h4.bold', true),  italic: g('heading.h4.italic', false), color: g('heading.h4.color', '1F272E'), before: g('heading.h4.before', 10), after: g('heading.h4.after', 5),  align: g('heading.h4.align', null) },
        { size: g('heading.h5.size', 11), bold: g('heading.h5.bold', true),  italic: g('heading.h5.italic', true),  color: g('heading.h5.color', '1F272E'), before: g('heading.h5.before', 8),  after: g('heading.h5.after', 4),  align: g('heading.h5.align', null) },
        { size: g('heading.h6.size', 10), bold: g('heading.h6.bold', false), italic: g('heading.h6.italic', true),  color: g('heading.h6.color', '555555'), before: g('heading.h6.before', 6),  after: g('heading.h6.after', 3),  align: g('heading.h6.align', null) },
      ],
    },
    table: {
      headerFill:  g('table.header.fill', ''),
      headerColor: g('table.header.color', '1F272E'),
      headerBold:  g('table.header.bold', true),
      headerSize:  g('table.header.size', 10),
      oddFill:     g('table.row.odd_fill', 'F0F4F8'),
      evenFill:    g('table.row.even_fill', 'FFFFFF'),
      rowColor:    g('table.row.color', '1F272E'),
      rowSize:     g('table.row.size', 10),
      border:      g('table.border', 'C0C8D0'),
      borderSize:  g('table.border_size', 4),
      cellPad:     Math.round(g('table.cell_padding', 0.15) * 567),
    },
    quote: {
      color:        g('quote.color', '1F272E'),     // = body.color default
      italic:       g('quote.italic', true),
      indentDXA:    Math.round(g('quote.indent', 0.63) * 567),
      spacingAfter: g('quote.spacing_after', 6),
      // off by default — set to enable a left bar / shaded box
      borderColor:  g('quote.border.color', ''),
      borderSize:   g('quote.border.size', 24),
      fill:         g('quote.fill', ''),
    },
    code: {
      font:       g('code.font', 'Courier New'),
      size:       g('code.size', 9),
      color:      g('code.color', '333333'),
      fill:       g('code.fill', 'F3F4F5'),
      indentDXA:  Math.round(g('code.indent', 0.63) * 567),
      labelShow:  g('code.label.show', true),
      labelFill:  g('code.label.fill', 'E8E8E8'),
      labelColor: g('code.label.color', '666666'),
      labelSize:  g('code.label.size', 8),
    },
    inlineCode: {
      font:  g('inline_code.font', 'Courier New'),
      size:  g('inline_code.size', 0),
      color: g('inline_code.color', '555555'),
    },
    mermaidCode: {
      font:  g('mermaid_code.font', 'Courier New'),
      size:  g('mermaid_code.size', 7),
      color: g('mermaid_code.color', '555555'),
      fill:  g('mermaid_code.fill', 'F3F4F5'),
    },
    mermaid: {
      // mmdc -s scale: PNG is rendered at `renderScale`× resolution
      renderScale:  g('mermaid.render_scale', 2),
      // base font (px) mermaid uses at scale=1 (default theme ~16px)
      baseFontPx:   g('mermaid.base_font_px', 16),
      // keep image within one page (no taller than content area) to avoid layout breakage
      fitPage:      g('mermaid.fit_page', true),
      // target font size (pt) for EVERY mermaid diagram. 0 = follow body.size.
      // Note: a very tall diagram may still be shrunk below this by the resize/fit-page step.
      fontSize:     g('mermaid.font_size', 10.5),
      // font-size floor (pt) when shrinking — never resize text below this
      minFontPt:    g('mermaid.min_font_pt', 7.5),
      // height tolerance for the slice decision: a diagram only slightly taller than one page
      // (≤ this ratio) at the font floor prefers a one-page resize over slicing. Absorbs mermaid render jitter.
      fitTolerance: g('mermaid.fit_tolerance', 0.06),
      // crop the white margins mmdc bakes around the diagram so it fills the content width
      trim:         g('mermaid.trim', true),
    },
    list: {
      indentDXA: Math.round(g('list.indent', 0.63) * 567),
      bullets:   g('list.bullets', null) || ['•', '◦', '▪'],
    },
    link: { color: g('link.color', '0563C1') },
    image: { caption: g('image.caption', true) },
    footer: {
      pageNumber: g('footer.page_number', false),
      font:       g('footer.font', null),
      size:       g('footer.size', null),
      color:      g('footer.color', null),
    },
  };
}
