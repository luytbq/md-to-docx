import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PNG } from 'pngjs';
import { sliceTall, pngDims, trimWhitespace } from '../src/mermaid.js';

function makePng(w, h) {
  const png = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y++) {
    const white = y % 250 < 5;            // periodic white rows to snap cuts onto
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const v = white ? 255 : 120;
      png.data[i] = v; png.data[i + 1] = v; png.data[i + 2] = v; png.data[i + 3] = 255;
    }
  }
  return PNG.sync.write(png);
}

test('sliceTall: returns null when image is not taller than a band', () => {
  const buf = makePng(100, 200);
  assert.equal(sliceTall(buf, 100, 200, 300), null);
});

test('sliceTall: slices a tall PNG into bands covering the full height', () => {
  const buf = makePng(200, 1000);
  const bands = sliceTall(buf, 200, 1000, 300);
  assert.ok(Array.isArray(bands));
  assert.ok(bands.length >= 4);
  assert.equal(bands.reduce((a, b) => a + b.srcH, 0), 1000);
  // every band is a valid PNG and no taller than the band limit
  for (const b of bands) {
    assert.ok(Buffer.isBuffer(b.buf) && b.buf[0] === 0x89 && b.buf[1] === 0x50);
    assert.ok(b.srcH <= 300);
    assert.deepEqual(pngDims(b.buf), { w: 200, h: b.srcH });
  }
});

test('sliceTall: returns null on undecodable buffer', () => {
  assert.equal(sliceTall(Buffer.from('not a png'), 10, 9999, 100), null);
});

// White canvas with a dark content rectangle inset by `m` on every side.
function makeBordered(W, H, m) {
  const png = new PNG({ width: W, height: H });
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const content = x >= m && x < W - m && y >= m && y < H - m;
      const v = content ? 80 : 255;
      png.data[i] = v; png.data[i + 1] = v; png.data[i + 2] = v; png.data[i + 3] = 255;
    }
  }
  return PNG.sync.write(png);
}

test('trimWhitespace: crops the white margin down to the content (with pad)', () => {
  const buf = makeBordered(200, 100, 40);   // content box is 120×20, inset 40px all round
  const t = trimWhitespace(buf, 6);
  assert.ok(t);
  assert.equal(t.w, 120 + 12);              // content + pad on both sides
  assert.equal(t.h, 20 + 12);
  assert.deepEqual(pngDims(t.buf), { w: t.w, h: t.h });
});

test('trimWhitespace: a pad that swallows the whole margin yields no trim (null)', () => {
  const buf = makeBordered(200, 100, 40);
  // pad far exceeds the margin → crop clamps back to the full image → nothing gained.
  assert.equal(trimWhitespace(buf, 1000), null);
});

test('trimWhitespace: returns null when there is nothing to trim', () => {
  const buf = makeBordered(120, 40, 0);     // content fills the whole canvas
  assert.equal(trimWhitespace(buf, 0), null);
});

test('trimWhitespace: returns null on an all-white image and on a bad buffer', () => {
  const white = makeBordered(50, 50, 25);   // inset 25 on a 50px canvas → no content pixels
  assert.equal(trimWhitespace(white), null);
  assert.equal(trimWhitespace(Buffer.from('not a png')), null);
});
