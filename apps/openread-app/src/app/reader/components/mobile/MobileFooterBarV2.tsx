import clsx from 'clsx';
import { useCallback, useEffect } from 'react';
import { IconType } from 'react-icons';
import { IoIosList } from 'react-icons/io';
import { PiChatCircleBold } from 'react-icons/pi';
import { IoSettingsOutline } from 'react-icons/io5';
import { useThemeStore } from '@/store/themeStore';
import { useEnv } from '@/context/EnvContext';
import { useTranslation } from '@/hooks/useTranslation';
import { bridge } from '@/services/bridge/bridgeService';
import { useMobileReaderPanelStore } from '@/store/mobileReaderPanelStore';
import type { MobileReaderPanelDestination } from '../../utils/mobileReaderPanels';

type FooterPanelDestination = Extract<
  MobileReaderPanelDestination,
  'toc' | 'ai-chat-history' | 'settings'
>;

interface MobileFooterBarV2Props {
  bookKey: string;
}

function MobileFooterBarV2({ bookKey }: MobileFooterBarV2Props) {
  const _ = useTranslation();
  const { appService } = useEnv();
  const { safeAreaInsets } = useThemeStore();
  const { activePanel, openMobileReaderPanel, closeMobileReaderPanel } =
    useMobileReaderPanelStore();
  const useNativeBar = !!appService?.isIOSApp;
  const activeDestination = activePanel?.bookKey === bookKey ? activePanel.destination : null;

  const handleOpenSheet = useCallback(
    (destination: FooterPanelDestination) => {
      if (activeDestination === destination) {
        closeMobileReaderPanel();
      } else {
        openMobileReaderPanel(bookKey, destination);
      }
    },
    [activeDestination, bookKey, closeMobileReaderPanel, openMobileReaderPanel],
  );

  useEffect(() => {
    if (!useNativeBar) return;
    const offNativeFooterAction = bridge.on('nativeFooterAction', ({ action }) => {
      if (action === 'toc') handleOpenSheet('toc');
      if (action === 'chat') handleOpenSheet('ai-chat-history');
      if (action === 'settings') handleOpenSheet('settings');
    });
    return offNativeFooterAction;
  }, [useNativeBar, handleOpenSheet]);

  const buttons: { key: FooterPanelDestination; label: string; Icon: IconType }[] = [
    { key: 'toc', label: _('Table of Contents'), Icon: IoIosList },
    { key: 'ai-chat-history', label: _('Chat'), Icon: PiChatCircleBold },
    { key: 'settings', label: _('Settings'), Icon: IoSettingsOutline },
  ];

  return (
    !useNativeBar && (
      <div
        className='bg-base-200 z-30 mt-auto flex w-full justify-around px-8 py-3 sm:hidden'
        style={{ paddingBottom: `${Math.max(12, (safeAreaInsets?.bottom || 0) * 0.33 + 12)}px` }}
      >
        {buttons.map(({ key, label, Icon }) => (
          <button
            key={key}
            className={clsx(
              'flex flex-col items-center gap-0.5 rounded-lg px-4 py-1 transition-colors',
              activeDestination === key ? 'text-blue-500' : 'text-base-content/70',
            )}
            onClick={() => handleOpenSheet(key)}
            aria-label={label}
          >
            <Icon size={22} />
            <span className='text-[10px] font-medium'>{label}</span>
          </button>
        ))}
      </div>
    )
  );
}

export default MobileFooterBarV2;
