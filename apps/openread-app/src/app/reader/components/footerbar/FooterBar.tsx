import clsx from 'clsx';
import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { useEnv } from '@/context/EnvContext';
import { useReaderStore } from '@/store/readerStore';
import { useSidebarStore } from '@/store/sidebarStore';
import { useBookDataStore } from '@/store/bookDataStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useTranslation } from '@/hooks/useTranslation';
import { useDeviceControlStore } from '@/store/deviceStore';
import { eventDispatcher } from '@/utils/event';
import { bridge } from '@/services/bridge/bridgeService';
import { FooterBarProps, NavigationHandlers, FooterBarChildProps } from './types';
import { computeProgress } from './progressUtils';
import { debounce } from '@/utils/debounce';
import { viewPagination } from '../../hooks/usePagination';
import { setNativeFooterVisible } from '@/services/annotation/nativeMenuBridge';
import MobileFooterBar from './MobileFooterBar';
import MobileFooterBarV2 from '../mobile/MobileFooterBarV2';
import DesktopFooterBar from './DesktopFooterBar';
import TTSControl from '../tts/TTSControl';
import { RSVPControl } from '../rsvp';
import { LAUNCH_TTS_ENABLED } from '@/services/launchFeatures';
import { normalizeReaderLayout } from '../../utils/readerLayoutContract';

