import { TextRun, ExternalHyperlink, UnderlineType } from 'docx';

/**
 * Parse inline markdown (bold, italic, code, links) into docx TextRun/ExternalHyperlink array.
 * @param {string} text
 * @param {object} base - base TextRun options (size, color, bold, italics, font)
 * @param {object} cfg - full config object
 */
export function makeRuns(text, base = {}, cfg) {
  if (!text) return [new TextRun({ text: '', font: cfg.body.font, ...base })];
  const re = /(\*\*([^*]+)\*\*|(?<!\w)__([^_]+)__(?!\w)|\*([^*]+)\*|(?<!\w)_([^_]+)_(?!\w)|`([^`]+)`|\[([^\]]+)\]\((https?:\/\/[^\)]+)\))/g;
  const runs = [];
  let last = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) runs.push(new TextRun({ text: text.slice(last, m.index), font: cfg.body.font, ...base }));
    if (m[2] || m[3])
      runs.push(new TextRun({ text: m[2] || m[3], font: cfg.body.font, bold: true, ...base }));
    else if (m[4] || m[5])
      runs.push(new TextRun({ text: m[4] || m[5], font: cfg.body.font, italics: true, ...base }));
    else if (m[6])
      runs.push(new TextRun({ text: m[6], font: cfg.inlineCode.font, size: (cfg.inlineCode.size || cfg.body.size) * 2, color: cfg.inlineCode.color }));
    else if (m[7])
      runs.push(new ExternalHyperlink({ link: m[8], children: [new TextRun({ text: m[7], font: cfg.body.font, color: cfg.link.color, underline: { type: UnderlineType.SINGLE }, ...base })] }));
    last = m.index + m[0].length;
  }
  if (last < text.length) runs.push(new TextRun({ text: text.slice(last), font: cfg.body.font, ...base }));
  return runs;
}
