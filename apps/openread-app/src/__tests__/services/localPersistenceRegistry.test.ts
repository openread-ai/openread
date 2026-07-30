import { beforeEach, describe, expect, it } from 'vitest';

import {
  LOCAL_PERSISTENCE_PREFIXES,
  removeBookLocalPersistence,
} from '@/services/persistence/localPersistenceRegistry';
import { testLocalBookHash } from '../utils/bookIdentityFixtures';

describe('removeBookLocalPersistence', () => {
  const targetHash = testLocalBookHash('target-book');
  const siblingHash = testLocalBookHash('sibling-book');

  beforeEach(() => {
    localStorage.clear();
  });

  it('removes exact normalized book refs from every registered per-book namespace', () => {
    const targetReaderKey = `${targetHash}::reader-session`;
    const targetKeys = [
      `${LOCAL_PERSISTENCE_PREFIXES.readerSearchHistory}${targetHash}`,
      `${LOCAL_PERSISTENCE_PREFIXES.rsvpWordsPerMinute}${targetReaderKey}`,
      `${LOCAL_PERSISTENCE_PREFIXES.rsvpPunctuationPause}${targetReaderKey}`,
      `${LOCAL_PERSISTENCE_PREFIXES.rsvpPosition}${targetHash}`,
    ];
    const siblingKeys = [
      `${LOCAL_PERSISTENCE_PREFIXES.readerSearchHistory}${siblingHash}`,
      `${LOCAL_PERSISTENCE_PREFIXES.rsvpWordsPerMinute}${siblingHash}::reader-session`,
    ];

    [...targetKeys, ...siblingKeys].forEach((key) => localStorage.setItem(key, 'value'));

    expect(removeBookLocalPersistence(targetHash)).toBe(targetKeys.length);
    targetKeys.forEach((key) => expect(localStorage.getItem(key)).toBeNull());
    siblingKeys.forEach((key) => expect(localStorage.getItem(key)).toBe('value'));
  });

  it('does not delete sibling-prefix or invalid per-book keys', () => {
    const siblingPrefixKey = `${LOCAL_PERSISTENCE_PREFIXES.readerSearchHistory}${targetHash}123`;
    const unrelatedKey = 'search-history-not-a-book-ref';
    localStorage.setItem(siblingPrefixKey, 'keep');
    localStorage.setItem(unrelatedKey, 'keep');

    expect(removeBookLocalPersistence(targetHash)).toBe(0);
    expect(localStorage.getItem(siblingPrefixKey)).toBe('keep');
    expect(localStorage.getItem(unrelatedKey)).toBe('keep');
  });
});
