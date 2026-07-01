'use client';

import React, { useState, useCallback, useMemo, useRef } from 'react';
import { ArrowUpIcon, BookOpenIcon, XIcon } from 'lucide-react';

import { AI_COMPOSER_PLACEHOLDER } from '@/components/assistant/constants';
import { MobileReadAIComposerChrome } from '@/components/assistant/MobileReadAIComposerChrome';
import { useAIChatStore } from '@/store/aiChatStore';
import { useNotebookStore } from '@/store/notebookStore';
import { useReaderStore } from '@/store/readerStore';
import { useSidebarStore } from '@/store/sidebarStore';
import { useBookDataStore } from '@/store/bookDataStore';
import {
  selectIsAnyMobileReaderPanelOpen,
  useMobileReaderPanelStore,
} from '@/store/mobileReaderPanelStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useThemeStore } from '@/store/themeStore';
import { useEnv } from '@/context/EnvContext';
import { useTranslation } from '@/hooks/useTranslation';
import { usePrimaryBookHash } from '@/app/reader/hooks/usePrimaryBookHash';
import { isMobileWebReader } from '@/app/reader/utils/mobileReaderPanels';
import { getEffectiveReaderDockOcclusionStyles } from '../utils/readerLayoutContract';
import { cn } from '@/utils/tailwind';
import { MobileReaderMenuLauncher } from './mobile/MobileReaderMenuLauncher';

interface InlineQuestionBarProps {
  bookKey: string;
}

