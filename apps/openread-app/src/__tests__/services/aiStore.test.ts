import { describe, expect, it, vi } from 'vitest';

import { AIStore } from '@/services/ai/storage/aiStore';
import type { AIConversation, AIMessage } from '@/services/ai/types';

function createDatabase(conversations: AIConversation[], messages: AIMessage[]) {
  let pendingRequests = 0;

  const finishRequest = () => {
    pendingRequests -= 1;
    if (pendingRequests === 0)
      queueMicrotask(() => transaction.oncomplete?.(new Event('complete')));
  };

  const cursorRequest = <T>(items: T[], remove: (item: T) => void) => {
    pendingRequests += 1;
    let index = 0;
    let onsuccess: ((event: Event) => void) | null = null;
    const request = {} as IDBRequest<IDBCursorWithValue>;

    const dispatch = () => {
      queueMicrotask(() => {
        const item = items[index];
        if (!item) {
          onsuccess?.({ target: { result: null } } as unknown as Event);
          finishRequest();
          return;
        }
        const cursor = {
          value: item,
          delete: () => remove(item),
          continue: () => {
            index += 1;
            dispatch();
          },
        } as IDBCursorWithValue;
        onsuccess?.({ target: { result: cursor } } as unknown as Event);
      });
    };

    Object.defineProperty(request, 'onsuccess', {
      get: () => onsuccess,
      set: (handler) => {
        onsuccess = handler;
        dispatch();
      },
    });
    return request;
  };

  const conversationStore = {
    index: () => ({
      openCursor: (bookHash: string) =>
        cursorRequest(
          conversations.filter((conversation) => conversation.bookHash === bookHash),
          (conversation) => {
            const index = conversations.findIndex((candidate) => candidate.id === conversation.id);
            if (index >= 0) conversations.splice(index, 1);
          },
        ),
    }),
  };
  const messageStore = {
    index: () => ({
      openCursor: (conversationId: string) =>
        cursorRequest(
          messages.filter((message) => message.conversationId === conversationId),
          (message) => {
            const index = messages.findIndex((candidate) => candidate.id === message.id);
            if (index >= 0) messages.splice(index, 1);
          },
        ),
    }),
  };

  const transaction = {
    objectStore: (name: string) =>
      (name === 'conversations' ? conversationStore : messageStore) as unknown as IDBObjectStore,
    oncomplete: null,
    onerror: null,
    error: null,
  } as unknown as IDBTransaction;
  const db = {
    transaction: () => transaction,
  } as unknown as IDBDatabase;

  return { db, conversations, messages };
}

const conversation = (id: string, bookHash: string): AIConversation => ({
  id,
  bookHash,
  title: id,
  createdAt: 1,
  updatedAt: 1,
});

const message = (id: string, conversationId: string): AIMessage => ({
  id,
  conversationId,
  role: 'user',
  content: id,
  createdAt: 1,
});

describe('AIStore', () => {
  it('deletes only the target book conversations and their messages', async () => {
    const database = createDatabase(
      [
        conversation('a-active', 'book-a'),
        { ...conversation('a-deleted', 'book-a'), deletedAt: 2 },
        conversation('b', 'book-b'),
      ],
      [
        message('message-a', 'a-active'),
        message('message-a-deleted', 'a-deleted'),
        message('message-b', 'b'),
      ],
    );
    const store = new AIStore(database.db);
    const onDeleteStart = vi.fn();

    await expect(store.deleteBookConversations('book-a', () => true, onDeleteStart)).resolves.toBe(
      true,
    );

    expect(onDeleteStart).toHaveBeenCalledOnce();
    expect(database.conversations).toEqual([conversation('b', 'book-b')]);
    expect(database.messages).toEqual([message('message-b', 'b')]);
  });

  it('does not start a delete transaction when the live gate closes', async () => {
    let transactionCalls = 0;
    const db = {
      transaction: () => {
        transactionCalls += 1;
        throw new Error('transaction should not start');
      },
    } as unknown as IDBDatabase;
    const store = new AIStore(db);
    const onDeleteStart = vi.fn();

    await expect(store.deleteBookConversations('book-a', () => false, onDeleteStart)).resolves.toBe(
      false,
    );
    expect(onDeleteStart).not.toHaveBeenCalled();
    expect(transactionCalls).toBe(0);
  });

  it('does not start the eviction barrier when delete transaction creation fails', async () => {
    const failure = new Error('IndexedDB transaction creation failed');
    const db = {
      transaction: () => {
        throw failure;
      },
    } as unknown as IDBDatabase;
    const store = new AIStore(db);
    const onDeleteStart = vi.fn();

    await expect(store.deleteBookConversations('book-a', () => true, onDeleteStart)).rejects.toBe(
      failure,
    );
    expect(onDeleteStart).not.toHaveBeenCalled();
  });

  it('does not start a write transaction after book chat eviction invalidates it', async () => {
    let transactionCalls = 0;
    const db = {
      transaction: () => {
        transactionCalls += 1;
        throw new Error('transaction should not start');
      },
    } as unknown as IDBDatabase;
    const store = new AIStore(db);

    await expect(store.saveConversation(conversation('late', 'book-a'), () => false)).resolves.toBe(
      false,
    );
    expect(transactionCalls).toBe(0);
  });
});
