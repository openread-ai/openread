'use client';

import { useEffect, useCallback, useMemo, useRef, type ReactNode } from 'react';
import {
  AssistantRuntimeProvider,
  useAssistantRuntime,
  useLocalRuntime,
  type ThreadMessage,
  type ThreadHistoryAdapter,
} from '@assistant-ui/react';

import { useEnv } from '@/context/EnvContext';
import { useTranslation } from '@/hooks/useTranslation';
import { useSettingsStore } from '@/store/settingsStore';
import { useBookDataStore } from '@/store/bookDataStore';
import { useReaderStore } from '@/store/readerStore';
import { useAIChatStore } from '@/store/aiChatStore';
import { useAIQuotaStore } from '@/store/aiQuotaStore';
import { usePrimaryBookHash } from '@/app/reader/hooks/usePrimaryBookHash';
import { useAuth } from '@/context/AuthContext';
import { eventDispatcher } from '@/utils/event';
import { createAgenticAdapter } from '@/services/ai';
import type { AISettings, AIMessage } from '@/services/ai/types';
import { useBookChapters } from '@/app/reader/hooks/useBookChapters';
import { Thread } from '@/components/assistant/Thread';
import { parseBookRefFromReaderBookKey } from '@openread/types';
import { LAUNCH_BYOK_ENABLED } from '@/services/launchFeatures';
import { normalizeReaderLayout } from '@/app/reader/utils/readerLayoutContract';
import {
  getCanonicalReaderLocation,
  getReaderNavigationTargetFromAICitation,
  navigateReaderToTarget,
  type CanonicalReaderLocation,
} from '@/app/reader/utils/readerLocationContract';

// Helper function to convert AIMessage array to ExportedMessageRepository format
// Each message needs to be wrapped with { message, parentId } structure
function convertToExportedMessages(
  aiMessages: AIMessage[],
): { message: ThreadMessage; parentId: string | null }[] {
  // Build a set of valid message IDs for parentId validation
  const validIds = new Set(aiMessages.map((m) => m.id));

  // Reconstruct parentIds using branch detection.
  // Stored parentIds often reference assistant-ui's internal IDs which don't
  // match our stored IDs, so we only use them if they're valid.
  const parentIds: (string | null)[] = [];
  for (let i = 0; i < aiMessages.length; i++) {
    const msg = aiMessages[i]!;

    // Use stored parentId only if it references a valid message in this set
    if (msg.parentId && validIds.has(msg.parentId)) {
      parentIds.push(msg.parentId);
    } else if (i === 0) {
      parentIds.push(null);
    } else {
      const prev = aiMessages[i - 1]!;
      if (msg.role === prev.role) {
        // Consecutive same-role messages = branches (regenerations).
        // Walk back to find the last message of the opposite role.
        let parentIdx = i - 1;
        while (parentIdx > 0 && aiMessages[parentIdx]!.role === msg.role) parentIdx--;
        parentIds.push(aiMessages[parentIdx]?.id ?? null);
      } else {
        // Normal alternation: user → assistant or assistant → user
        parentIds.push(aiMessages[i - 1]?.id ?? null);
      }
    }
  }

  return aiMessages.map((msg, idx) => {
    const baseMessage = {
      id: msg.id,
      content: [{ type: 'text' as const, text: msg.content }],
      createdAt: new Date(msg.createdAt),
      metadata: { custom: {} },
    };

    const threadMessage: ThreadMessage =
      msg.role === 'user'
        ? ({
            ...baseMessage,
            role: 'user' as const,
            attachments: [] as const,
          } as unknown as ThreadMessage)
        : ({
            ...baseMessage,
            role: 'assistant' as const,
            status: { type: 'complete' as const, reason: 'stop' as const },
          } as unknown as ThreadMessage);

    return { message: threadMessage, parentId: parentIds[idx]! };
  });
}

interface AIAssistantProps {
  bookKey: string;
  initialQuestion?: string;
  initialQuestionConversationId?: string;
  surface?: 'default' | 'mobile-web-sheet';
  mobileWebHeader?: ReactNode;
}

const scheduledInitialQuestionKeys = new Set<string>();

