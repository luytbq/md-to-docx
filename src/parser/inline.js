import { TextRun, ExternalHyperlink, InternalHyperlink, UnderlineType } from 'docx';
import { slugify } from './slug.js';

// Inline markdown grammar. Alternatives are tried left-to-right; whichever named group
// participated tells makeRuns which kind of run to emit. `**`/`__` (bold) are listed before
// `*`/`_` (italic) so `**x**` reads as bold, not italic. The `(?<!\w)…(?!\w)` guards stop
// `_`/`__` from matching mid-word (e.g. `my_var_name`).
const INLINE_RE = new RegExp([
  /\*\*(?<boldStars>[^*]+)\*\*/,                          // **bold**
  /(?<!\w)__(?<boldUnders>[^_]+)__(?!\w)/,                // __bold__
  /\*(?<italStars>[^*]+)\*/,                              // *italic*
  /(?<!\w)_(?<italUnders>[^_]+)_(?!\w)/,                  // _italic_
  /`(?<code>[^`]+)`/,                                     // `inline code`
  /\[(?<linkText>[^\]]+)\]\((?<url>https?:\/\/[^)]+)\)/,  // [text](https://…)
  /\[(?<anchorText>[^\]]+)\]\((?<anchor>#[^)]+)\)/,       // [text](#heading)
].map(piece => piece.source).join('|'), 'g');

/**
 * Parse inline markdown (bold, italic, code, external + internal links) into a
 * docx TextRun/ExternalHyperlink/InternalHyperlink array.
 *
 * Scans the text for inline tokens; the gaps between tokens become plain runs.
 *
 * @param {string} text
 * @param {object} base   - base TextRun options (size, color, bold, italics) layered onto every run
 * @param {object} cfg    - full config object
 * @param {object} [ctx]  - render context: { anchorMap, warnings }
 *   - anchorMap: slug → bookmark id, for resolving `[text](#heading)` internal links
 *   - warnings:  array collecting `{ type, message }` (e.g. unresolved internal link)
 */
export function makeRuns(text, base = {}, cfg, ctx = {}) {
  const plain = t => new TextRun({ text: t, font: cfg.body.font, ...base });
  if (!text) return [plain('')];

  // `<br>` → manual line break. Common in table cells, where a literal newline can't
  // exist (one row = one source line). Split on it and recurse; each gap inserts a
  // break run, so inline markdown inside each segment is still parsed normally.
  if (/<br\s*\/?>/i.test(text)) {
    const runs = [];
    text.split(/<br\s*\/?>/i).forEach((seg, i) => {
      if (i > 0) runs.push(new TextRun({ break: 1 }));
      if (seg) runs.push(...makeRuns(seg, base, cfg, ctx));
    });
    return runs;
  }

  const runs = [];
  let pos = 0; // index just past the previously emitted slice

  for (const m of text.matchAll(INLINE_RE)) {
    const g = m.groups;
    if (m.index > pos) runs.push(plain(text.slice(pos, m.index))); // plain text before this token

    const bold = g.boldStars ?? g.boldUnders;
    const italic = g.italStars ?? g.italUnders;
    if (bold != null)
      runs.push(new TextRun({ text: bold, font: cfg.body.font, bold: true, ...base }));
    else if (italic != null)
      runs.push(new TextRun({ text: italic, font: cfg.body.font, italics: true, ...base }));
    else if (g.code != null)
      runs.push(new TextRun({ text: g.code, font: cfg.inlineCode.font, size: (cfg.inlineCode.size || cfg.body.size) * 2, color: cfg.inlineCode.color }));
    else if (g.url != null)
      runs.push(externalLink(g.linkText, g.url, base, cfg));
    else
      runs.push(internalLink(g.anchorText, g.anchor, base, cfg, ctx));

    pos = m.index + m[0].length;
  }
  if (pos < text.length) runs.push(plain(text.slice(pos)));
  return runs;
}

// Colored, underlined text used as the clickable label of a link.
function styledLinkRun(label, base, cfg) {
  return new TextRun({ text: label, font: cfg.body.font, color: cfg.link.color, underline: { type: UnderlineType.SINGLE }, ...base });
}

function externalLink(label, url, base, cfg) {
  return new ExternalHyperlink({ link: url, children: [styledLinkRun(label, base, cfg)] });
}

// Resolve `[label](#anchor)` to a heading bookmark. The anchor map is keyed by slug, so try the
// raw key first (when the author already wrote the slug), then slugify(key) (when they wrote the
// heading text). Unresolved → plain text plus a `link` warning.
function internalLink(label, anchorRef, base, cfg, ctx) {
  const key = decodeURIComponent(anchorRef.slice(1)); // drop leading '#', undo %-encoding
  const anchorMap = ctx.anchorMap || {};
  const anchorId = anchorMap[key] || anchorMap[slugify(key)];
  if (anchorId) return new InternalHyperlink({ anchor: anchorId, children: [styledLinkRun(label, base, cfg)] });
  ctx.warnings?.push({ type: 'link', message: `no section found for ${anchorRef}` });
  return new TextRun({ text: label, font: cfg.body.font, ...base });
}
