export {
  isCatalogBookRef,
  isLocalBookHash,
  isOpenReadBookReference,
  isPlatformBookHash,
  isSyncableBookRef,
  normalizeBookReference,
  parseCatalogBookRef,
  parseLocalBookHash,
  parseOpenReadBookReference,
  parsePlatformBookHash,
  parseSyncableBookRef,
} from '@openread/types';
export type {
  CatalogBookRef,
  LocalBookHash,
  OpenReadBookReference,
  PlatformBookHash,
  SyncableBookRef,
} from '@openread/types';

export { isCatalogBookRef as isCatalogBookHash } from '@openread/types';
export { isSyncableBookRef as isSyncableLibraryBookHash } from '@openread/types';