// inner component that uses the runtime hook
const AIAssistantChat = ({
  aiSettings,
  bookHash,
  bookKey,
  chatBookHash,
  bookTitle,
  sourceTitle,
  metadataTitle,
  catalogBookId,
  authorName,
  sectionHref,
  sectionFraction,
  chapterTitle,
  bookFormat,
  bookDoc,
  readerLocation,
  initialQuestion,
  initialQuestionConversationId,
  surface = 'default',
  mobileWebHeader,
}: {
  aiSettings: AISettings;
  bookHash: string;
  bookKey: string;
  chatBookHash: string;
  bookTitle: string;
  sourceTitle?: string;
  metadataTitle?: string;
  catalogBookId?: string | null;
  authorName: string;
  /** Current EPUB section href — used to find the exact chapter. */
  sectionHref?: string;
  /** Position within the current section (0–1). */
  sectionFraction: number;
  chapterTitle?: string;
  bookFormat?: string;
  bookDoc: import('@/libs/document').BookDoc | null;
  readerLocation: CanonicalReaderLocation;
  initialQuestion?: string;
  initialQuestionConversationId?: string;
  surface?: 'default' | 'mobile-web-sheet';
  mobileWebHeader?: ReactNode;
}) => {
  const { appService } = useEnv();
  const { getChapters, getVisualContextImages } = useBookChapters(bookDoc, readerLocation);
  const readerPlatform = useMemo(
    () => ({
      isMobile: !!appService?.isMobile,
      isIOSApp: !!appService?.isIOSApp,
      isAndroidApp: !!appService?.isAndroidApp,
    }),
    [appService?.isAndroidApp, appService?.isIOSApp, appService?.isMobile],
  );
  const {
    activeConversationId,
    addMessage,
    createConversation,
    loadConversations,
    setActiveConversation,
    isLoadingHistory,
  } = useAIChatStore();

  // Extract book metadata subjects
  const bookSubjects = useMemo(() => {
    const raw = bookDoc?.metadata?.subject;
    if (!raw) return undefined;
    if (Array.isArray(raw)) return raw.filter((s): s is string => typeof s === 'string');
    if (typeof raw === 'string') return [raw];
    return undefined;
  }, [bookDoc?.metadata?.subject]);

  // use a ref to keep up-to-date options without triggering re-renders of the runtime
  const optionsRef = useRef({
    settings: aiSettings,
    bookHash,
    bookTitle,
    sourceTitle,
    metadataTitle,
    catalogBookId,
    authorName,
    sectionHref,
    sectionFraction,
    chapterTitle,
    bookFormat,
    bookSubjects,
    getChapters,
    getVisualContextImages,
    readerLocation,
    readerPlatform,
  });

  // update ref on every render with latest values
  useEffect(() => {
    optionsRef.current = {
      settings: aiSettings,
      bookHash,
      bookTitle,
      sourceTitle,
      metadataTitle,
      catalogBookId,
      authorName,
      sectionHref,
      sectionFraction,
      chapterTitle,
      bookFormat,
      bookSubjects,
      getChapters,
      getVisualContextImages,
      readerLocation,
      readerPlatform,
    };
  });

  // Pre-warm text context only. Visual/current-page image fallback is loaded lazily
  // by the adapter when exact text is unavailable or sparse.
  useEffect(() => {
    void getChapters().catch(() => undefined);
  }, [getChapters]);

  // create adapter ONCE and keep it stable
  const adapter = useMemo(() => {
    // eslint-disable-next-line react-hooks/refs -- intentional: read lazily by adapter outside render
    return createAgenticAdapter(() => optionsRef.current);
  }, []);

  const nextUserMessageConversationIdRef = useRef<string | null>(null);
  const messageConversationIdsRef = useRef<Map<string, string>>(new Map());

  const bindNextUserMessageToConversation = useCallback((conversationId: string) => {
    nextUserMessageConversationIdRef.current = conversationId;
  }, []);

  // Auto-load existing conversations when the AI tab mounts and select the
  // most recent one if the reader has no active conversation. This keeps
  // persistence available even when the user opens the AI tab before clicking
  // "New chat".
  const autoLoadedBookHash = useRef<string | null>(null);
  useEffect(() => {
    if (!chatBookHash || autoLoadedBookHash.current === chatBookHash) return;
    autoLoadedBookHash.current = chatBookHash;

    loadConversations(chatBookHash).then(() => {
      const state = useAIChatStore.getState();
      const activeConversation = state.conversations.find(
        (conversation) => conversation.id === state.activeConversationId,
      );
      if (activeConversation?.bookHash === chatBookHash) return;

      const mostRecent = state.conversations.find(
        (conversation) => conversation.bookHash === chatBookHash,
      );
      void setActiveConversation(mostRecent?.id ?? null);
    });
  }, [chatBookHash, loadConversations, setActiveConversation]);

  // Create history adapter to load/persist messages. Always define the
  // adapter and create the backing conversation on first append if needed;
  // otherwise first messages can become orphaned before a conversation exists.
  const historyAdapter = useMemo<ThreadHistoryAdapter>(() => {
    return {
      async load() {
        const { messages, activeConversationId: convId } = useAIChatStore.getState();
        if (!convId) return { messages: [] };
        return {
          messages: convertToExportedMessages(messages),
        };
      },
      async append(item) {
        const msg = item.message;
        if (msg.role === 'system') return;

        const textContent = msg.content
          .filter(
            (part): part is { type: 'text'; text: string } =>
              'type' in part && part.type === 'text',
          )
          .map((part) => part.text)
          .join('\n');
        if (!textContent) return;

        const state = useAIChatStore.getState();
        const explicitConversationId =
          (msg.role === 'user' ? nextUserMessageConversationIdRef.current : null) ??
          (item.parentId ? messageConversationIdsRef.current.get(item.parentId) : null) ??
          messageConversationIdsRef.current.get(msg.id) ??
          null;
        const explicitConversation = explicitConversationId
          ? state.conversations.find((conversation) => conversation.id === explicitConversationId)
          : null;
        const activeConversation = state.conversations.find(
          (conversation) => conversation.id === state.activeConversationId,
        );
        let conversationId =
          explicitConversation?.bookHash === chatBookHash
            ? explicitConversation.id
            : activeConversation?.bookHash === chatBookHash
              ? activeConversation.id
              : null;
        if (!conversationId) {
          conversationId = await createConversation(chatBookHash, textContent.slice(0, 50));
        }

        if (
          msg.role === 'user' &&
          nextUserMessageConversationIdRef.current &&
          nextUserMessageConversationIdRef.current === conversationId
        ) {
          nextUserMessageConversationIdRef.current = null;
        }
        messageConversationIdsRef.current.set(msg.id, conversationId);
        if (messageConversationIdsRef.current.size > 200) {
          const oldestKey = messageConversationIdsRef.current.keys().next().value;
          if (oldestKey) messageConversationIdsRef.current.delete(oldestKey);
        }

        // Deduplicate: skip if this exact message ID already exists in store
        const current = useAIChatStore.getState().messages;
        if (current.some((m) => m.id === msg.id)) return;

        await addMessage({
          conversationId,
          role: msg.role as 'user' | 'assistant',
          content: textContent,
          parentId: item.parentId ?? null,
        });
      },
    };
  }, [addMessage, createConversation, chatBookHash]);

  // BYOK: determine if user has a BYOK provider selected
  const byokProvider = LAUNCH_BYOK_ENABLED ? aiSettings.byokProvider : undefined;
  const byokModel = LAUNCH_BYOK_ENABLED ? aiSettings.byokModel : undefined;

  const handleSelectModel = useCallback((modelId: string) => {
    // Update the settings ref immediately so the adapter uses the new model
    optionsRef.current = {
      ...optionsRef.current,
      settings: {
        ...optionsRef.current.settings,
        byokModel: modelId,
      },
    };
    // Persist to settings store so the selection survives re-renders and sessions
    const { settings: current, setSettings } = useSettingsStore.getState();
    if (current?.aiSettings) {
      setSettings({ ...current, aiSettings: { ...current.aiSettings, byokModel: modelId } });
    }
  }, []);

  return (
    <AIAssistantWithRuntime
      adapter={adapter}
      historyAdapter={historyAdapter}
      bookKey={bookKey}
      isLoadingHistory={isLoadingHistory}
      hasActiveConversation={!!activeConversationId}
      provider={aiSettings.provider}
      byokProvider={byokProvider}
      byokModel={byokModel}
      onSelectModel={byokProvider ? handleSelectModel : undefined}
      initialQuestion={initialQuestion}
      initialQuestionConversationId={initialQuestionConversationId}
      bindNextUserMessageToConversation={bindNextUserMessageToConversation}
      surface={surface}
      mobileWebHeader={mobileWebHeader}
    />
  );
};

