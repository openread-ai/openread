import clsx from 'clsx';
import Image from 'next/image';
import { useEffect, useState, type ReactNode } from 'react';
import { LuChevronLeft, LuHistory, LuPlus, LuSquarePen, LuX } from 'react-icons/lu';

import AIAssistant from '../notebook/AIAssistant';
import ChatHistoryView from '../sidebar/ChatHistoryView';
import { useTranslation } from '@/hooks/useTranslation';
import { useAIChatStore } from '@/store/aiChatStore';
import { usePrimaryBookHash } from '@/app/reader/hooks/usePrimaryBookHash';
import { useMobileReaderPanelStore } from '@/store/mobileReaderPanelStore';
import type { MobileAIChatInitialView } from '@/app/reader/utils/mobileReaderPanels';

const OPENREAD_AI_ICON_LIGHT = '/assets/openread-ai/icon-light.svg';
const OPENREAD_AI_ICON_DARK = '/assets/openread-ai/icon-dark.svg';

export type MobileAIChatVariant = 'default' | 'mobile-web-card';

function OpenReadAILogo() {
  return (
    <span className='bg-base-content/10 relative flex size-8 shrink-0 overflow-hidden rounded-xl'>
      <Image
        src={OPENREAD_AI_ICON_LIGHT}
        alt=''
        width={32}
        height={32}
        className='block dark:hidden'
        priority={false}
      />
      <Image
        src={OPENREAD_AI_ICON_DARK}
        alt=''
        width={32}
        height={32}
        className='hidden dark:block'
        priority={false}
      />
    </span>
  );
}

function ReadAIHeader({ onNewConversation }: { onNewConversation: () => void }) {
  const _ = useTranslation();

  return (
    <div className='border-base-content/10 flex items-center justify-between border-b px-4 py-3'>
      <div className='flex min-w-0 items-center gap-2'>
        <OpenReadAILogo />
        <div className='min-w-0'>
          <h2 className='text-base-content truncate text-sm font-semibold'>{_('Read AI')}</h2>
          <p className='text-base-content/50 truncate text-xs'>{_('Ask about this book')}</p>
        </div>
      </div>
      <button
        type='button'
        onClick={onNewConversation}
        className='bg-base-content text-base-100 flex min-h-11 items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-transform active:scale-95'
        aria-label={_('New Chat')}
      >
        <LuPlus size={14} />
        <span>{_('New')}</span>
      </button>
    </div>
  );
}

function OpenReadAIIdentity() {
  const _ = useTranslation();

  return (
    <div className='pointer-events-none absolute left-1/2 top-5 z-30 flex -translate-x-1/2 flex-col items-center'>
      <span className='relative z-10 flex size-16 items-center justify-center overflow-hidden rounded-full border border-black/5 bg-white shadow-sm dark:border-white/10 dark:bg-neutral-950'>
        <Image
          src={OPENREAD_AI_ICON_LIGHT}
          alt=''
          width={40}
          height={40}
          className='block dark:hidden'
          priority={false}
        />
        <Image
          src={OPENREAD_AI_ICON_DARK}
          alt=''
          width={40}
          height={40}
          className='hidden dark:block'
          priority={false}
        />
      </span>
      <span className='-mt-2 rounded-full bg-neutral-100/95 px-6 py-1.5 text-sm font-medium text-neutral-950 shadow-sm ring-1 ring-black/5 backdrop-blur dark:bg-neutral-900/95 dark:text-neutral-50 dark:ring-white/10'>
        {_('Read AI')}
      </span>
    </div>
  );
}

function HeaderIconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type='button'
      aria-label={label}
      onClick={onClick}
      className='flex size-12 items-center justify-center rounded-full bg-neutral-100/90 text-neutral-950 shadow-sm ring-1 ring-black/5 backdrop-blur transition-transform active:scale-95 dark:bg-neutral-900/90 dark:text-neutral-50 dark:ring-white/10'
    >
      {children}
    </button>
  );
}