const InlineQuestionBar: React.FC<InlineQuestionBarProps> = ({ bookKey }) => {
  const _ = useTranslation();
  const [question, setQuestion] = useState('');
  const [dismissed, setDismissed] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const mobileTextareaRef = useRef<HTMLTextAreaElement>(null);
  const { appService } = useEnv();
  const { settings } = useSettingsStore();
  const { safeAreaInsets } = useThemeStore();
  const hoveredBookKey = useReaderStore((s) => s.hoveredBookKey);
  const setHoveredBookKey = useReaderStore((s) => s.setHoveredBookKey);
  const viewSettings = useReaderStore((s) => s.viewStates[bookKey]?.viewSettings ?? null);
  const bookData = useBookDataStore((s) => s.getBookDataByReaderKey(bookKey));

  const { createConversation, setPendingQuestion } = useAIChatStore();
  const { activePanel, openMobileReaderPanel } = useMobileReaderPanelStore();
  const isAnyMobileReaderPanelOpen = useMobileReaderPanelStore(selectIsAnyMobileReaderPanelOpen);
  const { setNotebookVisible, setNotebookActiveTab, isNotebookVisible } = useNotebookStore();
  const notebookPinned = useNotebookStore((s) => s.isNotebookPinned);
  const notebookWidth = useNotebookStore((s) => s.notebookWidth);
  const sideBarPinned = useSidebarStore((s) => s.isSideBarPinned);
  const sideBarVisible = useSidebarStore((s) => s.isSideBarVisible);
  const sideBarWidth = useSidebarStore((s) => s.sideBarWidth);

  const { primaryBookHash, getParallelHashes } = usePrimaryBookHash(bookKey);
  const composerPlaceholder = _(AI_COMPOSER_PLACEHOLDER);
  // Default to enabled while settings load (DEFAULT_AI_SETTINGS.enabled = true).
  // The store initializes as {} before loadSettings() completes.
  const aiEnabled = settings?.aiSettings?.enabled ?? true;
  const notebookOnAI = useNotebookStore((s) => s.notebookActiveTab === 'ai');
  const useMobileWebDock = isMobileWebReader(appService);

  // Compute left/right offsets so the bar centers over the reading area
  const leftOffset = sideBarVisible && sideBarPinned && sideBarWidth ? sideBarWidth : '0px';
  const rightOffset = isNotebookVisible && notebookPinned && notebookWidth ? notebookWidth : '0px';

  const openAIChat = useCallback(
    (initialQuestion: string, initialQuestionConversationId?: string) => {
      if (useMobileWebDock) {
        openMobileReaderPanel(bookKey, 'ai-chat-history', {
          initialQuestion,
          initialQuestionConversationId,
        });
        setHoveredBookKey(bookKey);
        return;
      }

      setNotebookVisible(true);
      setNotebookActiveTab('ai');
      setHoveredBookKey('');
    },
    [
      bookKey,
      openMobileReaderPanel,
      setHoveredBookKey,
      setNotebookActiveTab,
      setNotebookVisible,
      useMobileWebDock,
    ],
  );

  const resizeMobileComposer = useCallback((element: HTMLTextAreaElement | null) => {
    if (!element) return;
    const maxHeight = 128;
    element.style.height = 'auto';
    element.style.height = `${Math.min(element.scrollHeight, maxHeight)}px`;
    element.style.overflowY = element.scrollHeight > maxHeight ? 'auto' : 'hidden';
  }, []);

  const handleMobileQuestionChange = useCallback(
    (event: React.ChangeEvent<HTMLTextAreaElement>) => {
      setQuestion(event.target.value);
      resizeMobileComposer(event.target);
    },
    [resizeMobileComposer],
  );

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = question.trim();
      if (!trimmed) return;

      if (!primaryBookHash) return;

      // Create conversation under the primary book, then hand off the question
      // once to the canonical assistant runtime.
      const conversationId = await createConversation(
        primaryBookHash,
        trimmed.slice(0, 50),
        getParallelHashes(),
      );
      setPendingQuestion(trimmed);
      openAIChat(trimmed, conversationId);

      setQuestion('');
      requestAnimationFrame(() => {
        resizeMobileComposer(mobileTextareaRef.current);
      });
    },
    [
      question,
      primaryBookHash,
      createConversation,
      getParallelHashes,
      setPendingQuestion,
      openAIChat,
      resizeMobileComposer,
    ],
  );

  const mobileAISheetOpen =
    useMobileWebDock &&
    activePanel?.bookKey === bookKey &&
    activePanel.destination === 'ai-chat-history';
  const mobileDockOcclusion = useMemo(() => {
    if (!useMobileWebDock || !viewSettings) return { enabled: false };

    return getEffectiveReaderDockOcclusionStyles({
      settings: viewSettings,
      book: {
        isFixedLayout: bookData?.isFixedLayout,
        renditionLayout: bookData?.bookDoc?.rendition?.layout,
        format: bookData?.book?.format,
      },
      platform: {
        isMobile: !!appService?.isMobile,
        isIOSApp: !!appService?.isIOSApp,
        isAndroidApp: !!appService?.isAndroidApp,
      },
    });
  }, [
    appService?.isAndroidApp,
    appService?.isIOSApp,
    appService?.isMobile,
    bookData?.book?.format,
    bookData?.bookDoc?.rendition?.layout,
    bookData?.isFixedLayout,
    useMobileWebDock,
    viewSettings,
  ]);

  // Don't show if AI is not enabled, dismissed, owned by the mobile AI sheet,
  // or the desktop/native notebook AI tab is already visible.
  if (
    !aiEnabled ||
    dismissed ||
    mobileAISheetOpen ||
    (!useMobileWebDock && isNotebookVisible && notebookOnAI)
  ) {
    return null;
  }

  // On mobile: keep mounted but collapse when footer bar or reader panel is active.
  // This enables the smooth expand/shrink morph transition.
  const mobileCollapsed =
    appService?.isMobile && !useMobileWebDock && (!!hoveredBookKey || isAnyMobileReaderPanelOpen);
  const mobileDockBottomOffsetPx = Math.max((safeAreaInsets?.bottom || 0) - 10, 8);

  // On desktop, unmount entirely when not needed
  if (!appService?.isMobile && hoveredBookKey) return null;

  if (useMobileWebDock) {
    return (
      <div
        className='pointer-events-none fixed left-0 right-0 z-30 flex justify-center transition-none'
        style={{ bottom: `${mobileDockBottomOffsetPx}px` }}
      >
        <div
          className='pointer-events-auto relative flex w-[calc(100vw-2rem)] max-w-md items-end gap-3'
          data-testid='mobile-reader-dock'
        >
          {mobileDockOcclusion.enabled && (
            <div
              aria-hidden='true'
              className='pointer-events-none absolute -inset-x-2 -bottom-2 -top-2 z-0 rounded-[2.25rem]'
              data-testid='mobile-reader-dock-occlusion-mask'
              style={{ backgroundColor: mobileDockOcclusion.backgroundColor }}
            />
          )}
          <MobileReaderMenuLauncher
            bookKey={bookKey}
            className='relative z-10'
            dockBottomOffsetPx={mobileDockBottomOffsetPx}
          />
          <form onSubmit={handleSubmit} className='relative z-10 min-w-0 flex-1 overflow-visible'>
            <MobileReadAIComposerChrome
              className={cn('!overflow-visible', question.includes(' ') && 'rounded-[2rem]')}
            >
              <textarea
                ref={mobileTextareaRef}
                value={question}
                onChange={handleMobileQuestionChange}
                onFocus={(event) => resizeMobileComposer(event.currentTarget)}
                placeholder={composerPlaceholder}
                rows={1}
                className='text-base-content placeholder:text-base-content/45 max-h-32 min-h-11 min-w-0 flex-1 resize-none overflow-hidden bg-transparent py-2.5 text-base leading-6 outline-none focus-visible:ring-0'
                data-testid='mobile-ai-inline-composer-input'
              />
              {question.trim() && (
                <button
                  type='submit'
                  className='bg-base-content text-base-100 flex size-11 shrink-0 items-center justify-center rounded-full transition-transform active:scale-95 motion-reduce:transition-none'
                  aria-label={_('Ask')}
                  data-testid='mobile-ai-inline-composer-send'
                >
                  <ArrowUpIcon className='size-5' />
                </button>
              )}
            </MobileReadAIComposerChrome>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'pointer-events-none fixed z-30 flex justify-center',
        appService?.isMobile
          ? 'transition-none'
          : 'animate-in fade-in slide-in-from-bottom-4 transition-[left,right] duration-300',
      )}
      style={{
        left: appService?.isMobile ? 0 : leftOffset,
        right: appService?.isMobile ? 0 : rightOffset,
        bottom: appService?.isMobile
          ? `${Math.max((safeAreaInsets?.bottom || 0) - 10, 8)}px`
          : `${24 + (safeAreaInsets?.bottom || 0)}px`,
      }}
    >
      <form
        onSubmit={handleSubmit}
        className={cn(
          'relative flex overflow-visible',
          appService?.isMobile
            ? cn(
                'border-base-content/10 bg-base-200/80 rounded-full border shadow-lg backdrop-blur-2xl',
                'transition-[width,opacity,padding] duration-300 ease-in-out',
                mobileCollapsed
                  ? 'pointer-events-none w-0 px-0 opacity-0'
                  : 'pointer-events-auto w-[85vw] max-w-xs px-4 py-2.5 opacity-100',
              )
            : 'border-base-content/10 bg-base-100/95 pointer-events-auto w-[85%] max-w-sm items-center gap-2 rounded-2xl border px-3 py-2 shadow-lg backdrop-blur-xl',
        )}
      >
        <BookOpenIcon className='text-base-content/40 size-4 shrink-0' />
        <input
          ref={inputRef}
          type='text'
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder={composerPlaceholder}
          className={cn(
            'min-w-0 flex-1 bg-transparent text-sm outline-none',
            appService?.isMobile
              ? 'text-base-content placeholder:text-base-content/50'
              : 'text-base-content placeholder:text-base-content/55',
          )}
        />
        {question.trim() ? (
          <button
            type='submit'
            className='bg-base-content text-base-100 flex size-7 shrink-0 items-center justify-center rounded-full transition-transform active:scale-95'
            aria-label={_('Ask')}
          >
            <ArrowUpIcon className='size-3.5' />
          </button>
        ) : (
          <button
            type='button'
            onClick={() => setDismissed(true)}
            className='text-base-content/40 hover:text-base-content flex size-7 shrink-0 items-center justify-center rounded-full transition-colors'
            aria-label={_('Dismiss')}
          >
            <XIcon className='size-3.5' />
          </button>
        )}
      </form>
    </div>
  );
};

export default InlineQuestionBar;
