import { writeFileSync, readFileSync, unlinkSync } from 'fs';
import { execSync } from 'child_process';

const chromeCandidates = [
  '/usr/bin/google-chrome',
  '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
];

function findMmdc() {
  if (process.env.MMDC_PATH) return process.env.MMDC_PATH;
  try { return execSync('which mmdc', { stdio: 'pipe' }).toString().trim(); } catch (_) {}
  const candidates = [
    '/home/luytbq/.npm-global/bin/mmdc',
    '/usr/local/bin/mmdc',
    '/opt/homebrew/bin/mmdc',
  ];
  for (const p of candidates) {
    try { execSync(`test -x "${p}"`, { stdio: 'pipe' }); return p; } catch (_) {}
  }
  return null;
}

function findChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  return chromeCandidates.find(p => {
    try { execSync(`test -x "${p}"`, { stdio: 'pipe' }); return true; } catch (_) { return false; }
  }) || chromeCandidates[0];
}

// lazy-initialized state
let mmdc = null;
let puppeteerCfgPath = null;
let hasConvert = null;

function ensureInit() {
  if (mmdc !== null) return;
  mmdc = findMmdc() || '';
  const chromeExe = findChrome();
  puppeteerCfgPath = `/tmp/_mmdoc_puppeteer_${process.pid}.json`;
  writeFileSync(puppeteerCfgPath, JSON.stringify({ executablePath: chromeExe }));
}

// Is ImageMagick `convert` available? (needed for tall-diagram slicing) — memoized.
function hasImageMagick() {
  if (hasConvert === null) {
    try { execSync('command -v convert', { stdio: 'pipe' }); hasConvert = true; }
    catch (_) { hasConvert = false; }
  }
  return hasConvert;
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
  if (!mmdc) {
    return { warning: 'mmdc not found — install with: npm install -g @mermaid-js/mermaid-cli' };
  }
  const id = Math.random().toString(36).slice(2);
  const inF = `/tmp/_mermaid_${id}.mmd`;
  const outF = `/tmp/_mermaid_${id}.png`;
  writeFileSync(inF, code);
  try {
    execSync(`"${mmdc}" -i "${inF}" -o "${outF}" --puppeteerConfigFile "${puppeteerCfgPath}" -s ${scale} --backgroundColor white`, { stdio: 'pipe' });
    return { buffer: readFileSync(outF) };
  } catch (e) {
    const raw = (e.stderr?.toString() || e.message || '').trim();
    const lines = raw.split('\n').filter(l => l.trim());
    const errIdx = lines.findIndex(l => l.startsWith('Error:'));
    const snippet = (errIdx >= 0 ? lines.slice(errIdx, errIdx + 3) : lines.slice(0, 3)).join('\n');
    return { warning: `mermaid render failed: ${snippet}` };
  } finally {
    try { unlinkSync(inF); } catch (_) {}
    try { unlinkSync(outF); } catch (_) {}
  }
}

/**
 * Slice a tall PNG into bands (each ≤ bandSrcH source px) so each fits one page.
 * Snaps cut points to the nearest white-background row to avoid cutting through nodes/text.
 * @returns {Array<{buf: Buffer, srcH: number}> | null} bands, or null if unavailable/not tall/failed.
 */
export function sliceTall(imgBuf, w, h, bandSrcH) {
  if (!hasImageMagick() || bandSrcH < 1 || h <= bandSrcH) return null;
  const id = Math.random().toString(36).slice(2);
  const tmp = `/tmp/_mmslice_${id}.png`;
  const sliceFiles = [];
  try {
    writeFileSync(tmp, imgBuf);
    // Brightness profile per row: collapse each row to 1 px (255 = white background).
    let prof = null;
    try {
      prof = execSync(`convert "${tmp}" -colorspace Gray -resize 1x${h}! -depth 8 gray:-`,
                      { stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });
      if (prof.length !== h) prof = null;
    } catch (_) { prof = null; }

    const nSlices = Math.ceil(h / bandSrcH);
    const win = Math.max(1, Math.round(bandSrcH * 0.15));
    // Compute cut points 0 = cuts[0] < cuts[1] < ... < cuts[n] = h
    const cuts = [0];
    for (let k = 1; k < nSlices; k++) {
      const ideal = Math.min(h, k * bandSrcH);
      let cut = ideal;
      if (prof) {
        // Snap UPWARD only (≤ ideal): ideal is already the max that fits one page;
        // cutting later would make the band taller than a page.
        const lo = Math.max(cuts[cuts.length - 1] + 1, ideal - win);
        let best = -1, bestVal = -1;
        for (let y = lo; y <= ideal; y++) {
          const v = prof[y];
          if (v > bestVal || (v === bestVal && y > best)) { bestVal = v; best = y; }  // tie → closest to ideal
        }
        if (best >= 0) cut = best;
      }
      if (cut <= cuts[cuts.length - 1]) cut = Math.min(h, cuts[cuts.length - 1] + bandSrcH);
      cuts.push(cut);
    }
    cuts.push(h);

    const bands = [];
    for (let i = 0; i < cuts.length - 1; i++) {
      const y0 = cuts[i], bandH = cuts[i + 1] - cuts[i];
      if (bandH <= 0) continue;
      const out = `/tmp/_mmslice_${id}_${i}.png`;
      sliceFiles.push(out);
      execSync(`convert "${tmp}" -crop ${w}x${bandH}+0+${y0} +repage "${out}"`, { stdio: 'pipe' });
      bands.push({ buf: readFileSync(out), srcH: bandH });
    }
    return bands.length ? bands : null;
  } catch (_) {
    return null;
  } finally {
    try { unlinkSync(tmp); } catch (_) {}
    for (const f of sliceFiles) { try { unlinkSync(f); } catch (_) {} }
  }
}
