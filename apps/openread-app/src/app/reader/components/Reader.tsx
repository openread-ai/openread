'use client';

import clsx from 'clsx';
import * as React from 'react';
import { useEffect, Suspense } from 'react';
import { useRouter } from 'next/navigation';

import { useEnv } from '@/context/EnvContext';
import { useTheme } from '@/hooks/useTheme';
import { useLibrary } from '@/hooks/useLibrary';
import { useThemeStore } from '@/store/themeStore';
import { useReaderStore } from '@/store/readerStore';
import { useSidebarStore } from '@/store/sidebarStore';
import { useNotebookStore } from '@/store/notebookStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useDeviceControlStore } from '@/store/deviceStore';
import { useScreenWakeLock } from '@/hooks/useScreenWakeLock';
import { useTransferQueue } from '@/hooks/useTransferQueue';
import { eventDispatcher } from '@/utils/event';
import { navigateToLibrary } from '@/utils/nav';
import { interceptWindowOpen } from '@/utils/open';
import { mountAdditionalFonts } from '@/styles/fonts';
import { isTauriAppPlatform } from '@/services/environment';
import { getThemeCode } from '@/utils/style';
import { getSysFontsList, setSystemUIVisibility } from '@/utils/bridge';
import { bridge } from '@/services/bridge/bridgeService';
import { AboutWindow } from '@/components/AboutWindow';
import { UpdaterWindow } from '@/components/UpdaterWindow';
import { KOSyncSettingsWindow } from './KOSyncSettings';
import { ProofreadRulesManager } from './ProofreadRules';
import { Toast } from '@/components/Toast';
import { getLocale } from '@/utils/misc';
import { initDayjs } from '@/utils/time';
import ReaderContent from './ReaderContent';
import ReaderErrorBoundary from './ReaderErrorBoundary';

/*
Z-Index Layering Guide:
---------------------------------
99 – Window Border (Linux only)
     • Ensures the border stays on top of all UI elements.
50 – Loading Progress / Toast Notifications / Dialogs / Popups
     • Includes Settings, About, Updater, KOSync dialogs and Annotation popups.
45 – Sidebar / Notebook (Unpinned)
     • Floats above the content but below global dialogs.
40 – TTS Bar
     • Mini controls for TTS playback on top of the TTS Control.
30 – TTS Control
     • Persistent TTS icon/panel.
20 – Menu / Sidebar / Notebook (Pinned)
     • Docked navigation or note views.
10 – Headerbar / Footbar / Ribbon
     • Top toolbar, bottom footbar and ribbon elements.
 0 – Base Content
     • Main reading area or background content.
*/

