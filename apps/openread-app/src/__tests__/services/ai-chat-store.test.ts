import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AIConversation } from '@/services/ai/types';

const mocks = vi.hoisted(() => ({
  aiStore: {
    getConversations: vi.fn(),
    getMessages: vi.fn(),
    saveConversation: vi.fn(),
    saveMessage: vi.fn(),
  },
  pullRemoteAIConversations: vi.fn(),
}));

vi.mock('@/services/ai/storage/aiStore', () => ({ aiStore: mocks.aiStore }));
vi.mock('@/services/sync/syncWorker', () => ({
  syncWorker: { pullRemoteAIConversations: mocks.pullRemoteAIConversations },
}));

import { beginBookChatEviction, finishBookChatEviction, useAIChatStore } from '@/store/aiChatStore';

const conversation = (bookHash: string): AIConversation => ({
  id: `conversation-${bookHash}`,
  bookHash,
  title: 'Chat',
  createdAt: 1,
  updatedAt: 1,
});

describe('AI chat eviction generation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.aiStore.getConversations.mockResolvedValue([]);
    mocks.aiStore.getMessages.mockResolvedValue([]);
    mocks.aiStore.saveConversation.mockResolvedValue(true);
    mocks.aiStore.saveMessage.mockResolvedValue(true);
    useAIChatStore.setState({
      activeConversationId: null,
      conversations: [],
      messages: [],
      isLoadingHistory: false,
      currentBookHash: null,
      pendingQuestion: null,
      chatStatus: null,
      suggestions: [],
    });
  });

  it('does not restore a conversation load that eviction invalidated', async () => {
    const bookHash = 'book-load';
    let resolveLoad: ((value: AIConversation[]) => void) | undefined;
    mocks.aiStore.getConversations.mockImplementationOnce(
      () =>
        new Promise<AIConversation[]>((resolve) => {
          resolveLoad = resolve;
        }),
    );

    const load = useAIChatStore.getState().loadConversations(bookHash);
    await vi.waitFor(() => expect(mocks.aiStore.getConversations).toHaveBeenCalledOnce());
    beginBookChatEviction(bookHash);
    useAIChatStore.getState().clearBookChatState(bookHash);
    finishBookChatEviction(bookHash);
    resolveLoad?.([conversation(bookHash)]);
    await load;

    expect(useAIChatStore.getState()).toMatchObject({
      currentBookHash: null,
      activeConversationId: null,
      conversations: [],
      messages: [],
    });
    expect(mocks.pullRemoteAIConversations).not.toHaveBeenCalled();
  });

  it('does not finish a message write that eviction invalidated', async () => {
    const bookHash = 'book-message';
    const activeConversation = conversation(bookHash);
    useAIChatStore.setState({
      activeConversationId: activeConversation.id,
      conversations: [activeConversation],
      messages: [],
      currentBookHash: bookHash,
    });
    let finishWrite: (() => void) | undefined;
    mocks.aiStore.saveMessage.mockImplementationOnce(
      (_message: unknown, canWrite: () => boolean) =>
        new Promise<boolean>((resolve) => {
          finishWrite = () => resolve(canWrite());
        }),
    );

    const add = useAIChatStore.getState().addMessage({
      conversationId: activeConversation.id,
      role: 'assistant',
      content: 'Late response',
    });
    await vi.waitFor(() => expect(mocks.aiStore.saveMessage).toHaveBeenCalledOnce());
    beginBookChatEviction(bookHash);
    useAIChatStore.getState().clearBookChatState(bookHash);
    finishBookChatEviction(bookHash);
    finishWrite?.();
    await add;

    expect(mocks.aiStore.saveConversation).not.toHaveBeenCalled();
    expect(useAIChatStore.getState()).toMatchObject({
      currentBookHash: null,
      activeConversationId: null,
      conversations: [],
      messages: [],
    });
  });
});
