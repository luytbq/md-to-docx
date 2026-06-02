import { Paragraph, TextRun, ShadingType } from 'docx';

export function codeBlock(lang, code, cfg) {
  const paras = [];
  if (cfg.code.labelShow && lang && !['text', 'plain', 'none', ''].includes(lang)) {
    paras.push(new Paragraph({
      style: 'CodeBlock',
      children: [new TextRun({ text: lang, font: cfg.code.font, size: cfg.code.labelSize * 2, color: cfg.code.labelColor })],
      shading: { fill: cfg.code.labelFill, type: ShadingType.CLEAR },
      spacing: { before: 0, after: 0 },
    }));
  }
  for (const line of code.split('\n')) {
    paras.push(new Paragraph({
      style: 'CodeBlock',
      children: [new TextRun({ text: line || ' ', font: cfg.code.font, size: cfg.code.size * 2 })],
    }));
  }
  return paras;
}

export function mermaidCodeBlock(code, cfg) {
  const paras = [];
  if (cfg.code.labelShow) {
    paras.push(new Paragraph({
      style: 'MermaidCodeBlock',
      children: [new TextRun({ text: 'mermaid', font: cfg.mermaidCode.font, size: cfg.code.labelSize * 2, color: cfg.code.labelColor })],
      shading: { fill: cfg.code.labelFill, type: ShadingType.CLEAR },
      spacing: { before: 0, after: 0 },
    }));
  }
  for (const line of code.split('\n')) {
    paras.push(new Paragraph({
      style: 'MermaidCodeBlock',
      children: [new TextRun({ text: line || ' ', font: cfg.mermaidCode.font, size: cfg.mermaidCode.size * 2 })],
    }));
  }
  return paras;
}
