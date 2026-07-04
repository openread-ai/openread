import { testSyncableBookRef, testMetaHash } from '../../utils/bookIdentityFixtures';
import { describe, expect, it } from 'vitest';
import type { SyncUpsertMutation } from '@openread/sync';
import { validateSyncMutation } from '@openread/sync/validation';

import {
  buildBookConfigMutation,
  buildBookMutation,
  buildAIConversationMutation,
  buildAIMessageMutation,
  buildBookNoteMutation,
  buildCollectionMutations,
  buildFileMetadataMutationsFromBook,
  buildSettingsMutation,
} from '@/services/sync/adapters';
import type { AIConversation, AIMessage } from '@/services/ai/types';
import type { Book, BookConfig, BookNote } from '@/types/book';
import type { SystemSettings } from '@/types/settings';

const context = { userId: 'user-1', deviceId: 'device-1', now: 1_000 };

const book = (overrides: Partial<Book> = {}): Book => ({
  hash: testSyncableBookRef('d41d8cd98f00b204e9800998ecf8427e'),
  title: 'Book 1',
  author: 'Author 1',
  format: 'epub',
  createdAt: 500,
  updatedAt: 1_000,
  coverImageUrl: null,
  ...overrides,
});

const config = (overrides: Partial<BookConfig> = {}): BookConfig => ({
  bookHash: testSyncableBookRef('d41d8cd98f00b204e9800998ecf8427e'),
  metaHash: testMetaHash('b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9'),
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
  ...overrides,
});

