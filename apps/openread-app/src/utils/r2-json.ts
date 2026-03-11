/**
 * R2 JSON read/write helpers for server-side caching.
 *
 * Uses aws4fetch (same as r2.ts) to read and write JSON objects to R2.
 * Designed for intelligence cache but generic enough for any JSON storage.
 */
import { r2Storage } from './r2';
import { createLogger } from './logger';

const log = createLogger('r2-json');

function getBucket(): string {
  const bucket = process.env['R2_BUCKET'];
  if (!bucket) {
    log.error('R2_BUCKET environment variable is not configured');
    throw new Error('R2_BUCKET environment variable is not configured');
  }
  return bucket;
}

function objectUrl(key: string): string {
  return `${r2Storage.getR2Url()}/${getBucket()}/${key}`;
}

/** Read a JSON object from R2. Returns null if not found or on error. */
export async function getJsonFromR2<T>(key: string): Promise<T | null> {
  try {
    const client = r2Storage.getR2Client();
    const resp = await client.fetch(objectUrl(key), { method: 'GET' });

    if (!resp.ok) {
      log.debug(`R2 GET ${key} → ${resp.status} (not found or error)`);
      return null;
    }

    log.debug(`R2 GET ${key} → 200 OK`);
    return (await resp.json()) as T;
  } catch (err) {
    log.error(`R2 GET FAILED: ${key}`, {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/** List R2 keys by prefix. Returns an array of key strings. */
export async function listR2Keys(prefix: string, maxKeys = 50): Promise<string[]> {
  try {
    const client = r2Storage.getR2Client();
    const bucket = getBucket();
    const url = `${r2Storage.getR2Url()}/${bucket}?list-type=2&prefix=${encodeURIComponent(prefix)}&max-keys=${maxKeys}`;
    const resp = await client.fetch(url, { method: 'GET' });
    if (!resp.ok) {
      log.error(`R2 LIST ${prefix} → ${resp.status}`);
      return [];
    }
    const xml = await resp.text();
    const keys: string[] = [];
    const regex = /<Key>([^<]+)<\/Key>/g;
    let match;
    while ((match = regex.exec(xml)) !== null) {
      keys.push(match[1]!);
    }
    return keys;
  } catch (err) {
    log.error(`R2 LIST FAILED: ${prefix}`, {
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}

/** Write a JSON object to R2. Logs errors but does not throw — callers should not depend on write success. */
export async function putJsonToR2<T>(key: string, data: T): Promise<void> {
  try {
    const client = r2Storage.getR2Client();
    const body = JSON.stringify(data);
    log.debug(`R2 PUT ${key} (${body.length} bytes)`);
    const resp = await client.fetch(objectUrl(key), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    if (!resp.ok) {
      log.error(`R2 PUT ${key} → ${resp.status}`, {
        statusText: resp.statusText,
      });
    } else {
      log.debug(`R2 PUT ${key} → ${resp.status} OK`);
    }
  } catch (err) {
    log.error(`R2 PUT FAILED: ${key}`, {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
