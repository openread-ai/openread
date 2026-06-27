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

export type MobileAIChatLayout = 'default' | 'mobile-web';

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
      className='bg-base-200/80 text-base-content hover:bg-base-200 flex size-11 items-center justify-center rounded-full shadow-sm ring-1 ring-black/5 backdrop-blur transition-transform active:scale-95 dark:ring-white/10'
    >
      {children}
    </button>
  );
}

function MobileWebReadAIHeader({
  showHistory,
  isExpanded,
  onClose,
  onShowHistory,
  onBackToChat,
  onNewConversation,
}: {
  showHistory: boolean;
  isExpanded: boolean;
  onClose: () => void;
  onShowHistory: () => void;
  onBackToChat: () => void;
  onNewConversation: () => void;
}) {
  const _ = useTranslation();

  const leftButton = showHistory
    ? { label: _('Back to chat'), onClick: onBackToChat, icon: <LuChevronLeft size={22} /> }
    : isExpanded
      ? { label: _('Chat history'), onClick: onShowHistory, icon: <LuHistory size={20} /> }
      : { label: _('Close Read AI'), onClick: onClose, icon: <LuX size={22} /> };

  return (
    <header className='grid shrink-0 grid-cols-[3rem_minmax(0,1fr)_3rem] items-center gap-2 px-4 pb-2 pt-1'>
      <HeaderIconButton label={leftButton.label} onClick={leftButton.onClick}>
        {leftButton.icon}
      </HeaderIconButton>
      <div className='flex min-w-0 items-center justify-center gap-2'>
        <OpenReadAILogo />
        <span className='text-base-content truncate text-base font-semibold'>{_('Read AI')}</span>
      </div>
      <HeaderIconButton label={_('New Chat')} onClick={onNewConversation}>
        <LuSquarePen size={20} />
      </HeaderIconButton>
    </header>
  );
}

export function MobileChatContent({
  bookKey,
  isExpanded = false,
  initialQuestion,
  initialQuestionConversationId,
  initialView = 'history',
  layout = 'default',
  onConversationSelected,
  onClose,
}: {
  bookKey: string;
  isExpanded?: boolean;
  initialQuestion?: string;
  initialQuestionConversationId?: string;
  initialView?: MobileAIChatInitialView;
  layout?: MobileAIChatLayout;
  onConversationSelected?: () => void;
  onClose?: () => void;
}) {
  const _ = useTranslation();
  const [showHistory, setShowHistory] = useState(initialView === 'history');
  const activeConversationId = useAIChatStore((s) => s.activeConversationId);
  const createConversation = useAIChatStore((s) => s.createConversation);
  const messages = useAIChatStore((s) => s.messages);
  const clearInitialQuestion = useMobileReaderPanelStore((s) => s.clearInitialQuestion);
  const openMobileReaderPanel = useMobileReaderPanelStore((s) => s.openMobileReaderPanel);
  const { primaryBookHash, getParallelHashes } = usePrimaryBookHash(bookKey);
  const isMobileWeb = layout === 'mobile-web';
  const submittedInitialQuestion =
    !!initialQuestion &&
    !!initialQuestionConversationId &&
    messages.some(
      (message) =>
        message.conversationId === initialQuestionConversationId &&
        message.role === 'user' &&
        message.content === initialQuestion,
    );

  useEffect(() => {
    if (submittedInitialQuestion) clearInitialQuestion();
  }, [clearInitialQuestion, submittedInitialQuestion]);

  const showActiveChat = () => {
    setShowHistory(false);
    if (isMobileWeb) {
      openMobileReaderPanel(bookKey, 'ai-chat-history', { initialAIChatView: 'active' });
    }
  };

  const showChatHistory = () => {
    setShowHistory(true);
    if (isMobileWeb) {
      openMobileReaderPanel(bookKey, 'ai-chat-history', { initialAIChatView: 'history' });
    }
  };

  const handleNewConversation = async () => {
    if (!primaryBookHash) return;
    showActiveChat();
    await createConversation(primaryBookHash, _('New conversation'), getParallelHashes());
  };

  const handleConversationSelected = () => {
    showActiveChat();
    onConversationSelected?.();
  };

  const mobileWebActiveHeader = isMobileWeb ? (
    <MobileWebReadAIHeader
      showHistory={false}
      isExpanded
      onClose={() => onClose?.()}
      onShowHistory={showChatHistory}
      onBackToChat={showActiveChat}
      onNewConversation={handleNewConversation}
    />
  ) : undefined;

  const activeChat = (
    <div className='flex min-h-0 flex-1 flex-col overflow-hidden'>
      <AIAssistant
        key={activeConversationId ?? 'new'}
        bookKey={bookKey}
        initialQuestion={initialQuestion}
        initialQuestionConversationId={initialQuestionConversationId}
        surface={isMobileWeb ? 'mobile-web-anchored' : 'default'}
        mobileWebHeader={mobileWebActiveHeader}
      />
    </div>
  );

  const history = (
    <div className='flex min-h-0 flex-1 flex-col overflow-hidden'>
      <ChatHistoryView
        bookKey={bookKey}
        onConversationSelected={handleConversationSelected}
        openNotebookOnSelect={false}
      />
    </div>
  );

  if (!isMobileWeb) {
    // Native/default mobile keeps the existing expanded chat+history split.
    // Mobile web cannot reach this branch: MobileReaderPanelHost passes
    // layout="mobile-web" when isMobileWebReader(appService) is true.
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

  if (!showHistory) return activeChat;

  return (
    <section className='flex h-full min-h-0 w-full flex-col overflow-hidden'>
      <MobileWebReadAIHeader
        showHistory={showHistory}
        isExpanded={isExpanded}
        onClose={() => onClose?.()}
        onShowHistory={showChatHistory}
        onBackToChat={showActiveChat}
        onNewConversation={handleNewConversation}
      />
      <div className='min-h-0 flex-1 overflow-hidden px-3 pb-3'>{history}</div>
    </section>
  );
}

export default MobileChatContent;
