import { Paragraph, ImageRun, AlignmentType } from 'docx';
import { renderMermaid, sliceTall, pngDims, trimWhitespace } from '../mermaid.js';
import { codeBlock, mermaidCodeBlock } from './code.js';

/**
 * Render a `mermaid` code block into docx paragraphs.
 *
 * Scales the diagram so its text shows at ~`mermaid.font_size` pt; caps to the
 * content width; if still taller than one page, either slices into page-height
 * bands (when `--split-tall-mermaid` is set; pure-JS, no external tools) or shrinks
 * to fit the page (never below the `min_font_pt` floor).
 *
 * @returns {{ paras: Paragraph[], tall: boolean }}
 *   - paras: the rendered image paragraph(s), or a fallback code block on render failure
 *   - tall:  true if the diagram exceeds one page even at the min-font floor
 */
export function mermaidBlockParagraphs(code, cfg, { CW, PAGE, MG }, splitTall, keepMermaidText, warnings, pageBreakBefore = false) {
  const result = renderMermaid(code, cfg.mermaid.renderScale);
  if (!result.buffer) {
    if (result.warning) warnings.push({ type: 'mermaid', message: result.warning });
    return { paras: codeBlock('mermaid', code, cfg, pageBreakBefore), tall: false };
  }

  // Crop the white side/top margins mmdc bakes in so the diagram fills the content
  // width (wide diagrams otherwise render smaller than they could). Falls back to the
  // original buffer if trimming is disabled or there's nothing to trim.
  let imgBuf = result.buffer;
  const trimmed = cfg.mermaid.trim ? trimWhitespace(result.buffer) : null;
  if (trimmed) imgBuf = trimmed.buf;
  const { w, h } = trimmed ? { w: trimmed.w, h: trimmed.h } : pngDims(result.buffer);
  // Scale so diagram text shows at the target font size.
  // Target = mermaid.font_size if set, else the document body size.
  // PNG is rendered at renderScale×, base font baseFontPx px → font in PNG = baseFontPx*renderScale px.
  const mermaidFontPt = cfg.mermaid.fontSize || cfg.body.size;
  const MERMAID_SCALE = cfg.mermaid.renderScale;
  const targetFontPx = mermaidFontPt * 96 / 72;
  const fontScale = targetFontPx / (cfg.mermaid.baseFontPx * MERMAID_SCALE);
  // Smallest display ratio allowed by the min-font floor (display font scales linearly with scale).
  const sMin = fontScale * cfg.mermaid.minFontPt / mermaidFontPt;
  let imgPxW = Math.round(w * fontScale);
  let imgPxH = Math.round(h * fontScale);
  // Do not exceed content width (CW/15 = content width in px @96dpi).
  const maxW = Math.round(CW / 15);
  if (imgPxW > maxW) { imgPxH = Math.round(imgPxH * maxW / imgPxW); imgPxW = maxW; }
  const maxH = Math.round((PAGE[1] - MG.top - MG.bottom) / 15);  // one page's content height (px)

  let bands = null;
  let tall = false;
  // Can we still resize within the font floor? If shrinking to sMin (nearly) fits one page,
  // just resize (else-branch below) — do NOT slice. Only slice when it is still too tall at the floor.
  // fitTolerance absorbs mermaid render jitter and allows slight margin overflow to avoid over-slicing.
  const fitsAtMinFont = h * sMin <= maxH * (1 + cfg.mermaid.fitTolerance);
  if (imgPxH > maxH && !fitsAtMinFont) {
    tall = true;
    const s = imgPxW / w;  // final display ratio (width-capped) — slice at document font size
    if (splitTall) bands = sliceTall(imgBuf, w, h, Math.floor(maxH / s));
  }

  const paras = [];
  if (bands) {
    // Multiple images, each fitting one page; Word breaks pages between slices.
    const s = imgPxW / w;
    for (const band of bands) {
      paras.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new ImageRun({ data: band.buf, transformation: { width: imgPxW, height: Math.round(band.srcH * s) }, type: 'png' })], spacing: { after: 0 }, pageBreakBefore: pageBreakBefore && paras.length === 0 }));
    }
  } else {
    // No slicing: if still taller than one page, shrink (fit_page) to avoid layout breakage,
    // but never below the font floor (sMin) — overflow the page rather than make text unreadable.
    if (imgPxH > maxH && cfg.mermaid.fitPage) {
      const sFit = Math.max(maxH / h, sMin);
      imgPxW = Math.round(w * sFit); imgPxH = Math.round(h * sFit);
    }
    paras.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new ImageRun({ data: imgBuf, transformation: { width: imgPxW, height: imgPxH }, type: 'png' })], spacing: { after: cfg.body.spacing.after }, pageBreakBefore: pageBreakBefore && paras.length === 0 }));
  }

  if (keepMermaidText) paras.push(...mermaidCodeBlock(code, cfg));
  return { paras, tall };
}
