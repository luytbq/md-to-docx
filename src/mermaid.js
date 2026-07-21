import { writeFileSync, readFileSync, unlinkSync, existsSync } from 'fs';
import { execSync } from 'child_process';
import { createRequire } from 'module';
import { dirname, join } from 'path';
import { tmpdir } from 'os';
import { PNG } from 'pngjs';

const isWindows = process.platform === 'win32';

const chromeCandidates = [
  '/usr/bin/google-chrome',
  '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
];

// Resolve a runnable mmdc command. Prefer an explicit override or one on PATH; otherwise
// fall back to the `@mermaid-js/mermaid-cli` bundled with this package's install (so a plain
// `npm install` — no global tool — still renders mermaid). Returns a shell-ready command string.
function findMmdcCmd() {
  if (process.env.MMDC_PATH) return `"${process.env.MMDC_PATH}"`;
  try {
    const p = execSync(isWindows ? 'where mmdc' : 'which mmdc', { stdio: 'pipe' }).toString().trim().split('\n')[0].trim();
    if (p) return `"${p}"`;
  } catch (_) {}
  // bundled dependency — resolve the mmdc CLI entry and run it with the current Node
  try {
    const require = createRequire(import.meta.url);
    const main = require.resolve('@mermaid-js/mermaid-cli'); // .../mermaid-cli/src/index.js
    const cli = join(dirname(main), 'cli.js');               // .../mermaid-cli/src/cli.js
    if (existsSync(cli)) return `"${process.execPath}" "${cli}"`;
  } catch (_) {}
  for (const p of ['/usr/local/bin/mmdc', '/opt/homebrew/bin/mmdc']) {
    if (existsSync(p)) return `"${p}"`;
  }
  return null;
}

// A system-installed Chrome/Chromium, or null. When null, mmdc uses puppeteer's own
// bundled Chromium (downloaded at install) — no system browser required.
function findSystemChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  return chromeCandidates.find(p => existsSync(p)) || null;
}

// lazy-initialized state
let mmdcCmd = null;
let puppeteerCfgPath = null;

function ensureInit() {
  if (mmdcCmd !== null) return;
  mmdcCmd = findMmdcCmd() || '';
  // --no-sandbox keeps the bundled Chromium working in containers/CI; executablePath is only
  // set when a system Chrome exists, otherwise puppeteer falls back to its bundled browser.
  const puppeteerConfig = { args: ['--no-sandbox', '--disable-setuid-sandbox'] };
  const chromeExe = findSystemChrome();
  if (chromeExe) puppeteerConfig.executablePath = chromeExe;
  puppeteerCfgPath = join(tmpdir(), `_mmdoc_puppeteer_${process.pid}.json`);
  writeFileSync(puppeteerCfgPath, JSON.stringify(puppeteerConfig));
}

export function pngDims(buf) {
  if (buf[0] === 0x89 && buf[1] === 0x50) return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  if (buf[0] === 0xFF && buf[1] === 0xD8) {
    let i = 2;
    while (i < buf.length - 8) {
      if (buf[i] !== 0xFF) break;
      const marker = buf[i + 1];
      const len = buf.readUInt16BE(i + 2);
      if (marker >= 0xC0 && marker <= 0xC3) return { w: buf.readUInt16BE(i + 7), h: buf.readUInt16BE(i + 5) };
      i += 2 + len;
    }
  }
  return { w: 800, h: 600 };
}

/**
 * Render mermaid code to PNG buffer.
 * @param {string} code  - mermaid source
 * @param {number} [scale=2] - mmdc -s render scale (PNG resolution multiplier)
 * Returns { buffer } on success, { warning } on failure.
 */
export function renderMermaid(code, scale = 2) {
  ensureInit();
  if (!mmdcCmd) {
    return { warning: 'mmdc not found — reinstall dependencies (npm install) or install @mermaid-js/mermaid-cli' };
  }
  const id = Math.random().toString(36).slice(2);
  const inF = join(tmpdir(), `_mermaid_${id}.mmd`);
  const outF = join(tmpdir(), `_mermaid_${id}.png`);
  writeFileSync(inF, code);
  try {
    execSync(`${mmdcCmd} -i "${inF}" -o "${outF}" --puppeteerConfigFile "${puppeteerCfgPath}" -s ${scale} --backgroundColor white`, { stdio: 'pipe' });
    return { buffer: readFileSync(outF) };
  } catch (e) {
    const raw = (e.stderr?.toString() || e.message || '').trim();
    const lines = raw.split('\n').filter(l => l.trim());
    const errIdx = lines.findIndex(l => l.startsWith('Error:'));
    const snippet = (errIdx >= 0 ? lines.slice(errIdx, errIdx + 3) : lines.slice(0, 3)).join('\n      ');
    // A "Parse error on line N" means the mermaid SOURCE is invalid (not a tool fault).
    // The overwhelmingly common cause is special characters in a node label that aren't
    // quoted — point the user straight at the fix instead of dumping the raw parser trace.
    const parse = raw.match(/Parse error on line (\d+)/i);
    let warning;
    if (parse) {
      warning =
        `mermaid syntax error on line ${parse[1]} of the diagram (the diagram source, not the .md file).\n` +
        `      Likely cause: a node label contains special characters — ( ) [ ] { } : ; # or <br/> — that aren't quoted.\n` +
        `      Fix: wrap the label text in double quotes, e.g.  A["Node Label<br/>(with text)"]\n` +
        `      Parser said: ${snippet}\n` +
        `      The diagram was inserted as a plain code block instead.`;
    } else {
      warning = `mermaid render failed: ${snippet}\n      The diagram was inserted as a plain code block instead.`;
    }
    return { warning };
  } finally {
    try { unlinkSync(inF); } catch (_) {}
    try { unlinkSync(outF); } catch (_) {}
  }
}