const AIAssistantWithRuntime = ({
  adapter,
  historyAdapter,
  bookKey,
  isLoadingHistory,
  hasActiveConversation,
  provider,
  byokProvider,
  byokModel,
  onSelectModel,
  initialQuestion,
  initialQuestionConversationId,
  bindNextUserMessageToConversation,
  surface = 'default',
  mobileWebHeader,
}: {
  adapter: NonNullable<ReturnType<typeof createAgenticAdapter>>;
  historyAdapter: ThreadHistoryAdapter;
  bookKey: string;
  isLoadingHistory: boolean;
  hasActiveConversation: boolean;
  provider: string;
  byokProvider?: string;
  byokModel?: string;
  onSelectModel?: (modelId: string) => void;
  initialQuestion?: string;
  initialQuestionConversationId?: string;
  bindNextUserMessageToConversation: (conversationId: string) => void;
  surface?: 'default' | 'mobile-web-sheet';
  mobileWebHeader?: ReactNode;
}) => {
  const runtime = useLocalRuntime(adapter, {
    adapters: { history: historyAdapter },
  });

  if (!runtime) return null;

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ThreadWrapper
        bookKey={bookKey}
        isLoadingHistory={isLoadingHistory}
        hasActiveConversation={hasActiveConversation}
        provider={provider}
        byokProvider={byokProvider}
        byokModel={byokModel}
        onSelectModel={onSelectModel}
        initialQuestion={initialQuestion}
        initialQuestionConversationId={initialQuestionConversationId}
        bindNextUserMessageToConversation={bindNextUserMessageToConversation}
        surface={surface}
        mobileWebHeader={mobileWebHeader}
      />
    </AssistantRuntimeProvider>
  );
};

