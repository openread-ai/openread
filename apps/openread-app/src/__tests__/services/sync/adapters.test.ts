import { describe, expect, it } from 'vitest';
import type { SyncUpsertMutation } from '@openread/sync';
import { validateSyncMutation } from '@openread/sync/validation';

import {
  buildBookConfigMutation,
  buildBookMutation,
  buildBookNoteMutation,
  buildSyncMutationsFromQueueItems,
} from '@/services/sync/adapters';
import type { Book, BookConfig, BookNote } from '@/types/book';

const context = { userId: 'user-1', deviceId: 'device-1', now: 1_000 };

const book = (overrides: Partial<Book> = {}): Book => ({
  hash: 'book-hash-1',
  title: 'Book 1',
  author: 'Author 1',
  format: 'epub',
  createdAt: 500,
  updatedAt: 1_000,
  coverImageUrl: null,
  ...overrides,
});

const config = (overrides: Partial<BookConfig> = {}): BookConfig => ({
  bookHash: 'book-hash-1',
  metaHash: 'meta-hash-1',
  progress: [2, 10],
  location: 'epubcfi(/6/2)',
  searchConfig: {
    scope: 'book',
    matchCase: false,
    matchWholeWords: false,
    matchDiacritics: true,
    acceptNode: () => 1,
  },
  booknotes: [note()],
  updatedAt: 2_000,
  lastSyncedAtConfig: 1_000,
  lastSyncedAtNotes: 1_000,
  ...overrides,
});

const note = (overrides: Partial<BookNote> = {}): BookNote => ({
  id: 'note-1',
  bookHash: 'book-hash-1',
  metaHash: 'meta-hash-1',
  type: 'annotation',
  cfi: 'epubcfi(/6/4)',
  text: 'Highlighted text',
  style: 'highlight',
  color: 'yellow',
  note: 'Reader note',
  createdAt: 700,
  updatedAt: 2_000,
  ...overrides,
});

describe('canonical sync mutation adapters', () => {
  it('builds valid canonical book mutations from local books', () => {
    const mutation = buildBookMutation(book({ readingStatus: 'reading' }), context);

    expect(validateSyncMutation(mutation).ok).toBe(true);
    expect(mutation).toMatchObject({
      entity: 'book',
      entityId: 'book-hash-1',
      op: 'upsert',
      baseRevision: null,
      userId: 'user-1',
      deviceId: 'device-1',
      clientUpdatedAt: 1_000,
      payload: {
        hash: 'book-hash-1',
        title: 'Book 1',
        readingStatus: 'reading',
      },
    });
  });

  it('builds valid config mutations and strips notes plus non-serializable search callbacks', () => {
    const mutation = buildBookConfigMutation(config(), context);

    expect(validateSyncMutation(mutation).ok).toBe(true);
    expect(mutation.entity).toBe('bookConfig');
    expect(mutation.entityId).toBe('book-hash-1');
    expect(mutation.payload).toMatchObject({
      bookHash: 'book-hash-1',
      metaHash: 'meta-hash-1',
      location: 'epubcfi(/6/2)',
      progress: [2, 10],
      updatedAt: 2_000,
    });
    expect(mutation.payload).not.toHaveProperty('booknotes');
    expect(mutation.payload).not.toHaveProperty('lastSyncedAtConfig');
    expect((mutation as SyncUpsertMutation<'bookConfig'>).payload.searchConfig).not.toHaveProperty(
      'acceptNode',
    );
  });

  it('builds valid note mutations including soft-delete tombstone timestamps', () => {
    const mutation = buildBookNoteMutation(note({ deletedAt: 3_000 }), context);

    expect(validateSyncMutation(mutation).ok).toBe(true);
    expect(mutation).toMatchObject({
      entity: 'bookNote',
      entityId: 'book-hash-1:note-1',
      clientUpdatedAt: 3_000,
      payload: {
        id: 'note-1',
        bookHash: 'book-hash-1',
        type: 'annotation',
        cfi: 'epubcfi(/6/4)',
        deletedAt: 3_000,
      },
    });
  });

  it('maps legacy queue-shaped inputs to canonical mutations for PR3 entities', () => {
    const mutations = buildSyncMutationsFromQueueItems(
      [
        { type: 'book', action: 'upsert', payload: book() as unknown as Record<string, unknown> },
        {
          type: 'config',
          action: 'upsert',
          payload: config() as unknown as Record<string, unknown>,
        },
        { type: 'note', action: 'upsert', payload: note() as unknown as Record<string, unknown> },
      ],
      context,
    );

    expect(mutations.map((mutation) => mutation.entity)).toEqual([
      'book',
      'bookConfig',
      'bookNote',
    ]);
    expect(mutations.every((mutation) => validateSyncMutation(mutation).ok)).toBe(true);
  });
});
