/**
 * R2 JSON read/write helpers for server-side caching.
 *
 * Uses aws4fetch (same as r2.ts) to read and write JSON objects to R2.
 * Designed for intelligence cache but generic enough for any JSON storage.
 */
import { r2Storage } from './r2';

function getBucket(): string {
  const bucket = process.env['R2_BUCKET'];
  if (!bucket) throw new Error('R2_BUCKET environment variable is not configured');
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

    if (!resp.ok) return null;

    return (await resp.json()) as T;
  } catch (err) {
    console.warn('[R2] Failed to read:', key, err instanceof Error ? err.message : err);
    return null;
  }
}

/** Write a JSON object to R2. Logs warning on error. */
export async function putJsonToR2<T>(key: string, data: T): Promise<void> {
  try {
    const client = r2Storage.getR2Client();
    await client.fetch(objectUrl(key), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  } catch (err) {
    console.warn('[R2] Failed to write:', key, err instanceof Error ? err.message : err);
  }
}