export function MobileChatContent({
  bookKey,
  isExpanded = false,
  initialQuestion,
  initialQuestionConversationId,
  initialView = 'history',
  variant = 'default',
  onConversationSelected,
  onClose,
}: {
  bookKey: string;
  isExpanded?: boolean;
  initialQuestion?: string;
  initialQuestionConversationId?: string;
  initialView?: MobileAIChatInitialView;
  variant?: MobileAIChatVariant;
  onConversationSelected?: () => void;
  onClose?: () => void;
}) {
  const _ = useTranslation();
  const [showHistory, setShowHistory] = useState(initialView === 'history');
  const activeConversationId = useAIChatStore((s) => s.activeConversationId);
  const createConversation = useAIChatStore((s) => s.createConversation);
  const messages = useAIChatStore((s) => s.messages);
  const clearInitialQuestion = useMobileReaderPanelStore((s) => s.clearInitialQuestion);
  const { primaryBookHash, getParallelHashes } = usePrimaryBookHash(bookKey);
  const isMobileWebCard = variant === 'mobile-web-card';

  useEffect(() => {
    if (!initialQuestion || !initialQuestionConversationId) return;
    const submittedInitialQuestion = messages.some(
      (message) =>
        message.conversationId === initialQuestionConversationId &&
        message.role === 'user' &&
        message.content === initialQuestion,
    );
    if (submittedInitialQuestion) clearInitialQuestion();
  }, [clearInitialQuestion, initialQuestion, initialQuestionConversationId, messages]);

  const handleNewConversation = async () => {
    if (!primaryBookHash) return;
    setShowHistory(false);
    await createConversation(primaryBookHash, _('New conversation'), getParallelHashes());
  };

  const handleConversationSelected = () => {
    setShowHistory(false);
    onConversationSelected?.();
  };

  const activeChat = (
    <div
      data-testid='mobile-ai-chat-active-panel'
      className={clsx('flex min-h-0 flex-1 flex-col overflow-hidden', isMobileWebCard && 'pt-32')}
    >
      <AIAssistant
        key={activeConversationId ?? 'new'}
        bookKey={bookKey}
        initialQuestion={initialQuestion}
        initialQuestionConversationId={initialQuestionConversationId}
      />
    </div>
  );

  const history = (
    <div
      data-testid='mobile-ai-chat-history-panel'
      className={clsx('flex min-h-0 flex-1 flex-col overflow-hidden', isMobileWebCard && 'pt-32')}
    >
      <ChatHistoryView
        bookKey={bookKey}
        onConversationSelected={handleConversationSelected}
        openNotebookOnSelect={false}
      />
    </div>
  );

  if (!isMobileWebCard) {
    return (
      <div className='flex h-full min-h-[40vh] flex-col overflow-hidden'>
        <ReadAIHeader onNewConversation={handleNewConversation} />
        {isExpanded ? (
          <div className='grid min-h-0 flex-1 grid-cols-[minmax(12rem,0.9fr)_minmax(0,1.4fr)] overflow-hidden'>
            <aside className='border-base-content/10 bg-base-200/70 min-h-0 overflow-hidden border-r'>
              {history}
            </aside>
            <section className='min-h-0 overflow-hidden'>{activeChat}</section>
          </div>
        ) : activeConversationId ? (
          activeChat
        ) : (
          <div className='min-h-0 flex-1 overflow-hidden'>{history}</div>
        )}
      </div>
    );
  }

  return (
    <section
      data-testid='mobile-ai-chat-shell'
      data-expanded={isExpanded ? 'true' : 'false'}
      className={clsx(
        'relative flex min-h-[40vh] w-full flex-col overflow-hidden border border-black/5 bg-white/95 text-neutral-950 shadow-2xl ring-1 ring-black/5 backdrop-blur-2xl dark:border-white/10 dark:bg-neutral-950/95 dark:text-neutral-50 dark:ring-white/10',
        isExpanded ? 'h-full rounded-[2rem]' : 'h-[52vh] rounded-[2rem]',
      )}
    >
      <div className='absolute left-5 right-5 top-5 z-20 flex items-start justify-between'>
        {showHistory ? (
          <HeaderIconButton label={_('Back to chat')} onClick={() => setShowHistory(false)}>
            <LuChevronLeft size={24} />
          </HeaderIconButton>
        ) : isExpanded ? (
          <HeaderIconButton label={_('Chat history')} onClick={() => setShowHistory(true)}>
            <LuHistory size={22} />
          </HeaderIconButton>
        ) : (
          <HeaderIconButton label={_('Close Read AI')} onClick={() => onClose?.()}>
            <LuX size={24} />
          </HeaderIconButton>
        )}

        <HeaderIconButton label={_('New Chat')} onClick={handleNewConversation}>
          <LuSquarePen size={22} />
        </HeaderIconButton>
      </div>

      <OpenReadAIIdentity />

      {showHistory ? history : activeChat}
    </section>
  );
}

export default MobileChatContent;
