import { Paragraph, ImageRun, AlignmentType } from 'docx';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { pngDims } from '../mermaid.js';

export function imageBlock(block, cfg, CW, baseDir, warnings) {
  const imgPath = resolve(baseDir, block.src);
  let imgBuf;
  try {
    imgBuf = readFileSync(imgPath);
  } catch (_) {
    warnings.push({ type: 'image', message: `Cannot read image: ${imgPath}` });
    return [new Paragraph({ children: [], spacing: { after: cfg.body.spacingAfter * 20 } })];
  }
  const { w, h } = pngDims(imgBuf);
  const maxW = Math.round(CW / 15);
  let imgPxW, imgPxH;
  if (block.forceW && block.forceH) { imgPxW = block.forceW; imgPxH = block.forceH; }
  else if (block.forceW)            { imgPxW = block.forceW; imgPxH = Math.round(block.forceW * h / w); }
  else if (block.forceH)            { imgPxH = block.forceH; imgPxW = Math.round(block.forceH * w / h); }
  else                              { imgPxW = Math.min(maxW, w); imgPxH = Math.round(imgPxW * h / w); }

  const ext = imgPath.split('.').pop().toLowerCase();
  const imgType = ext === 'jpg' ? 'jpeg' : ext;
  const paras = [
    new Paragraph({ alignment: AlignmentType.CENTER, children: [new ImageRun({ data: imgBuf, transformation: { width: imgPxW, height: imgPxH }, type: imgType })], spacing: { after: cfg.body.spacingAfter * 20 } }),
  ];
  return paras;
}