const Reader: React.FC<{ ids?: string }> = ({ ids }) => {
  const router = useRouter();
  const { appService } = useEnv();
  const { settings } = useSettingsStore();
  const { libraryLoaded, libraryReconciliationSettled } = useLibrary();
  // Selectors: only re-render when these specific values change
  const hoveredBookKey = useReaderStore((s) => s.hoveredBookKey);
  const sideBarBookKey = useSidebarStore((s) => s.sideBarBookKey);
  const isSideBarPinned = useSidebarStore((s) => s.isSideBarPinned);
  const isSideBarVisible = useSidebarStore((s) => s.isSideBarVisible);
  const isNotebookPinned = useNotebookStore((s) => s.isNotebookPinned);
  const isNotebookVisible = useNotebookStore((s) => s.isNotebookVisible);
  const isDarkMode = useThemeStore((s) => s.isDarkMode);
  const themeColor = useThemeStore((s) => s.themeColor);
  const isRoundedWindow = useThemeStore((s) => s.isRoundedWindow);
  const systemUIAlwaysHidden = useThemeStore((s) => s.systemUIAlwaysHidden);

  // Actions only used in effects/handlers — access via getState() to avoid subscriptions
  const { showSystemUI, dismissSystemUI } = useThemeStore.getState();
  const { getScreenBrightness, setScreenBrightness } = useDeviceControlStore.getState();
  const { acquireBackKeyInterception, releaseBackKeyInterception } =
    useDeviceControlStore.getState();
  const { setSideBarVisible } = useSidebarStore.getState();
  const { setNotebookVisible } = useNotebookStore.getState();

  useTheme({ systemUIVisible: settings.alwaysShowStatusBar, appThemeColor: 'base-100' });
  useScreenWakeLock(settings.screenWakeLock);
  useTransferQueue(libraryLoaded, 5000, libraryReconciliationSettled);

  useEffect(() => {
    mountAdditionalFonts(document);
    interceptWindowOpen();
    if (isTauriAppPlatform()) {
      setTimeout(getSysFontsList, 3000);
      // Disable the native drag overlay so reader toolbar buttons are clickable.
      // The platform layout uses its own data-tauri-drag-region spacer div.
      bridge.send('setNativeDragRegion', { enabled: false }).catch(() => {});
    }
    initDayjs(getLocale());
    return () => {
      if (isTauriAppPlatform()) {
        bridge.send('setNativeDragRegion', { enabled: true }).catch(() => {});
      }
    };
  }, []);

  useEffect(() => {
    const brightness = settings.screenBrightness;
    const autoBrightness = settings.autoScreenBrightness;
    if (appService?.hasScreenBrightness && !autoBrightness && brightness >= 0) {
      setScreenBrightness(brightness / 100);
    }
    let previousBrightness = -1;
    if (appService?.isIOSApp) {
      getScreenBrightness().then((b) => {
        previousBrightness = b;
      });
    }

    return () => {
      if (appService?.hasScreenBrightness && !autoBrightness) {
        setScreenBrightness(previousBrightness);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appService]);

  const handleReaderBoundaryBackToLibrary = React.useCallback(() => {
    eventDispatcher.dispatch('close-reader');
    navigateToLibrary(router, '', undefined, true);
  }, [router]);

  const handleKeyDown = (event: { keyName: string }) => {
    if (event.keyName === 'Back') {
      if (isSideBarVisible && !isSideBarPinned) {
        setSideBarVisible(false);
      } else if (isNotebookVisible && !isNotebookPinned) {
        setNotebookVisible(false);
      } else {
        eventDispatcher.dispatch('close-reader');
        router.back();
      }
      return true;
    }
    return false;
  };

  useEffect(() => {
    if (!appService?.isAndroidApp) return;
    acquireBackKeyInterception();
    return () => {
      releaseBackKeyInterception();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appService?.isAndroidApp]);

  useEffect(() => {
    if (appService?.isAndroidApp) {
      bridge.onSync('nativeKeyDown', handleKeyDown);
    }
    return () => {
      if (appService?.isAndroidApp) {
        bridge.offSync('nativeKeyDown', handleKeyDown);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    appService?.isAndroidApp,
    sideBarBookKey,
    isSideBarPinned,
    isSideBarVisible,
    isNotebookPinned,
    isNotebookVisible,
  ]);

  const lastReaderSystemUIPayload = React.useRef<string | null>(null);
  useEffect(() => {
    if (!appService?.isMobileApp) return;
    const systemUIVisible = !!hoveredBookKey || settings.alwaysShowStatusBar;
    const visible = !!(systemUIVisible && !systemUIAlwaysHidden);
    const surfaceColorHex = getThemeCode().palette['base-100'];
    const payloadKey = JSON.stringify({ visible, darkMode: isDarkMode, surfaceColorHex });
    if (lastReaderSystemUIPayload.current === payloadKey) return;
    lastReaderSystemUIPayload.current = payloadKey;
    setSystemUIVisibility({ visible, darkMode: isDarkMode, surfaceColorHex });
    if (visible) {
      showSystemUI();
    } else {
      dismissSystemUI();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hoveredBookKey, isDarkMode, themeColor, settings.alwaysShowStatusBar, systemUIAlwaysHidden]);

  return libraryLoaded && settings.globalReadSettings ? (
    <div
      className={clsx(
        'reader-page bg-base-100 text-base-content full-height select-none overflow-hidden',
        appService?.hasRoundedWindow && isRoundedWindow && 'window-border rounded-window',
      )}
    >
      <ReaderErrorBoundary onBackToLibrary={handleReaderBoundaryBackToLibrary}>
        <Suspense fallback={<div className='full-height'></div>}>
          <ReaderContent
            ids={ids}
            settings={settings}
            libraryReconciliationSettled={libraryReconciliationSettled}
          />
          <AboutWindow />
          <UpdaterWindow />
          <KOSyncSettingsWindow />
          <ProofreadRulesManager />
          <Toast />
        </Suspense>
      </ReaderErrorBoundary>
    </div>
  ) : (
    <div className={clsx('full-height', !appService?.isLinuxApp && 'bg-base-100')}></div>
  );
};

export default Reader;
