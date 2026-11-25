import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isNewer, isUpdateCheckDisabled, checkForUpdate } from '../src/update-check.js';

const DAY = 24 * 60 * 60 * 1000;

async function tmpCache() {
  return join(await mkdtemp(join(tmpdir(), 'md2docx-upd-')), 'nested', 'cache.json');
}

function fakeFetch(version, calls = []) {
  return async (url) => {
    calls.push(url);
    return { ok: true, json: async () => ({ version }) };
  };
}

test('isNewer: compares x.y.z numerically', () => {
  assert.equal(isNewer('0.5.7', '0.5.6'), true);
  assert.equal(isNewer('0.10.0', '0.9.9'), true);
  assert.equal(isNewer('1.0.0', '0.99.99'), true);
  assert.equal(isNewer('0.5.6', '0.5.6'), false);
  assert.equal(isNewer('0.5.5', '0.5.6'), false);
});

test('isNewer: ignores prerelease suffix and rejects malformed versions', () => {
  assert.equal(isNewer('0.6.0-beta.1', '0.5.6'), true);
  assert.equal(isNewer('garbage', '0.5.6'), false);
  assert.equal(isNewer('0.6', '0.5.6'), false);
});

test('isUpdateCheckDisabled: honours opt-out env vars and CI', () => {
  assert.equal(isUpdateCheckDisabled({}), false);
  assert.equal(isUpdateCheckDisabled({ MD_TO_DOCX_NO_UPDATE_CHECK: '1' }), true);
  assert.equal(isUpdateCheckDisabled({ NO_UPDATE_NOTIFIER: '1' }), true);
  assert.equal(isUpdateCheckDisabled({ CI: 'true' }), true);
});

test('checkForUpdate: reports a newer published version and caches it', async () => {
  const cachePath = await tmpCache();
  const res = await checkForUpdate('0.5.6', { fetchImpl: fakeFetch('0.6.0'), cachePath, now: 1000 });
  assert.deepEqual(res, { current: '0.5.6', latest: '0.6.0' });
  assert.deepEqual(JSON.parse(await readFile(cachePath, 'utf8')), { checkedAt: 1000, latest: '0.6.0' });
});

test('checkForUpdate: returns null when already on the latest version', async () => {
  const cachePath = await tmpCache();
  assert.equal(await checkForUpdate('0.6.0', { fetchImpl: fakeFetch('0.6.0'), cachePath }), null);
});

test('checkForUpdate: uses a fresh cache without querying the registry', async () => {
  const cachePath = await tmpCache();
  await checkForUpdate('0.5.6', { fetchImpl: fakeFetch('0.6.0'), cachePath, now: 0 });
  const calls = [];
  const res = await checkForUpdate('0.5.6', { fetchImpl: fakeFetch('9.9.9', calls), cachePath, now: DAY - 1 });
  assert.equal(calls.length, 0);
  assert.equal(res.latest, '0.6.0');
});

test('checkForUpdate: re-queries the registry once the cache is a day old', async () => {
  const cachePath = await tmpCache();
  await checkForUpdate('0.5.6', { fetchImpl: fakeFetch('0.6.0'), cachePath, now: 0 });
  const calls = [];
  const res = await checkForUpdate('0.5.6', { fetchImpl: fakeFetch('0.7.0', calls), cachePath, now: DAY });
  assert.equal(calls.length, 1);
  assert.equal(res.latest, '0.7.0');
});

test('checkForUpdate: network failure keeps the last known version and never throws', async () => {
  const cachePath = await tmpCache();
  await checkForUpdate('0.5.6', { fetchImpl: fakeFetch('0.6.0'), cachePath, now: 0 });
  const failing = async () => { throw new Error('offline'); };
  const res = await checkForUpdate('0.5.6', { fetchImpl: failing, cachePath, now: 2 * DAY });
  assert.equal(res.latest, '0.6.0');
  assert.equal(JSON.parse(await readFile(cachePath, 'utf8')).checkedAt, 2 * DAY);
});

test('checkForUpdate: non-OK registry response yields null on a cold cache', async () => {
  const cachePath = await tmpCache();
  const notFound = async () => ({ ok: false, json: async () => ({}) });
  assert.equal(await checkForUpdate('0.5.6', { fetchImpl: notFound, cachePath }), null);
});
