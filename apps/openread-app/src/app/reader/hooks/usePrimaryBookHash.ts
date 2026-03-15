import { useMemo } from 'react';
import { useReaderStore } from '@/store/readerStore';
import { useParallelViewStore } from '@/store/parallelViewStore';

/**
 * In a parallel read session, returns the primary (first-opened/initiating) book's hash.
 * Outside a parallel session, returns the current book's hash.
 * Also returns a helper to extract sibling hashes for conversation creation.
 */
export function usePrimaryBookHash(bookKey: string) {
  const bookHash = bookKey.split('-')[0] || '';
  const bookKeys = useReaderStore((s) => s.bookKeys);
  const getParallels = useParallelViewStore((s) => s.getParallels);

  const primaryBookHash = useMemo(() => {
    const group = getParallels(bookKey);
    if (!group) return bookHash;
    const primaryKey = bookKeys.find((key) => group.has(key));
    return primaryKey ? primaryKey.split('-')[0]! : bookHash;
  }, [bookKey, bookHash, bookKeys, getParallels]);

  const getParallelHashes = useMemo(() => {
    return (): string[] | undefined => {
      const group = getParallels(bookKey);
      if (!group) return undefined;
      const hashes = [...group]
        .map((key) => key.split('-')[0]!)
        .filter((h) => h && h !== primaryBookHash);
      return hashes.length > 0 ? hashes : undefined;
    };
  }, [bookKey, primaryBookHash, getParallels]);

  return { primaryBookHash, getParallelHashes };
}