/**
 * Slice a tall PNG into bands (each ≤ bandSrcH source px) so each fits one page.
 * Snaps cut points to the nearest white-background row to avoid cutting through nodes/text.
 * Pure JS (pngjs) — no external tools required.
 * @returns {Array<{buf: Buffer, srcH: number}> | null} bands, or null if not tall / decode failed.
 */
export function sliceTall(imgBuf, w, h, bandSrcH) {
  if (bandSrcH < 1) return null;
  let png;
  try { png = PNG.sync.read(imgBuf); } catch (_) { return null; }
  const W = png.width, H = png.height;
  if (H <= bandSrcH) return null;

  // Brightness profile per row (mean luminance; 255 = white background).
  const prof = new Uint8Array(H);
  const data = png.data;
  for (let y = 0; y < H; y++) {
    let sum = 0;
    let i = y * W * 4;
    for (let x = 0; x < W; x++, i += 4) {
      sum += data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    }
    prof[y] = Math.round(sum / W);
  }

  const nSlices = Math.ceil(H / bandSrcH);
  const win = Math.max(1, Math.round(bandSrcH * 0.15));
  // Compute cut points 0 = cuts[0] < cuts[1] < ... < cuts[n] = H
  const cuts = [0];
  for (let k = 1; k < nSlices; k++) {
    const ideal = Math.min(H, k * bandSrcH);
    let cut = ideal;
    // Snap UPWARD only (≤ ideal): ideal is already the max that fits one page;
    // cutting later would make the band taller than a page.
    const lo = Math.max(cuts[cuts.length - 1] + 1, ideal - win);
    let best = -1, bestVal = -1;
    for (let y = lo; y <= ideal; y++) {
      const v = prof[y];
      if (v > bestVal || (v === bestVal && y > best)) { bestVal = v; best = y; }  // tie → closest to ideal
    }
    if (best >= 0) cut = best;
    if (cut <= cuts[cuts.length - 1]) cut = Math.min(H, cuts[cuts.length - 1] + bandSrcH);
    cuts.push(cut);
  }
  cuts.push(H);

  const bands = [];
  for (let i = 0; i < cuts.length - 1; i++) {
    const y0 = cuts[i], bandH = cuts[i + 1] - cuts[i];
    if (bandH <= 0) continue;
    const band = new PNG({ width: W, height: bandH });
    data.copy(band.data, 0, y0 * W * 4, (y0 + bandH) * W * 4);
    bands.push({ buf: PNG.sync.write(band), srcH: bandH });
  }
  return bands.length ? bands : null;
}

/**
 * Crop the uniform white/transparent margins mermaid (mmdc) bakes into the PNG —
 * sequence diagrams in particular pad both sides, which wastes horizontal space once
 * the image is scaled to the content width and makes wide diagrams read smaller.
 * Pure JS (pngjs); a small `pad` (source px) is kept so content isn't flush to the edge.
 * @returns {{ buf: Buffer, w: number, h: number } | null} cropped image, or null if
 *   decode failed, the image is all background, or there's nothing to trim.
 */
export function trimWhitespace(imgBuf, pad = 6) {
  let png;
  try { png = PNG.sync.read(imgBuf); } catch (_) { return null; }
  const { width: W, height: H, data } = png;
  let minX = W, minY = H, maxX = -1, maxY = -1;
  for (let y = 0; y < H; y++) {
    let i = y * W * 4;
    for (let x = 0; x < W; x++, i += 4) {
      const a = data[i + 3];
      if (a < 16) continue;  // transparent → background
      const lum = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
      if (lum >= 250) continue;  // near-white → background
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return null;  // entirely background
  minX = Math.max(0, minX - pad); minY = Math.max(0, minY - pad);
  maxX = Math.min(W - 1, maxX + pad); maxY = Math.min(H - 1, maxY + pad);
  const cw = maxX - minX + 1, ch = maxY - minY + 1;
  if (cw >= W && ch >= H) return null;  // nothing to trim
  const out = new PNG({ width: cw, height: ch });
  for (let y = 0; y < ch; y++) {
    const src = ((minY + y) * W + minX) * 4;
    data.copy(out.data, y * cw * 4, src, src + cw * 4);
  }
  return { buf: PNG.sync.write(out), w: cw, h: ch };
}