const ThreadWrapper = ({
  bookKey,
  isLoadingHistory,
  hasActiveConversation,
  provider,
  byokProvider,
  byokModel,
  onSelectModel,
  initialQuestion,
  initialQuestionConversationId,
  bindNextUserMessageToConversation,
  surface = 'default',
  mobileWebHeader,
}: {
  bookKey: string;
  isLoadingHistory: boolean;
  hasActiveConversation: boolean;
  provider: string;
  byokProvider?: string;
  byokModel?: string;
  onSelectModel?: (modelId: string) => void;
  initialQuestion?: string;
  initialQuestionConversationId?: string;
  bindNextUserMessageToConversation: (conversationId: string) => void;
  surface?: 'default' | 'mobile-web-sheet';
  mobileWebHeader?: ReactNode;
}) => {
  const _ = useTranslation();
  const { appService } = useEnv();
  const assistantRuntime = useAssistantRuntime();
  const assistantRuntimeRef = useRef(assistantRuntime);
  const {
    activeConversationId,
    createConversation,
    pendingQuestion,
    setActiveConversation,
    setPendingQuestion,
  } = useAIChatStore();
  const { primaryBookHash, getParallelHashes } = usePrimaryBookHash(bookKey);

  useEffect(() => {
    assistantRuntimeRef.current = assistantRuntime;
  }, [assistantRuntime]);

  // Auto-submit pending question from inline/mobile composer after the runtime is mounted.
  // Read directly from store to avoid strict-mode double-fire with stale closure values.
  const pendingQuestionHandled = useRef(false);
  useEffect(() => {
    const initialQuestionKey =
      initialQuestion && initialQuestionConversationId
        ? `${initialQuestionConversationId}\u0000${initialQuestion}`
        : null;
    const canUseInitialQuestion =
      !!initialQuestionKey &&
      activeConversationId === initialQuestionConversationId &&
      !scheduledInitialQuestionKeys.has(initialQuestionKey);

    if (
      initialQuestionKey &&
      initialQuestionConversationId &&
      activeConversationId !== initialQuestionConversationId &&
      !scheduledInitialQuestionKeys.has(initialQuestionKey) &&
      !pendingQuestionHandled.current
    ) {
      void setActiveConversation(initialQuestionConversationId);
      return;
    }

    const q = canUseInitialQuestion
      ? initialQuestion
      : initialQuestionKey
        ? null
        : useAIChatStore.getState().pendingQuestion;
    if (!q || pendingQuestionHandled.current) return;

    if (initialQuestionKey && canUseInitialQuestion) {
      pendingQuestionHandled.current = true;
      scheduledInitialQuestionKeys.add(initialQuestionKey);
      if (scheduledInitialQuestionKeys.size > 100) {
        const oldestKey = scheduledInitialQuestionKeys.values().next().value;
        if (oldestKey) scheduledInitialQuestionKeys.delete(oldestKey);
      }

      bindNextUserMessageToConversation(initialQuestionConversationId);

      window.setTimeout(() => {
        assistantRuntimeRef.current.thread.append({
          role: 'user',
          content: [{ type: 'text', text: q }],
        });
        setPendingQuestion(null);
      }, 0);

      return;
    }

    const timeoutId = window.setTimeout(() => {
      if (pendingQuestionHandled.current) return;
      pendingQuestionHandled.current = true;

      assistantRuntimeRef.current.thread.append({
        role: 'user',
        content: [{ type: 'text', text: q }],
      });
      setPendingQuestion(null);
    }, 100);

    return () => window.clearTimeout(timeoutId);
  }, [
    activeConversationId,
    initialQuestion,
    initialQuestionConversationId,
    pendingQuestion,
    setActiveConversation,
    setPendingQuestion,
    bindNextUserMessageToConversation,
  ]);

  const handleNewChat = useCallback(async () => {
    if (!primaryBookHash) return;
    await createConversation(primaryBookHash, _('New conversation'), getParallelHashes());
  }, [createConversation, primaryBookHash, _, getParallelHashes]);

  return (
    <Thread
      onNewChat={handleNewChat}
      isLoadingHistory={isLoadingHistory}
      hasActiveConversation={hasActiveConversation}
      provider={provider}
      byokProvider={byokProvider}
      byokModel={byokModel}
      onSelectModel={onSelectModel}
      composerKeyboardAvoidance={!!appService?.isIOSApp}
      surface={surface}
      mobileWebHeader={mobileWebHeader}
    />
  );
};

