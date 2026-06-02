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

function ensureInit() {
  if (mmdc !== null) return;
  mmdc = findMmdc() || '';
  const chromeExe = findChrome();
  puppeteerCfgPath = `/tmp/_mmdoc_puppeteer_${process.pid}.json`;
  writeFileSync(puppeteerCfgPath, JSON.stringify({ executablePath: chromeExe }));
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
 * Returns { buffer } on success, { warning } on failure.
 */
export function renderMermaid(code) {
  ensureInit();
  if (!mmdc) {
    return { warning: 'mmdc not found — install with: npm install -g @mermaid-js/mermaid-cli' };
  }
  const id = Math.random().toString(36).slice(2);
  const inF = `/tmp/_mermaid_${id}.mmd`;
  const outF = `/tmp/_mermaid_${id}.png`;
  writeFileSync(inF, code);
  try {
    execSync(`"${mmdc}" -i "${inF}" -o "${outF}" --puppeteerConfigFile "${puppeteerCfgPath}" -s 2 --backgroundColor white`, { stdio: 'pipe' });
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