const note = (overrides: Partial<BookNote> = {}): BookNote => ({
  id: 'note-1',
  bookHash: testSyncableBookRef('d41d8cd98f00b204e9800998ecf8427e'),
  metaHash: testMetaHash('b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9'),
  type: 'annotation',
  target: { kind: 'text-cfi', cfi: 'epubcfi(/6/4)' },
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
      entityId: 'd41d8cd98f00b204e9800998ecf8427e',
      op: 'upsert',
      baseRevision: null,
      userId: 'user-1',
      deviceId: 'device-1',
      clientUpdatedAt: 1_000,
      payload: {
        hash: testSyncableBookRef('d41d8cd98f00b204e9800998ecf8427e'),
        title: 'Book 1',
        readingStatus: 'reading',
      },
    });
  });

  it('builds canonical book delete mutations from local tombstones', () => {
    const mutation = buildBookMutation(book({ deletedAt: 3_000, updatedAt: 2_000 }), context);

    expect(validateSyncMutation(mutation).ok).toBe(true);
    expect(mutation).toMatchObject({
      entity: 'book',
      entityId: 'd41d8cd98f00b204e9800998ecf8427e',
      op: 'delete',
      baseRevision: null,
      userId: 'user-1',
      deviceId: 'device-1',
      clientUpdatedAt: 3_000,
      tombstone: {
        deletedAt: 3_000,
        reason: 'book-delete',
      },
    });
    expect(mutation).not.toHaveProperty('payload');
  });

  it('builds valid config mutations and strips notes plus non-serializable search callbacks', () => {
    const mutation = buildBookConfigMutation(config(), context);

    expect(validateSyncMutation(mutation).ok).toBe(true);
    expect(mutation.entity).toBe('bookConfig');
    expect(mutation.entityId).toBe('d41d8cd98f00b204e9800998ecf8427e');
    expect(mutation.payload).toMatchObject({
      bookHash: testSyncableBookRef('d41d8cd98f00b204e9800998ecf8427e'),
      metaHash: testMetaHash('b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9'),
      location: 'epubcfi(/6/2)',
      progress: [2, 10],
      updatedAt: 2_000,
    });
    expect(mutation.payload).not.toHaveProperty('booknotes');
    expect(mutation.payload).not.toHaveProperty('searchConfig.acceptNode');
    expect((mutation as SyncUpsertMutation<'bookConfig'>).payload.searchConfig).not.toHaveProperty(
      'acceptNode',
    );
  });

  it('builds valid note mutations including soft-delete tombstone timestamps', () => {
    const mutation = buildBookNoteMutation(note({ deletedAt: 3_000 }), context);

    expect(validateSyncMutation(mutation).ok).toBe(true);
    expect(mutation).toMatchObject({
      entity: 'bookNote',
      entityId: 'd41d8cd98f00b204e9800998ecf8427e:note-1',
      clientUpdatedAt: 3_000,
      payload: {
        id: 'note-1',
        bookHash: testSyncableBookRef('d41d8cd98f00b204e9800998ecf8427e'),
        type: 'annotation',
        target: { kind: 'text-cfi', cfi: 'epubcfi(/6/4)' },
        cfi: 'epubcfi(/6/4)',
        deletedAt: 3_000,
      },
    });
  });

  it('preserves fixed-page annotation targets in note mutations', () => {
    const mutation = buildBookNoteMutation(
      note({
        cfi: undefined,
        target: {
          kind: 'pdf-text-quad',
          pageIndex: 0,
          pageWidth: 600,
          pageHeight: 800,
          rotation: 0,
          quads: [{ x1: 0.1, y1: 0.1, x2: 0.2, y2: 0.1, x3: 0.2, y3: 0.2, x4: 0.1, y4: 0.2 }],
          textQuote: 'Highlighted text',
        },
      }),
      context,
    );

    expect(validateSyncMutation(mutation).ok).toBe(true);
    const payload = (mutation as SyncUpsertMutation<'bookNote'>).payload;
    expect(payload).toMatchObject({
      target: { kind: 'pdf-text-quad', pageIndex: 0 },
    });
    expect(payload.cfi).toBeNull();
  });

  it('builds valid settings mutations from roaming settings', () => {
    const mutation = buildSettingsMutation(
      {
        libraryViewMode: 'grid',
        keepLogin: true,
        autoUpload: true,
        telemetryEnabled: false,
        aiSettings: { defaultProvider: 'groq' },
      } as unknown as SystemSettings,
      context,
    );

    expect(validateSyncMutation(mutation).ok).toBe(true);
    expect(mutation).toMatchObject({
      entity: 'settings',
      entityId: 'settings',
      payload: {
        id: 'settings',
        settings: {
          libraryViewMode: 'grid',
          keepLogin: true,
          autoUpload: true,
          telemetryEnabled: false,
        },
      },
    });
  });

  it('builds valid collection mutations preserving the full collection snapshot', () => {
    const mutations = buildCollectionMutations(
      [
        {
          id: 'collection-1',
          name: 'Favorites',
          bookHashes: ['d41d8cd98f00b204e9800998ecf8427e'],
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: 2_000,
        },
      ],
      context,
    );

    expect(mutations).toHaveLength(1);
    expect(validateSyncMutation(mutations[0]).ok).toBe(true);
    expect(mutations[0]).toMatchObject({
      entity: 'collection',
      entityId: 'collection-1',
      payload: {
        id: 'collection-1',
        name: 'Favorites',
        bookHashes: ['d41d8cd98f00b204e9800998ecf8427e'],
        updatedAt: 2_000,
      },
    });
  });

  it('builds valid AI conversation and message mutations with canonical entity ids', () => {
    const conversation: AIConversation = {
      id: 'conversation-1',
      bookHash: testSyncableBookRef('d41d8cd98f00b204e9800998ecf8427e'),
      title: 'Question thread',
      createdAt: 1_000,
      updatedAt: 2_000,
      parallelBookHashes: ['0123456789abcdef0123456789abcdef'],
    };
    const message: AIMessage = {
      id: 'message-1',
      conversationId: conversation.id,
      role: 'user',
      content: 'What happened?',
      createdAt: 2_500,
      parentId: null,
    };

    const conversationMutation = buildAIConversationMutation(conversation, context);
    const messageMutation = buildAIMessageMutation(message, context);

    expect(validateSyncMutation(conversationMutation).ok).toBe(true);
    expect(validateSyncMutation(messageMutation).ok).toBe(true);
    expect(conversationMutation.payload!.parallelBookHashes).toEqual([
      '0123456789abcdef0123456789abcdef',
    ]);
    expect(messageMutation).toMatchObject({
      entity: 'aiMessage',
      entityId: 'conversation-1:message-1',
      payload: { id: 'message-1', conversationId: 'conversation-1', content: 'What happened?' },
    });
  });

  it('builds file metadata mutations for uploaded book and cover records without bytes', () => {
    const mutations = buildFileMetadataMutationsFromBook(
      book({ uploadedAt: 4_000, coverDownloadedAt: 4_100 }),
      context,
    );

    expect(mutations).toHaveLength(2);
    expect(mutations.every((mutation) => validateSyncMutation(mutation).ok)).toBe(true);
    expect(mutations.map((mutation) => mutation.payload!.fileType)).toEqual(['book', 'cover']);
    expect(mutations[0]!.payload).not.toHaveProperty('bytes');
    expect(mutations[0]).toMatchObject({
      entity: 'fileMetadata',
      payload: {
        bookHash: testSyncableBookRef('d41d8cd98f00b204e9800998ecf8427e'),
        status: 'uploaded',
      },
    });
  });
});