const AIAssistant = ({
  bookKey,
  initialQuestion,
  initialQuestionConversationId,
  surface = 'default',
  mobileWebHeader,
}: AIAssistantProps) => {
  const _ = useTranslation();
  const { appService } = useEnv();
  const { settings } = useSettingsStore();
  const { getBookDataByReaderKey } = useBookDataStore();
  const { getView, getProgress, getViewSettings } = useReaderStore();
  const { user } = useAuth();
  const fetchInitialQuota = useAIQuotaStore((s) => s.fetchInitial);
  const userId = user?.id;
  const bookData = getBookDataByReaderKey(bookKey);
  const progress = getProgress(bookKey);
  const { primaryBookHash } = usePrimaryBookHash(bookKey);

  const bookHash = bookData?.book?.platformHash || parseBookRefFromReaderBookKey(bookKey);
  const bookTitle = bookData?.book?.title || 'Unknown';
  const sourceTitle = bookData?.book?.sourceTitle;
  const metadataTitle =
    typeof bookData?.bookDoc?.metadata?.title === 'string'
      ? bookData.bookDoc.metadata.title
      : undefined;
  const catalogBookId = bookData?.book?.catalogBookId;
  const authorName = bookData?.book?.author || '';
  const bookFormat = bookData?.book?.format;
  const viewSettings = getViewSettings(bookKey) ?? settings?.globalViewSettings;
  const readerBookInput = useMemo(
    () => ({
      isFixedLayout: bookData?.isFixedLayout,
      renditionLayout: bookData?.bookDoc?.rendition?.layout,
      format: bookFormat,
    }),
    [bookData?.isFixedLayout, bookData?.bookDoc?.rendition?.layout, bookFormat],
  );
  const readerLayoutState = useMemo(
    () =>
      normalizeReaderLayout({
        settings: viewSettings ?? {},
        book: readerBookInput,
        platform: { isMobile: !!appService?.isMobile },
      }),
    [appService?.isMobile, readerBookInput, viewSettings],
  );
  const readerLocation = useMemo(
    () =>
      getCanonicalReaderLocation({
        progress,
        book: readerBookInput,
        layoutState: readerLayoutState,
      }),
    [progress, readerBookInput, readerLayoutState],
  );
  const sectionHref = readerLocation.sectionHref;
  const sectionFraction = readerLocation.sectionFraction ?? 0;
  const chapterTitle = progress?.sectionLabel || undefined;
  const aiSettings = settings?.aiSettings;

  // Initialize AI quota on mount
  useEffect(() => {
    if (aiSettings?.enabled && userId) {
      fetchInitialQuota(userId);
    }
  }, [userId, aiSettings?.enabled, fetchInitialQuota]);

  const { getChapters: getChaptersForNav } = useBookChapters(
    bookData?.bookDoc ?? null,
    readerLocation,
  );
  useEffect(() => {
    const handleNavigateToOffset = async (event: CustomEvent) => {
      const offset = event.detail?.offset;
      const quoteText = event.detail?.quoteText as string | undefined;
      if (typeof offset !== 'number' || offset < 0) return;

      const chapters = await getChaptersForNav();
      const totalChars = chapters.reduce((sum, ch) => sum + ch.text.length, 0);
      if (totalChars === 0 && readerLocation.bookCapability === 'text') return;

      const target = getReaderNavigationTargetFromAICitation({
        offset,
        quoteText,
        chapters,
        location: readerLocation,
      });
      if (!target) return;

      const view = getView(bookKey);
      if (!view) return;
      await navigateReaderToTarget(view, target, { offset, totalChars });

      // TODO: Flash-highlight the quoted text in the reader for 1.5s
      // Requires flashHighlight() implementation — see GitHub issue
      if (quoteText) {
        console.log(
          `[citation-nav] quoteText available for highlight: "${quoteText.slice(0, 40)}..."`,
        );
      }
    };

    eventDispatcher.on('navigate-to-offset', handleNavigateToOffset);
    return () => {
      eventDispatcher.off('navigate-to-offset', handleNavigateToOffset);
    };
  }, [bookKey, getView, getChaptersForNav, readerLocation]);

  if (!bookHash) {
    return (
      <div className='flex h-full items-center justify-center p-4'>
        <p className='text-muted-foreground text-sm'>{_('Unable to open book')}</p>
      </div>
    );
  }

  if (!aiSettings?.enabled) {
    return (
      <div className='flex h-full items-center justify-center p-4'>
        <p className='text-muted-foreground text-sm'>{_('Enable AI in Settings')}</p>
      </div>
    );
  }

  const chatBookHash = primaryBookHash ?? bookHash;

  // Always render chat immediately — the agentic adapter uses tools to access
  // book content on demand. No indexing or pre-fetching needed.
  return (
    <AIAssistantChat
      aiSettings={aiSettings}
      bookHash={bookHash}
      bookKey={bookKey}
      chatBookHash={chatBookHash}
      bookTitle={bookTitle}
      sourceTitle={sourceTitle}
      metadataTitle={metadataTitle}
      catalogBookId={catalogBookId}
      authorName={authorName}
      sectionHref={sectionHref}
      sectionFraction={sectionFraction}
      chapterTitle={chapterTitle}
      bookFormat={bookFormat}
      bookDoc={bookData?.bookDoc ?? null}
      readerLocation={readerLocation}
      initialQuestion={initialQuestion}
      initialQuestionConversationId={initialQuestionConversationId}
      surface={surface}
      mobileWebHeader={mobileWebHeader}
    />
  );
};

export default AIAssistant;
