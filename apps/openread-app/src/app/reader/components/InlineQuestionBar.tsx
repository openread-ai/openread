'use client';

import React, { useState, useCallback, useRef } from 'react';
import {
  ArrowUpIcon,
  BookOpenIcon,
  CompassIcon,
  MessageCircleIcon,
  MicIcon,
  PlusIcon,
  UploadIcon,
  XIcon,
} from 'lucide-react';

import { useAIChatStore } from '@/store/aiChatStore';
import { useNotebookStore } from '@/store/notebookStore';
import { useBookDataStore } from '@/store/bookDataStore';
import { useReaderStore } from '@/store/readerStore';
import { useSidebarStore } from '@/store/sidebarStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useThemeStore } from '@/store/themeStore';
import { useEnv } from '@/context/EnvContext';
import { useTranslation } from '@/hooks/useTranslation';
import { appendSpeechText, useSpeechToText } from '@/hooks/useSpeechToText';
import { usePrimaryBookHash } from '@/app/reader/hooks/usePrimaryBookHash';
import { cn } from '@/utils/tailwind';

interface InlineQuestionBarProps {
  bookKey: string;
}

const InlineQuestionBar: React.FC<InlineQuestionBarProps> = ({ bookKey }) => {
  const _ = useTranslation();
  const [question, setQuestion] = useState('');
  const [dismissed, setDismissed] = useState(false);
  const [actionMenuOpen, setActionMenuOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const {
    isSupported: speechSupported,
    isListening: speechListening,
    start: startSpeech,
    stop: stopSpeech,
  } = useSpeechToText();
  const { appService } = useEnv();
  const { settings } = useSettingsStore();
  const { safeAreaInsets } = useThemeStore();
  const hoveredBookKey = useReaderStore((s) => s.hoveredBookKey);
  const setHoveredBookKey = useReaderStore((s) => s.setHoveredBookKey);

  const { createConversation, setPendingQuestion } = useAIChatStore();
  const { setNotebookVisible, setNotebookActiveTab, isNotebookVisible } = useNotebookStore();
  const notebookPinned = useNotebookStore((s) => s.isNotebookPinned);
  const notebookWidth = useNotebookStore((s) => s.notebookWidth);
  const sideBarPinned = useSidebarStore((s) => s.isSideBarPinned);
  const sideBarVisible = useSidebarStore((s) => s.isSideBarVisible);
  const sideBarWidth = useSidebarStore((s) => s.sideBarWidth);

  const { primaryBookHash, getParallelHashes } = usePrimaryBookHash(bookKey);
  const bookTitle = useBookDataStore((s) => s.getBookData(bookKey)?.book?.title);
  const mobilePlaceholder = bookTitle ? `Chat with ${bookTitle}` : _('Chat with this book');
  // Default to enabled while settings load (DEFAULT_AI_SETTINGS.enabled = true).
  // The store initializes as {} before loadSettings() completes.
  const aiEnabled = settings?.aiSettings?.enabled ?? true;
  const notebookOnAI = useNotebookStore((s) => s.notebookActiveTab === 'ai');
  const useMobileWebDock =
    !!appService?.isMobile && !appService?.isIOSApp && !appService?.isAndroidApp;

  // Compute left/right offsets so the bar centers over the reading area
  const leftOffset = sideBarVisible && sideBarPinned && sideBarWidth ? sideBarWidth : '0px';
  const rightOffset = isNotebookVisible && notebookPinned && notebookWidth ? notebookWidth : '0px';

  const openAIChat = useCallback(() => {
    setActionMenuOpen(false);
    setNotebookVisible(true);
    setNotebookActiveTab('ai');
    setHoveredBookKey('');
  }, [setHoveredBookKey, setNotebookActiveTab, setNotebookVisible]);

  const handleToggleAIChat = useCallback(() => {
    if (isNotebookVisible && notebookOnAI) {
      setNotebookVisible(false);
      return;
    }
    openAIChat();
  }, [isNotebookVisible, notebookOnAI, openAIChat, setNotebookVisible]);

  const handleGoToLibrary = useCallback(() => {
    window.location.assign('/library');
  }, []);

  const handleGoToExplore = useCallback(() => {
    window.location.assign('/explore');
  }, []);

  const handleSpeechToText = useCallback(() => {
    if (speechListening) {
      stopSpeech();
      return;
    }

    const started = startSpeech((transcript) => {
      setQuestion((currentQuestion) => appendSpeechText(currentQuestion, transcript));
      requestAnimationFrame(() => inputRef.current?.focus());
    });
    if (!started) inputRef.current?.focus();
  }, [speechListening, startSpeech, stopSpeech]);

  const speechButtonLabel = speechSupported
    ? speechListening
      ? _('Stop dictation')
      : _('Start speech to text')
    : _('Focus message input');

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = question.trim();
      if (!trimmed) return;

      // Store the question so AIAssistant auto-sends it when it mounts
      setPendingQuestion(trimmed);

      // Create conversation under the primary book
      await createConversation(primaryBookHash, trimmed.slice(0, 50), getParallelHashes());
      openAIChat();

      setQuestion('');
    },
    [
      question,
      primaryBookHash,
      createConversation,
      getParallelHashes,
      setPendingQuestion,
      openAIChat,
    ],
  );

  // Don't show if AI is not enabled, dismissed, or notebook AI tab is already visible.
  if (!aiEnabled || dismissed || (!useMobileWebDock && isNotebookVisible && notebookOnAI)) {
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
            ? cn(
                'border-base-content/10 bg-base-200/90 pointer-events-auto w-[92vw] max-w-md flex-col items-stretch gap-3 rounded-[2rem] border px-4 pb-4 pt-3 shadow-xl backdrop-blur-2xl',
                'transition-[width,opacity,padding] duration-300 ease-in-out',
              )
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
        {useMobileWebDock && actionMenuOpen && (
          <div
            className='bg-base-100 border-base-content/10 absolute bottom-full left-0 mb-2 w-44 overflow-hidden rounded-2xl border p-1 shadow-xl'
            role='menu'
          >
            <button
              type='button'
              onClick={handleGoToLibrary}
              className='hover:bg-base-200 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm'
              role='menuitem'
            >
              <UploadIcon className='size-4' />
              {_('Import books')}
            </button>
            <button
              type='button'
              onClick={handleGoToExplore}
              className='hover:bg-base-200 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm'
              role='menuitem'
            >
              <CompassIcon className='size-4' />
              {_('Explore catalog')}
            </button>
          </div>
        )}

        {useMobileWebDock ? (
          <>
            <input
              ref={inputRef}
              type='text'
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder={mobilePlaceholder}
              className='text-base-content placeholder:text-base-content/45 min-h-8 w-full min-w-0 bg-transparent text-xl leading-8 outline-none'
            />

            <div className='flex items-center gap-3'>
              <button
                type='button'
                onClick={() => setActionMenuOpen((open) => !open)}
                className='bg-base-content text-base-100 flex size-11 shrink-0 items-center justify-center rounded-full transition-transform active:scale-95'
                aria-label={_('Import or explore books')}
                aria-expanded={actionMenuOpen}
              >
                <PlusIcon className='size-6' />
              </button>

              <button
                type='button'
                onClick={handleToggleAIChat}
                className='bg-base-content text-base-100 flex h-11 w-12 shrink-0 items-center justify-center rounded-2xl transition-transform active:scale-95'
                aria-label={
                  isNotebookVisible && notebookOnAI ? _('Back to Book') : _('Open AI Chat')
                }
              >
                {isNotebookVisible && notebookOnAI ? (
                  <BookOpenIcon className='size-5' />
                ) : (
                  <MessageCircleIcon className='size-5' />
                )}
              </button>

              <div className='flex-1' />

              {question.trim() ? (
                <button
                  type='submit'
                  className='bg-base-content text-base-100 flex size-11 shrink-0 items-center justify-center rounded-full transition-transform active:scale-95'
                  aria-label={_('Ask')}
                >
                  <ArrowUpIcon className='size-5' />
                </button>
              ) : (
                <button
                  type='button'
                  onClick={handleSpeechToText}
                  className={cn(
                    'bg-base-content text-base-100 flex size-11 shrink-0 items-center justify-center rounded-full transition-transform active:scale-95',
                    speechListening && 'animate-pulse',
                  )}
                  aria-label={speechButtonLabel}
                  aria-pressed={speechListening}
                >
                  <MicIcon className='size-6' />
                </button>
              )}
            </div>
          </>
        ) : (
          <>
            <BookOpenIcon className='text-base-content/40 size-4 shrink-0' />
            <input
              ref={inputRef}
              type='text'
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder={_('Ask about this book...')}
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
