import { beforeEach, describe, expect, it } from 'vitest';
import { createReaderBookKey } from '@openread/types';
import { useBookDataStore } from '@/store/bookDataStore';

const LOCAL_HASH = 'd41d8cd98f00b204e9800998ecf8427e';
const DB_UUID = '550e8400-e29b-41d4-a716-446655440000';

describe('bookDataStore reader identity boundaries', () => {
  beforeEach(() => {
    useBookDataStore.setState({ booksData: {}, preSyncedConfigs: {} });
  });

  it('gets book data by reader key', () => {
    const bookKey = createReaderBookKey(LOCAL_HASH, 'session-a');
    useBookDataStore.setState({
      booksData: {
        [LOCAL_HASH]: {
          id: LOCAL_HASH,
          book: { hash: LOCAL_HASH, title: 'Book' } as never,
          file: null,
          config: null,
          bookDoc: null,
          isFixedLayout: false,
        },
      },
    });

    expect(useBookDataStore.getState().getBookDataByReaderKey(bookKey)?.id).toBe(LOCAL_HASH);
  });

  it('gets bare book refs through the explicit ref API', () => {
    useBookDataStore.setState({
      booksData: {
        [LOCAL_HASH]: {
          id: LOCAL_HASH,
          book: { hash: LOCAL_HASH, title: 'Book' } as never,
          file: null,
          config: null,
          bookDoc: null,
          isFixedLayout: false,
        },
      },
    });

    expect(useBookDataStore.getState().getBookDataByRef(LOCAL_HASH)?.id).toBe(LOCAL_HASH);
  });

  it('rejects plain DB UUID reader identity and invalid mutation state without throwing', () => {
    expect(useBookDataStore.getState().getBookDataByReaderKey(DB_UUID)).toBeNull();
    expect(useBookDataStore.getState().getBookDataByRef(DB_UUID)).toBeNull();
    expect(() =>
      useBookDataStore.getState().setConfig(DB_UUID, { updatedAt: Date.now() }),
    ).not.toThrow();
    expect(() => useBookDataStore.getState().updateBooknotes(DB_UUID, [])).not.toThrow();
  });
});
