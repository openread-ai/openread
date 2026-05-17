import { uniqueId } from '@/utils/misc';

const BOOK_KEY_SEPARATOR = '::';
const LEGACY_MD5_BOOK_KEY_REGEX = /^([0-9a-f]{32})-[a-z0-9]{7}$/i;

export function createBookKey(bookId: string): string {
  return `${bookId}${BOOK_KEY_SEPARATOR}${uniqueId()}`;
}

export function getBookIdFromKey(keyOrId: string): string {
  const separatorIndex = keyOrId.lastIndexOf(BOOK_KEY_SEPARATOR);
  if (separatorIndex !== -1) return keyOrId.slice(0, separatorIndex);

  const legacyMd5Match = keyOrId.match(LEGACY_MD5_BOOK_KEY_REGEX);
  if (legacyMd5Match?.[1]) return legacyMd5Match[1];

  return keyOrId;
}
