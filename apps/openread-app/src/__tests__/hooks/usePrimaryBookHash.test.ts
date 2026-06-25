import { beforeEach, describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { createReaderBookKey } from '@openread/types';
import { usePrimaryBookHash } from '@/app/reader/hooks/usePrimaryBookHash';
import { useParallelViewStore } from '@/store/parallelViewStore';
import { useReaderStore } from '@/store/readerStore';

const PRIMARY_HASH = 'd41d8cd98f00b204e9800998ecf8427e';
const SECONDARY_HASH = '0123456789abcdef0123456789abcdef';
const DB_UUID = '550e8400-e29b-41d4-a716-446655440000';

describe('usePrimaryBookHash guarded identity parsing', () => {
  beforeEach(() => {
    useReaderStore.setState({ bookKeys: [] });
    useParallelViewStore.setState({ parallelViews: [] });
  });

  it('returns null state when no valid key exists', () => {
    const { result } = renderHook(() => usePrimaryBookHash(null));

    expect(result.current.primaryBookHash).toBeNull();
    expect(result.current.getParallelHashes()).toBeUndefined();
  });

  it('resolves a valid reader key primary hash', () => {
    const bookKey = createReaderBookKey(PRIMARY_HASH, 'session-a');
    useReaderStore.setState({ bookKeys: [bookKey] });

    const { result } = renderHook(() => usePrimaryBookHash(bookKey));

    expect(result.current.primaryBookHash).toBe(PRIMARY_HASH);
  });

  it('validates parallel keys before parsing', () => {
    const primaryKey = createReaderBookKey(PRIMARY_HASH, 'primary');
    const secondaryKey = createReaderBookKey(SECONDARY_HASH, 'secondary');
    useReaderStore.setState({ bookKeys: [primaryKey, secondaryKey, DB_UUID] });
    useParallelViewStore.getState().setParallel([primaryKey, secondaryKey, DB_UUID]);

    const { result } = renderHook(() => usePrimaryBookHash(secondaryKey));

    expect(result.current.primaryBookHash).toBe(PRIMARY_HASH);
    expect(result.current.getParallelHashes()).toEqual([SECONDARY_HASH]);
  });
});
