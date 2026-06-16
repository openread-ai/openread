import {
  parseCatalogBookRef,
  parseLocalBookHash,
  parseMetaHash,
  parseOpenReadBookReference,
  parsePlatformBookHash,
  parseSyncableBookRef,
  type CatalogBookRef,
  type LocalBookHash,
  type MetaHash,
  type OpenReadBookReference,
  type PlatformBookHash,
  type SyncableBookRef,
} from '@openread/types';

const fixtureHex = (seed: string, length: 32 | 64): string => {
  const source = seed.length ? seed : 'openread-test-book';
  let hex = '';
  for (let index = 0; hex.length < length; index += 1) {
    const code = source.charCodeAt(index % source.length) + index;
    hex += (code % 256).toString(16).padStart(2, '0');
  }
  return hex.slice(0, length);
};

export const testLocalBookHash = (seed: string): LocalBookHash => {
  const parsed = parseLocalBookHash(fixtureHex(seed, 32));
  if (!parsed) throw new Error(`Invalid local book hash fixture: ${seed}`);
  return parsed;
};

export const testPlatformBookHash = (seed: string): PlatformBookHash => {
  const parsed = parsePlatformBookHash(fixtureHex(seed, 64));
  if (!parsed) throw new Error(`Invalid platform book hash fixture: ${seed}`);
  return parsed;
};

export const testCatalogBookRef = (id = '65119855-9d37-4caf-a7a4-4a5f9c9572d5'): CatalogBookRef => {
  const value = id.startsWith('catalog:') ? id : `catalog:${id}`;
  const parsed = parseCatalogBookRef(value);
  if (!parsed) throw new Error(`Invalid catalog book ref fixture: ${id}`);
  return parsed;
};

export const testOpenReadBookRef = (seed: string): OpenReadBookReference =>
  parseOpenReadBookReference(seed) ?? testLocalBookHash(seed);

export const testSyncableBookRef = (seed: string): SyncableBookRef =>
  parseSyncableBookRef(seed) ?? testLocalBookHash(seed);

export const testMetaHash = (seed: string): MetaHash => {
  const parsed = parseMetaHash(seed) ?? parseMetaHash(fixtureHex(seed, 32));
  if (!parsed) throw new Error(`Invalid meta hash fixture: ${seed}`);
  return parsed;
};
