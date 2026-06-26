import { useEffect } from 'react';
import { useEnv } from '@/context/EnvContext';
import { useReaderStore } from '@/store/readerStore';
import { useMobileReaderPanelStore } from '@/store/mobileReaderPanelStore';
import { setNativeFooterActiveTab } from '@/services/annotation/nativeMenuBridge';
import {
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
    closeMobileReaderPanel();
    setHoveredBookKey(null);
  };

  return (
    <HalfSheet isOpen={isOpen} onClose={handleClose}>
      <div className='min-h-[40vh] flex-1 overflow-y-auto'>
        {activeDestination && tocTabByDestination[activeDestination] && (
          <MobileTOCContent bookKey={bookKey} initialTab={tocTabByDestination[activeDestination]} />
        )}
        {activeDestination === 'ai-chat-history' && (
          <MobileChatContent
            bookKey={bookKey}
            onConversationSelected={handleConversationSelected}
          />
        )}
        {activeDestination === 'settings' && <MobileSettingsContent bookKey={bookKey} />}
      </div>
    </HalfSheet>
  );
}

export default MobileReaderPanelHost;
