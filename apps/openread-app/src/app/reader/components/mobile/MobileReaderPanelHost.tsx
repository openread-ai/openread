import { useEffect } from 'react';
import { useEnv } from '@/context/EnvContext';
import { useReaderStore } from '@/store/readerStore';
import { useMobileReaderPanelStore } from '@/store/mobileReaderPanelStore';
import { setNativeFooterActiveTab } from '@/services/annotation/nativeMenuBridge';
import {
  isMobileWebReader,
  mobileReaderDestinationToFooterTab,
  type MobileReaderPanelDestination,
} from '../../utils/mobileReaderPanels';
import HalfSheet from './HalfSheet';
import { MobileTOCContent, type MobileTOCTab } from './MobileTOCSheet';
import { MobileChatContent } from './MobileChatSheet';
import { MobileSettingsContent } from './MobileSettingsSheet';

interface MobileReaderPanelHostProps {
  bookKey: string;
}

const tocTabByDestination: Partial<Record<MobileReaderPanelDestination, MobileTOCTab>> = {
  toc: 'chapters',
  highlights: 'highlights',
  bookmarks: 'bookmarks',
};

function MobileReaderPanelHost({ bookKey }: MobileReaderPanelHostProps) {
  const { appService } = useEnv();
  const { setHoveredBookKey } = useReaderStore();
  const { activePanel, closeMobileReaderPanel } = useMobileReaderPanelStore();
  const activeDestination = activePanel?.bookKey === bookKey ? activePanel.destination : null;
  const isOpen = activeDestination !== null;

  useEffect(() => {
    if (!isOpen) return;
    setHoveredBookKey(bookKey);
    (window as unknown as Record<string, unknown>).__sheetOpen = true;
    return () => {
      (window as unknown as Record<string, unknown>).__sheetOpen = false;
    };
  }, [bookKey, isOpen, setHoveredBookKey]);

  useEffect(() => {
    if (!appService?.isIOSApp) return;
    setNativeFooterActiveTab(mobileReaderDestinationToFooterTab(activeDestination));
  }, [activeDestination, appService?.isIOSApp]);

  const handleClose = () => {
    closeMobileReaderPanel();
  };

  const handleConversationSelected = () => {
    setHoveredBookKey(bookKey);
  };

  const isAIChat = activeDestination === 'ai-chat-history';
  const useMobileWebAIChat = isAIChat && isMobileWebReader(appService);

  return (
    <HalfSheet
      isOpen={isOpen}
      onClose={handleClose}
      sheetClassName={
        useMobileWebAIChat ? 'bg-transparent shadow-none backdrop-blur-0 px-3 pb-3' : undefined
      }
      contentClassName={useMobileWebAIChat ? 'overflow-visible' : undefined}
    >
      {({ isExpanded }) => (
        <div
          className={
            useMobileWebAIChat
              ? 'flex h-full min-h-[40vh] w-full overflow-visible'
              : 'min-h-[40vh] flex-1 overflow-y-auto'
          }
        >
          {activeDestination && tocTabByDestination[activeDestination] && (
            <MobileTOCContent
              bookKey={bookKey}
              initialTab={tocTabByDestination[activeDestination]}
            />
          )}
          {activeDestination === 'ai-chat-history' && (
            <MobileChatContent
              bookKey={bookKey}
              isExpanded={isExpanded}
              initialQuestion={activePanel?.initialQuestion}
              initialQuestionConversationId={activePanel?.initialQuestionConversationId}
              initialView={activePanel?.initialAIChatView}
              variant={useMobileWebAIChat ? 'mobile-web-card' : 'default'}
              onConversationSelected={handleConversationSelected}
              onClose={handleClose}
            />
          )}
          {activeDestination === 'settings' && <MobileSettingsContent bookKey={bookKey} />}
        </div>
      )}
    </HalfSheet>
  );
}

export default MobileReaderPanelHost;
