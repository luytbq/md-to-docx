import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

const PACKAGE_NAME = '@luytbq43/md-to-docx';
const REGISTRY_URL = `https://registry.npmjs.org/${PACKAGE_NAME.replace('/', '%2F')}/latest`;
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
// Kept short because the CLI cannot exit until the request settles.
const FETCH_TIMEOUT_MS = 1500;

export function defaultCachePath() {
  const base = process.env.XDG_CACHE_HOME || join(homedir(), '.cache');
  return join(base, 'md-to-docx', 'update-check.json');
}

function parseVersion(v) {
  const core = String(v).trim().replace(/^v/, '').split(/[-+]/)[0];
  const parts = core.split('.').map(n => Number.parseInt(n, 10));
  if (parts.length !== 3 || parts.some(n => !Number.isFinite(n))) return null;
  return parts;
}

/** Returns true when `latest` is a strictly higher x.y.z than `current`. */
export function isNewer(latest, current) {
  const a = parseVersion(latest);
  const b = parseVersion(current);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] > b[i];
  }
  return false;
}

export function isUpdateCheckDisabled(env = process.env) {
  return Boolean(env.MD_TO_DOCX_NO_UPDATE_CHECK || env.NO_UPDATE_NOTIFIER || env.CI);
}

async function readCache(cachePath) {
  try {
    return JSON.parse(await readFile(cachePath, 'utf8'));
  } catch {
    return null;
  }
}

async function writeCache(cachePath, data) {
  try {
    await mkdir(dirname(cachePath), { recursive: true });
    await writeFile(cachePath, JSON.stringify(data));
  } catch {
    // A read-only home directory only means the registry is queried on every run.
  }
}

async function fetchLatest(fetchImpl) {
  const res = await fetchImpl(REGISTRY_URL, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { accept: 'application/json' },
  });
  if (!res.ok) return null;
  const body = await res.json();
  return typeof body.version === 'string' ? body.version : null;
}

/**
 * Resolves to `{ current, latest }` when a newer version is published, otherwise null.
 * Never rejects. The registry is queried at most once per CHECK_INTERVAL_MS; failed
 * queries are cached too, so offline runs do not pay the timeout every time.
 */
export async function checkForUpdate(current, {
  fetchImpl = globalThis.fetch,
  cachePath = defaultCachePath(),
  now = Date.now(),
} = {}) {
  try {
    const cache = await readCache(cachePath);
    let latest = cache?.latest ?? null;

    if (!cache || !(now - cache.checkedAt < CHECK_INTERVAL_MS)) {
      try {
        latest = (await fetchLatest(fetchImpl)) ?? latest;
      } catch {
        // Offline or registry unreachable: fall back to the last known version.
      }
      await writeCache(cachePath, { checkedAt: now, latest });
    }

    return latest && isNewer(latest, current) ? { current, latest } : null;
  } catch {
    return null;
  }
}

export function formatUpdateNotice({ current, latest }) {
  return `Update available: ${PACKAGE_NAME} ${latest} (installed ${current}). ` +
    `Run: npm install -g ${PACKAGE_NAME}`;
}
