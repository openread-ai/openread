'use client';

import React, { useState, useCallback, useRef } from 'react';
import { ArrowUpIcon, XIcon, BookOpenIcon } from 'lucide-react';

import { useAIChatStore } from '@/store/aiChatStore';
import { useNotebookStore } from '@/store/notebookStore';
import { useSidebarStore } from '@/store/sidebarStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useTranslation } from '@/hooks/useTranslation';
import { cn } from '@/utils/tailwind';

interface InlineQuestionBarProps {
  bookKey: string;
}

const InlineQuestionBar: React.FC<InlineQuestionBarProps> = ({ bookKey }) => {
  const _ = useTranslation();
  const [question, setQuestion] = useState('');
  const [dismissed, setDismissed] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { settings } = useSettingsStore();

  const { createConversation, setPendingQuestion } = useAIChatStore();
  const { setNotebookVisible, setNotebookActiveTab, isNotebookVisible } = useNotebookStore();
  const notebookPinned = useNotebookStore((s) => s.isNotebookPinned);
  const notebookWidth = useNotebookStore((s) => s.notebookWidth);
  const sideBarPinned = useSidebarStore((s) => s.isSideBarPinned);
  const sideBarVisible = useSidebarStore((s) => s.isSideBarVisible);
  const sideBarWidth = useSidebarStore((s) => s.sideBarWidth);

  const bookHash = bookKey.split('-')[0] || '';
  const aiEnabled = settings?.aiSettings?.enabled;
  const notebookOnAI = useNotebookStore((s) => s.notebookActiveTab === 'ai');

  // Compute left/right offsets so the bar centers over the reading area
  const leftOffset = sideBarVisible && sideBarPinned && sideBarWidth ? sideBarWidth : '0px';
  const rightOffset = isNotebookVisible && notebookPinned && notebookWidth ? notebookWidth : '0px';

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = question.trim();
      if (!trimmed) return;

      // Store the question so AIAssistant auto-sends it when it mounts
      setPendingQuestion(trimmed);

      // Create conversation and open AI chat
      await createConversation(bookHash, trimmed.slice(0, 50));
      setNotebookVisible(true);
      setNotebookActiveTab('ai');

      setQuestion('');
    },
    [
      question,
      bookHash,
      createConversation,
      setPendingQuestion,
      setNotebookVisible,
      setNotebookActiveTab,
    ],
  );

  // Don't show if AI is not enabled, dismissed, or notebook AI tab is already visible
  if (!aiEnabled || dismissed || (isNotebookVisible && notebookOnAI)) return null;

  return (
    <div
      className='animate-in fade-in slide-in-from-bottom-4 pointer-events-none fixed bottom-6 z-30 flex justify-center transition-[left,right] duration-300'
      style={{ left: leftOffset, right: rightOffset }}
    >
      <form
        onSubmit={handleSubmit}
        className={cn(
          'pointer-events-auto flex w-full max-w-md items-center gap-2',
          'rounded-2xl border px-3 py-2',
          'border-base-content/10 bg-base-100/95 backdrop-blur-md',
          'shadow-lg',
        )}
      >
        <BookOpenIcon className='text-base-content/40 size-4 shrink-0' />
        <input
          ref={inputRef}
          type='text'
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder={_('Ask about this book...')}
          className='text-base-content placeholder:text-base-content/40 min-w-0 flex-1 bg-transparent text-sm outline-none'
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
