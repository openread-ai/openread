'use client';

import React, { useState, useCallback, useRef } from 'react';
import { ArrowUpIcon, BookOpenIcon, MenuIcon, XIcon } from 'lucide-react';

import { AI_COMPOSER_PLACEHOLDER } from '@/components/assistant/constants';
import { MobileReadAIComposerChrome } from '@/components/assistant/MobileReadAIComposerChrome';
import { useAIChatStore } from '@/store/aiChatStore';
import { useNotebookStore } from '@/store/notebookStore';
import { useReaderStore } from '@/store/readerStore';
import { useSidebarStore } from '@/store/sidebarStore';
import { useMobileReaderPanelStore } from '@/store/mobileReaderPanelStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useThemeStore } from '@/store/themeStore';
import { useEnv } from '@/context/EnvContext';
import { useTranslation } from '@/hooks/useTranslation';
import { usePrimaryBookHash } from '@/app/reader/hooks/usePrimaryBookHash';
import { isMobileWebReader } from '@/app/reader/utils/mobileReaderPanels';
import { cn } from '@/utils/tailwind';
import ViewMenu from './ViewMenu';

interface InlineQuestionBarProps {
  bookKey: string;
}

const InlineQuestionBar: React.FC<InlineQuestionBarProps> = ({ bookKey }) => {
  const _ = useTranslation();
  const [question, setQuestion] = useState('');
  const [dismissed, setDismissed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const mobileTextareaRef = useRef<HTMLTextAreaElement>(null);
  const { appService } = useEnv();
  const { settings } = useSettingsStore();
  const { safeAreaInsets } = useThemeStore();
  const hoveredBookKey = useReaderStore((s) => s.hoveredBookKey);
  const setHoveredBookKey = useReaderStore((s) => s.setHoveredBookKey);

  const { createConversation, setPendingQuestion } = useAIChatStore();
  const { activePanel, openMobileReaderPanel } = useMobileReaderPanelStore();
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
      const submitter = (e.nativeEvent as SubmitEvent).submitter;
      if (
        submitter instanceof HTMLElement &&
        submitter.closest('[data-openread-mobile-read-ai-menu]')
      ) {
        return;
      }
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

  // On mobile: keep mounted but collapse when footer bar or sheet is active.
  // This enables the smooth expand/shrink morph transition.
  const isSheetOpen = !!(window as unknown as Record<string, unknown>).__sheetOpen;
  const mobileCollapsed =
    appService?.isMobile && !useMobileWebDock && (!!hoveredBookKey || isSheetOpen);

  // On desktop, unmount entirely when not needed
  if (!appService?.isMobile && hoveredBookKey) return null;

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
          useMobileWebDock
            ? 'pointer-events-auto w-[calc(100vw-2rem)] max-w-md'
            : appService?.isMobile
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
        {useMobileWebDock ? (
          <div className='relative w-full'>
            {mobileMenuOpen && (
              <button
                type='button'
                className='fixed inset-0 z-40 cursor-default bg-transparent'
                aria-label={_('Close reader menu')}
                onClick={() => setMobileMenuOpen(false)}
              />
            )}
            {mobileMenuOpen && (
              <div
                className='absolute bottom-full left-0 z-50 mb-3'
                data-openread-mobile-read-ai-menu
                data-testid='mobile-read-ai-composer-menu-content'
              >
                <ViewMenu bookKey={bookKey} setIsDropdownOpen={setMobileMenuOpen} />
              </div>
            )}
            <MobileReadAIComposerChrome
              className={cn('!overflow-visible', question.includes(' ') && 'rounded-[2rem]')}
            >
              <button
                type='button'
                aria-label={_('Reader menu')}
                data-testid='mobile-read-ai-composer-menu-button'
                aria-expanded={mobileMenuOpen}
                className='text-base-content/70 hover:bg-base-content/10 flex size-11 shrink-0 items-center justify-center rounded-full transition-colors active:scale-95'
                onClick={() => setMobileMenuOpen((open) => !open)}
              >
                <MenuIcon className='size-5' />
              </button>
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
          </div>
        ) : (
          <>
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
          </>
        )}
      </form>
    </div>
  );
};

export default InlineQuestionBar;
