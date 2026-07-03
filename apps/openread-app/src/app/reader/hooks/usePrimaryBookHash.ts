import { useMemo } from 'react';
import { useReaderStore } from '@/store/readerStore';
import { useParallelViewStore } from '@/store/parallelViewStore';
import { parseBookRefFromReaderBookKey } from '@openread/types';

/**
 * In a parallel read session, returns the primary (first-opened/initiating) book's hash.
 * Outside a parallel session, returns the current book's hash.
 * Also returns a helper to extract sibling hashes for conversation creation.
 */
export function usePrimaryBookHash(bookKey: string | null) {
  const bookHash = useMemo(() => parseBookRefFromReaderBookKey(bookKey), [bookKey]);
  const bookKeys = useReaderStore((s) => s.bookKeys);
  const getParallels = useParallelViewStore((s) => s.getParallels);

  const primaryBookHash = useMemo(() => {
    if (!bookKey || !bookHash) return null;
    const group = getParallels(bookKey);
    if (!group) return bookHash;
    const primaryKey = bookKeys.find((key) => group.has(key));
    return primaryKey ? (parseBookRefFromReaderBookKey(primaryKey) ?? bookHash) : bookHash;
  }, [bookKey, bookHash, bookKeys, getParallels]);

  const getParallelHashes = useMemo(() => {
    return (): string[] | undefined => {
      if (!bookKey || !primaryBookHash) return undefined;
      const group = getParallels(bookKey);
      if (!group) return undefined;
      const hashes = [...group]
        .map((key) => parseBookRefFromReaderBookKey(key))
        .filter((h): h is NonNullable<typeof h> => !!h && h !== primaryBookHash);
      return hashes.length > 0 ? hashes : undefined;
    };
  }, [bookKey, primaryBookHash, getParallels]);

  return { primaryBookHash, getParallelHashes };
}