const FooterBar: React.FC<FooterBarProps> = ({
  bookKey,
  bookFormat,
  section,
  pageinfo,
  isHoveredAnim,
  gridInsets,
}) => {
  const _ = useTranslation();
  const { appService } = useEnv();
  const { getConfig, setConfig, getBookDataByReaderKey } = useBookDataStore();
  const { settings } = useSettingsStore();
  const { hoveredBookKey, setHoveredBookKey } = useReaderStore();
  const { getView, getViewState, getProgress, getViewSettings } = useReaderStore();
  const { isSideBarVisible, setSideBarVisible } = useSidebarStore();
  const { acquireBackKeyInterception, releaseBackKeyInterception } = useDeviceControlStore();

  const view = getView(bookKey);
  const config = getConfig(bookKey);
  const bookData = getBookDataByReaderKey(bookKey);
  const viewState = getViewState(bookKey);
  const progress = getProgress(bookKey);
  const viewSettings = getViewSettings(bookKey);

  const [userSelectedTab, setUserSelectedTab] = useState('');
  const isMobile = appService?.isMobile || window.innerWidth < 640;
  const actionTab = hoveredBookKey === bookKey || isMobile ? userSelectedTab : '';
  const isVisible = isMobile || hoveredBookKey === bookKey;

  // Sync native iOS footer bar visibility with web footer visibility
  useEffect(() => {
    if (appService?.isIOSApp) {
      setNativeFooterVisible(isVisible);
    }
  }, [isVisible, appService?.isIOSApp]);

  const docs = view?.renderer.getContents() ?? [];
  const pointerInDoc = docs.some(({ doc }) => doc?.body?.style.cursor === 'pointer');

  const { progressValid, progressFraction } = useMemo(
    () => computeProgress(bookFormat, section, pageinfo),
    [bookFormat, section, pageinfo],
  );

  const handleProgressChange = useMemo(
    () =>
      debounce((value: number) => {
        view?.goToFraction(value / 100.0);
      }, 100),
    [view],
  );

  const handleGoPrevPage = useCallback(() => {
    viewPagination(view, viewSettings, 'left', 'page');
  }, [view, viewSettings]);

  const handleGoNextPage = useCallback(() => {
    viewPagination(view, viewSettings, 'right', 'page');
  }, [view, viewSettings]);

  const handleGoPrevSection = useCallback(() => {
    view?.renderer.prevSection?.();
  }, [view]);

  const handleGoNextSection = useCallback(() => {
    view?.renderer.nextSection?.();
  }, [view]);

  const handleGoBack = useCallback(() => {
    view?.history.back();
  }, [view]);

  const handleGoForward = useCallback(() => {
    view?.history.forward();
  }, [view]);

  const handleSpeakText = useCallback(async () => {
    if (!LAUNCH_TTS_ENABLED || !view || !progress || !viewState) return;

    const eventType = viewState.ttsEnabled ? 'tts-stop' : 'tts-speak';
    eventDispatcher.dispatch(eventType, { bookKey });
  }, [view, progress, viewState, bookKey]);

  const handleSetActionTab = useCallback(
    (tab: string) => {
      setUserSelectedTab((prevTab) => (prevTab === tab ? '' : tab));

      if (tab === 'tts') {
        // Launch holdback: TTS is intentionally hidden/disabled until post-launch.
        if (!LAUNCH_TTS_ENABLED) return;
        if (viewState?.ttsEnabled) {
          setHoveredBookKey('');
        }
        handleSpeakText();
      } else if (tab === 'toc') {
        setHoveredBookKey('');
        if (config?.viewSettings) {
          setConfig(bookKey, { viewSettings: { ...config.viewSettings, sideBarTab: 'toc' } });
        }
        setSideBarVisible(true);
      } else if (tab === 'note') {
        setHoveredBookKey('');
        setSideBarVisible(true);
        if (config?.viewSettings) {
          setConfig(bookKey, {
            viewSettings: { ...config.viewSettings, sideBarTab: 'annotations' },
          });
        }
      }
    },
    [
      config,
      bookKey,
      viewState?.ttsEnabled,
      setConfig,
      setSideBarVisible,
      setHoveredBookKey,
      handleSpeakText,
    ],
  );

  const navigationHandlers: NavigationHandlers = useMemo(
    () => ({
      onPrevPage: handleGoPrevPage,
      onNextPage: handleGoNextPage,
      onPrevSection: handleGoPrevSection,
      onNextSection: handleGoNextSection,
      onGoBack: handleGoBack,
      onGoForward: handleGoForward,
      onProgressChange: handleProgressChange,
    }),
    [
      handleGoPrevPage,
      handleGoNextPage,
      handleGoPrevSection,
      handleGoNextSection,
      handleGoBack,
      handleGoForward,
      handleProgressChange,
    ],
  );

  const handleKeyDown = useCallback(
    (event: { keyName: string }) => {
      if (event.keyName === 'Back') {
        setHoveredBookKey('');
        return true;
      }
      return false;
    },
    [setHoveredBookKey],
  );

  useEffect(() => {
    if (!appService?.isAndroidApp) return;

    if (hoveredBookKey) {
      acquireBackKeyInterception();
      bridge.onSync('nativeKeyDown', handleKeyDown);
    }
    return () => {
      if (hoveredBookKey) {
        releaseBackKeyInterception();
        bridge.offSync('nativeKeyDown', handleKeyDown);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hoveredBookKey]);

  const commonProps: FooterBarChildProps = {
    bookKey,
    gridInsets,
    actionTab,
    progressValid,
    progressFraction,
    navigationHandlers,
    onSetActionTab: handleSetActionTab,
    onSpeakText: handleSpeakText,
  };

  const readerLayout = viewSettings
    ? normalizeReaderLayout({
        settings: viewSettings,
        book: {
          isFixedLayout: bookData?.isFixedLayout,
          renditionLayout: bookData?.bookDoc?.rendition?.layout,
          format: bookData?.book?.format,
        },
        platform: { isMobile: !!appService?.isMobile },
      })
    : null;
  const needHorizontalScroll =
    (viewSettings?.vertical && readerLayout?.layoutMode === 'continuous') ||
    (bookData?.isFixedLayout && viewSettings?.pageZoomLevel && viewSettings.pageZoomLevel > 100);

  const containerClasses = clsx(
    'footer-bar shadow-xs bottom-0 z-10 flex w-full flex-col sm:h-[52px]',
    'sm:bg-base-100 border-base-300/50 border-t sm:border-none',
    'transition-[opacity,transform] duration-300',
    window.innerWidth < 640 ? 'fixed' : 'absolute',
    appService?.hasRoundedWindow && 'rounded-window-bottom-right',
    !isSideBarVisible && appService?.hasRoundedWindow && 'rounded-window-bottom-left',
    isHoveredAnim && 'hover-bar-anim',
    needHorizontalScroll ? 'sm:!bottom-3 sm:!h-10 sm:justify-end' : 'sm:justify-center',
    isVisible
      ? 'pointer-events-auto translate-y-0 opacity-100'
      : 'pointer-events-none translate-y-full opacity-0 sm:translate-y-0',
  );

  const useMobileSettingsSheet = isMobile || appService?.isIOSApp;
  const aiEnabled = settings?.aiSettings?.enabled ?? true;
  const useMobileWebReaderChatDock =
    aiEnabled && !!appService?.isMobile && !appService?.isIOSApp && !appService?.isAndroidApp;

  return (
    <>
      {/* Hover trigger area */}
      <div
        role='none'
        className={clsx(
          'absolute bottom-0 left-0 z-10 flex h-[52px] w-full',
          needHorizontalScroll && 'sm:!bottom-3 sm:!h-7',
          isMobile || pointerInDoc ? 'pointer-events-none' : '',
        )}
        onMouseEnter={() => !isMobile && setHoveredBookKey(bookKey)}
        onTouchStart={() => !isMobile && setHoveredBookKey(bookKey)}
      />

      {/* Main footer container */}
      {!useMobileWebReaderChatDock && (
        <div
          role='group'
          aria-label={_('Footer Bar')}
          className={containerClasses}
          dir={viewSettings?.rtl ? 'rtl' : 'ltr'}
          onFocus={() => !appService?.isMobile && setHoveredBookKey(bookKey)}
          onMouseLeave={() => window.innerWidth >= 640 && setHoveredBookKey('')}
        >
          {useMobileSettingsSheet ? (
            <MobileFooterBarV2 bookKey={bookKey} />
          ) : (
            <MobileFooterBar {...commonProps} />
          )}
          <DesktopFooterBar {...commonProps} />
        </div>
      )}
      {isVisible && needHorizontalScroll && (
        <div className='bg-base-100 pointer-events-none absolute bottom-0 left-0 hidden h-3 w-full sm:block' />
      )}

      {/* Launch holdback: TTS control remains in code but is hidden for launch. */}
      {LAUNCH_TTS_ENABLED && <TTSControl bookKey={bookKey} gridInsets={gridInsets} />}
      <RSVPControl bookKey={bookKey} />
    </>
  );
};

export default FooterBar;
