import clsx from 'clsx';
import Image from 'next/image';
import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { BiMoon, BiSun } from 'react-icons/bi';
import { TbSunMoon, TbArrowAutofitWidth, TbColumns1, TbColumns2 } from 'react-icons/tb';
import {
  MdZoomOut,
  MdZoomIn,
  MdCheck,
  MdOutlineHeadphones,
  MdSync,
  MdSyncProblem,
} from 'react-icons/md';
import { PiChatCircleBold, PiTranslateBold, PiInfoBold } from 'react-icons/pi';
import { IoMdExpand } from 'react-icons/io';

import { MAX_ZOOM_LEVEL, MIN_ZOOM_LEVEL, ZOOM_STEP } from '@/services/constants';
import { useEnv } from '@/context/EnvContext';
import { useAuth } from '@/context/AuthContext';
import { useNotebookStore } from '@/store/notebookStore';
import { useThemeStore } from '@/store/themeStore';
import { useReaderStore } from '@/store/readerStore';
import { useBookDataStore } from '@/store/bookDataStore';
import { useLibraryStore } from '@/store/libraryStore';
import { useMobileReaderPanelStore } from '@/store/mobileReaderPanelStore';
import { useParallelViewStore } from '@/store/parallelViewStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useTranslation } from '@/hooks/useTranslation';
import { navigateToLogin } from '@/utils/nav';
import { eventDispatcher } from '@/utils/event';
import { saveViewSettings } from '@/helpers/settings';
import {
  canUsePageSpreadControls,
  canUsePageZoomControls,
  canUseParagraphMode,
  normalizeReaderLayout,
  persistReaderLayout,
  setReaderLayoutMode,
} from '@/app/reader/utils/readerLayoutContract';
import {
  isMobileWebReader,
  type MobileWebKebabDestination,
} from '@/app/reader/utils/mobileReaderPanels';
import { tauriHandleToggleFullScreen } from '@/utils/window';
import { LAUNCH_TTS_ENABLED, LAUNCH_TRANSLATION_ENABLED } from '@/services/launchFeatures';
import { getParallelReadMenuBooks } from '../utils/parallelReadEligibility';
import { parseBookRefFromReaderBookKey } from '@/utils/readerBookKey';
import MenuItem from '@/components/MenuItem';
import Menu from '@/components/Menu';
import { BookMenuItems } from './sidebar/BookMenu';
import useBooksManager from '../hooks/useBooksManager';

interface ViewMenuProps {
  bookKey: string;
  setIsDropdownOpen?: (open: boolean) => void;
}

type ViewMenuGroup = React.ReactNode[];

const MOBILE_READER_MENU_MAX_HEIGHT = 'var(--mobile-reader-menu-max-height, 80dvh)';

const ViewMenuGroupDivider = () => (
  <div
    aria-hidden='true'
    className='bg-base-content/15 pointer-events-none mx-3 my-1 h-px shrink-0 select-none'
    data-testid='mobile-reader-menu-group-divider'
  />
);

const renderViewMenuGroups = (groups: ViewMenuGroup[]) => {
  const nonEmptyGroups = groups
    .map((group) => group.filter(Boolean))
    .filter((group) => group.length > 0);

  return nonEmptyGroups.map((group, index) => (
    <React.Fragment key={index}>
      {index > 0 && <ViewMenuGroupDivider />}
      {group}
    </React.Fragment>
  ));
};

const ViewMenu: React.FC<ViewMenuProps> = ({ bookKey, setIsDropdownOpen }) => {
  const _ = useTranslation();
  const router = useRouter();
  const { user } = useAuth();
  const { envConfig, appService } = useEnv();
  const { getConfig, getBookDataByReaderKey } = useBookDataStore();
  const { getVisibleLibrary } = useLibraryStore();
  const { openMobileReaderPanel } = useMobileReaderPanelStore();
  const { parallelViews, setParallel, unsetParallel } = useParallelViewStore();
  const { setSettingsDialogOpen, setSettingsDialogBookKey } = useSettingsStore();
  const { bookKeys, getView, getViewSettings, getViewState, setViewSettings } = useReaderStore();
  const config = getConfig(bookKey)!;
  const bookData = getBookDataByReaderKey(bookKey)!;
  const viewSettings = getViewSettings(bookKey)!;
  const viewState = getViewState(bookKey);
  const isMobileReader = !!appService?.isMobile;
  const isMobileWeb = isMobileWebReader(appService);
  const { openParallelView } = useBooksManager();

  const readerLayoutBook = {
    isFixedLayout: bookData.isFixedLayout,
    renditionLayout: bookData.bookDoc?.rendition?.layout,
    format: bookData.book?.format,
  };
  const readerLayoutPlatform = { isMobile: isMobileReader };
  const readerLayout = normalizeReaderLayout({
    settings: viewSettings,
    book: readerLayoutBook,
    platform: readerLayoutPlatform,
  });

  const { themeMode, isDarkMode, setThemeMode } = useThemeStore();
  const [zoomLevel, setZoomLevel] = useState(viewSettings!.pageZoomLevel!);
  const [zoomMode, setZoomMode] = useState(viewSettings!.pageZoomMode!);
  const [spreadMode, setSpreadMode] = useState(viewSettings!.pageSpreadMode!);
  const [keepCoverSpread, setKeepCoverSpread] = useState(viewSettings!.keepCoverSpread!);
  const [invertImgColorInDark, setInvertImgColorInDark] = useState(
    viewSettings!.invertImgColorInDark,
  );

  const zoomIn = () => setZoomLevel((prev) => Math.min(prev + ZOOM_STEP, MAX_ZOOM_LEVEL));
  const zoomOut = () => setZoomLevel((prev) => Math.max(prev - ZOOM_STEP, MIN_ZOOM_LEVEL));
  const resetZoom = () => setZoomLevel(100);
  const toggleLayoutMode = async () => {
    const nextMode = readerLayout.layoutMode === 'continuous' ? 'paged' : 'continuous';
    await persistReaderLayout({
      envConfig,
      bookKey,
      current: viewSettings,
      next: setReaderLayoutMode(viewSettings, nextMode),
      book: readerLayoutBook,
      platform: readerLayoutPlatform,
      renderer: getView(bookKey)?.renderer,
      setViewSettings,
      saveViewSettings,
    });
    setIsDropdownOpen?.(false);
  };
  const toggleParagraphMode = () => {
    eventDispatcher.dispatch('toggle-paragraph-mode', { bookKey });
    setIsDropdownOpen?.(false);
  };

  const openFontLayoutMenu = () => {
    setIsDropdownOpen?.(false);
    setSettingsDialogBookKey(bookKey);
    setSettingsDialogOpen(true);
  };

  const cycleThemeMode = () => {
    const modeOrder = { auto: 'light', light: 'dark', dark: 'auto' } as const;
    setThemeMode(modeOrder[themeMode]);
  };

  const handleFullScreen = () => {
    tauriHandleToggleFullScreen();
    setIsDropdownOpen?.(false);
  };

  const handleSync = () => {
    if (!user) {
      navigateToLogin(router);
      setIsDropdownOpen?.(false);
    } else {
      eventDispatcher.dispatch('sync-book-progress', { bookKey });
    }
  };

  useEffect(() => {
    saveViewSettings(envConfig, bookKey, 'pageZoomLevel', zoomLevel, true, true);
    if (bookData.bookDoc?.rendition?.layout === 'pre-paginated') {
      getView(bookKey)?.renderer.setAttribute('scale-factor', zoomLevel);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoomLevel]);

  useEffect(() => {
    if (invertImgColorInDark === viewSettings.invertImgColorInDark) return;
    saveViewSettings(envConfig, bookKey, 'invertImgColorInDark', invertImgColorInDark, true, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invertImgColorInDark]);

  useEffect(() => {
    if (zoomMode === viewSettings.pageZoomMode) return;
    viewSettings.pageZoomMode = zoomMode;
    getView(bookKey)?.renderer.setAttribute('zoom', zoomMode);
    setViewSettings(bookKey, viewSettings);
    saveViewSettings(envConfig, bookKey, 'pageZoomMode', zoomMode, true, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoomMode]);

  useEffect(() => {
    if (spreadMode === viewSettings.pageSpreadMode) return;
    viewSettings.pageSpreadMode = spreadMode;
    getView(bookKey)?.renderer.setAttribute('spread', spreadMode);
    setViewSettings(bookKey, viewSettings);
    saveViewSettings(envConfig, bookKey, 'pageSpreadMode', spreadMode, true, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spreadMode]);

  useEffect(() => {
    if (keepCoverSpread === viewSettings.keepCoverSpread) return;
    if (!bookData?.bookDoc?.sections?.length) return;
    viewSettings.keepCoverSpread = keepCoverSpread;
    const coverSide = bookData.bookDoc.dir === 'rtl' ? 'right' : 'left';
    bookData.bookDoc.sections[0]!.pageSpread = keepCoverSpread ? '' : coverSide;
    getView(bookKey)?.renderer.setAttribute('spread', spreadMode);
    setViewSettings(bookKey, viewSettings);
    saveViewSettings(envConfig, bookKey, 'keepCoverSpread', keepCoverSpread, true, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keepCoverSpread]);

  const lastSyncTime = config?.updatedAt || 0;
  const activeBookId = parseBookRefFromReaderBookKey(bookKey);
  const eligibleParallelBooks = getParallelReadMenuBooks(
    getVisibleLibrary(),
    activeBookId ?? undefined,
  );
  const hasParallelGroup = parallelViews.some((group) => bookKeys.some((key) => group.has(key)));

  const openMobileWebDestination = (destination: MobileWebKebabDestination) => {
    openMobileReaderPanel(bookKey, destination);
    setIsDropdownOpen?.(false);
  };

  const handleParallelRead = () => {
    if (bookKeys.length < 2) return;
    if (hasParallelGroup) {
      unsetParallel(bookKeys);
    } else {
      setParallel(bookKeys);
    }
    setIsDropdownOpen?.(false);
  };

  const handleOpenParallelBook = (id: string) => {
    openParallelView(id, bookKey);
    setIsDropdownOpen?.(false);
  };

  const handleExportAnnotations = () => {
    eventDispatcher.dispatch('export-annotations', { bookKey });
    setIsDropdownOpen?.(false);
  };

  if (isMobileWeb) {
    const parallelReadMenuItem =
      bookKeys.length < 2 && eligibleParallelBooks.length > 0 ? (
        <MenuItem key='parallel-read-books' label={_('Parallel Read')}>
          <ul className='max-h-60 overflow-y-auto'>
            {eligibleParallelBooks.map((book) => (
              <MenuItem
                key={book.hash}
                Icon={
                  book.coverImageUrl ? (
                    <Image
                      src={book.coverImageUrl}
                      alt={book.title}
                      width={56}
                      height={80}
                      className='aspect-auto max-h-8 max-w-4 rounded-sm shadow-md'
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  ) : undefined
                }
                label={book.title}
                labelClass='max-w-36'
                onClick={() => handleOpenParallelBook(book.hash)}
              />
            ))}
          </ul>
        </MenuItem>
      ) : (
        <MenuItem
          key='parallel-read-toggle'
          label={_('Parallel Read')}
          Icon={hasParallelGroup && bookKeys.length > 1 ? MdCheck : undefined}
          onClick={handleParallelRead}
          disabled={bookKeys.length < 2}
        />
      );

    const mobileWebMenuGroups: ViewMenuGroup[] = [
      [
        <MenuItem
          key='toc'
          label={_('Table of Contents')}
          onClick={() => openMobileWebDestination('toc')}
        />,
        <MenuItem
          key='highlights'
          label={_('Highlights')}
          onClick={() => openMobileWebDestination('highlights')}
        />,
        <MenuItem
          key='bookmarks'
          label={_('Bookmarks')}
          onClick={() => openMobileWebDestination('bookmarks')}
        />,
      ],
      [
        <MenuItem
          key='ai-chat-history'
          label={_('AI Chat')}
          Icon={PiChatCircleBold}
          onClick={() => openMobileWebDestination('ai-chat-history')}
        />,
      ],
      [
        <MenuItem
          key='speed-reading'
          label={_('Speed Reading Mode')}
          onClick={() => {
            eventDispatcher.dispatch('rsvp-start', { bookKey });
            setIsDropdownOpen?.(false);
          }}
          disabled={bookData.isFixedLayout}
        />,
        parallelReadMenuItem,
      ],
      [
        <MenuItem
          key='export-annotations'
          label={_('Export Annotations')}
          onClick={handleExportAnnotations}
        />,
      ],
      [
        <MenuItem key='font-layout' label={_('Font & Layout')} onClick={openFontLayoutMenu} />,
        <MenuItem
          key='invert-images-dark-mode'
          label={_('Invert Image In Dark Mode')}
          disabled={!isDarkMode}
          Icon={invertImgColorInDark ? MdCheck : undefined}
          onClick={() => setInvertImgColorInDark(!invertImgColorInDark)}
        />,
      ],
    ];

    return (
      <Menu
        className='view-menu dropdown-content no-triangle dropdown-end bgcolor-base-200 z-20 mt-1 border shadow-2xl'
        style={{ width: '100%', maxWidth: '100%', maxHeight: MOBILE_READER_MENU_MAX_HEIGHT }}
        onCancel={() => setIsDropdownOpen?.(false)}
      >
        {renderViewMenuGroups(mobileWebMenuGroups)}
      </Menu>
    );
  }

  return (
    <Menu
      className={clsx(
        'view-menu dropdown-content no-triangle z-20 mt-1 border',
        isMobileReader ? 'dropdown-end' : 'dropdown-right',
        'bgcolor-base-200 shadow-2xl',
      )}
      style={{
        width: isMobileReader ? 'calc(100vw - 32px)' : undefined,
        maxWidth: isMobileReader ? 'calc(100vw - 32px)' : `${window.innerWidth - 40}px`,
        marginRight: isMobileReader ? '0px' : window.innerWidth < 640 ? '-36px' : '0px',
        right: isMobileReader ? 0 : undefined,
      }}
      onCancel={() => setIsDropdownOpen?.(false)}
    >
      {canUsePageZoomControls(readerLayout) && (
        <>
          <div
            title={_('Zoom Level')}
            className={clsx('flex items-center justify-between rounded-md')}
          >
            <button
              title={_('Zoom Out')}
              onClick={zoomOut}
              className={clsx(
                'hover:bg-base-300 text-base-content rounded-full p-2',
                zoomLevel <= MIN_ZOOM_LEVEL && 'btn-disabled text-gray-400',
              )}
            >
              <MdZoomOut />
            </button>
            <button
              title={_('Reset Zoom')}
              className={clsx(
                'hover:bg-base-300 text-base-content h-8 min-h-8 w-[50%] rounded-md p-1 text-center',
              )}
              onClick={resetZoom}
            >
              {zoomLevel}%
            </button>
            <button
              title={_('Zoom In')}
              onClick={zoomIn}
              className={clsx(
                'hover:bg-base-300 text-base-content rounded-full p-2',
                zoomLevel >= MAX_ZOOM_LEVEL && 'btn-disabled text-gray-400',
              )}
            >
              <MdZoomIn />
            </button>
          </div>

          <>
            <div
              title={_('Zoom Mode')}
              className={clsx('my-2 flex items-center justify-between rounded-md')}
            >
              <button
                title={_('Single Page')}
                onClick={setSpreadMode.bind(null, 'none')}
                className={clsx(
                  'hover:bg-base-300 text-base-content rounded-full p-2',
                  spreadMode === 'none' && 'bg-base-300/75',
                )}
              >
                <TbColumns1 />
              </button>
              <button
                title={_('Auto Spread')}
                onClick={setSpreadMode.bind(null, 'auto')}
                className={clsx(
                  'hover:bg-base-300 text-base-content rounded-full p-2',
                  spreadMode === 'auto' && 'bg-base-300/75',
                )}
              >
                <TbColumns2 />
              </button>
              <div className='bg-base-300 mx-2 h-6 w-[1px]' />
              <button
                title={_('Fit Page')}
                onClick={setZoomMode.bind(null, 'fit-page')}
                className={clsx(
                  'hover:bg-base-300 text-base-content rounded-full p-2',
                  zoomMode === 'fit-page' && 'bg-base-300/75',
                )}
              >
                <IoMdExpand />
              </button>
              <button
                title={_('Fit Width')}
                onClick={setZoomMode.bind(null, 'fit-width')}
                className={clsx(
                  'hover:bg-base-300 text-base-content rounded-full p-2',
                  zoomMode === 'fit-width' && 'bg-base-300/75',
                )}
              >
                <TbArrowAutofitWidth />
              </button>
            </div>

            {canUsePageSpreadControls(readerLayout) && (
              <MenuItem
                label={_('Separate Cover Page')}
                Icon={keepCoverSpread ? MdCheck : undefined}
                onClick={() => setKeepCoverSpread(!keepCoverSpread)}
                disabled={spreadMode === 'none'}
              />
            )}
          </>
          <hr aria-hidden='true' className='border-base-300 my-1' />
        </>
      )}

      {!isMobileReader && (
        <MenuItem label={_('Font & Layout')} shortcut='Shift+F' onClick={openFontLayoutMenu} />
      )}

      {!isMobileReader && (
        <>
          <MenuItem
            label={_('Continuous')}
            shortcut='Shift+J'
            Icon={readerLayout.layoutMode === 'continuous' ? MdCheck : undefined}
            onClick={toggleLayoutMode}
          />

          <MenuItem
            label={_('Paragraph Mode')}
            shortcut='Shift+P'
            Icon={readerLayout.paragraphModeEnabled ? MdCheck : undefined}
            onClick={toggleParagraphMode}
            disabled={!canUseParagraphMode(readerLayout)}
          />
        </>
      )}

      <hr aria-hidden='true' className='border-base-300 my-1' />

      <MenuItem
        label={_('Speed Reading Mode')}
        onClick={() => {
          eventDispatcher.dispatch('rsvp-start', { bookKey });
          setIsDropdownOpen?.(false);
        }}
        disabled={bookData.isFixedLayout}
      />

      {appService?.isIOSApp && (LAUNCH_TTS_ENABLED || LAUNCH_TRANSLATION_ENABLED) && (
        <>
          {/* Launch holdback: iOS reader TTS/translation actions stay hidden until post-launch. */}
          {LAUNCH_TTS_ENABLED && (
            <MenuItem
              label={_('Read Aloud')}
              Icon={MdOutlineHeadphones}
              onClick={() => {
                eventDispatcher.dispatch(viewState?.ttsEnabled ? 'tts-stop' : 'tts-speak', {
                  bookKey,
                });
                setIsDropdownOpen?.(false);
              }}
            />
          )}
          {LAUNCH_TRANSLATION_ENABLED && (
            <MenuItem
              label={_('Translation')}
              Icon={PiTranslateBold}
              onClick={() => {
                const newVal = !viewSettings.translationEnabled;
                saveViewSettings(envConfig, bookKey, 'translationEnabled', newVal, false, true);
                setIsDropdownOpen?.(false);
              }}
            />
          )}
        </>
      )}

      <hr aria-hidden='true' className='border-base-300 my-1' />

      {appService?.isIOSApp && (
        <>
          <MenuItem
            label={_('AI Chat')}
            Icon={PiChatCircleBold}
            onClick={() => {
              const { isNotebookVisible, setNotebookVisible, setNotebookActiveTab } =
                useNotebookStore.getState();
              const notebookOnAI = useNotebookStore.getState().notebookActiveTab === 'ai';
              if (isNotebookVisible && notebookOnAI) {
                setNotebookVisible(false);
              } else {
                setNotebookVisible(true);
                setNotebookActiveTab('ai');
              }
              setIsDropdownOpen?.(false);
            }}
          />
          <hr aria-hidden='true' className='border-base-300 my-1' />
          <MenuItem
            label={_('Book Info')}
            Icon={PiInfoBold}
            onClick={() => {
              eventDispatcher.dispatch('show-book-details', { bookKey });
              setIsDropdownOpen?.(false);
            }}
          />
        </>
      )}

      <hr aria-hidden='true' className='border-base-300 my-1' />

      {appService?.isMobile && (
        <>
          <BookMenuItems bookKey={bookKey} setIsDropdownOpen={setIsDropdownOpen} />
          <hr aria-hidden='true' className='border-base-300 my-1' />
        </>
      )}

      <MenuItem
        label={
          !user
            ? _('Sign in to Sync')
            : lastSyncTime
              ? _('Synced at {{time}}', {
                  time: new Date(lastSyncTime).toLocaleString(),
                })
              : _('Never synced')
        }
        Icon={user ? MdSync : MdSyncProblem}
        iconClassName={user && viewState?.syncing ? 'animate-reverse-spin' : ''}
        onClick={handleSync}
      />

      <hr aria-hidden='true' className='border-base-300 my-1' />

      {appService?.hasWindow && <MenuItem label={_('Fullscreen')} onClick={handleFullScreen} />}
      <MenuItem
        label={{ dark: _('Dark Mode'), light: _('Light Mode'), auto: _('Auto Mode') }[themeMode]}
        Icon={{ dark: BiMoon, light: BiSun, auto: TbSunMoon }[themeMode]}
        onClick={cycleThemeMode}
      />
      <MenuItem
        label={_('Invert Image In Dark Mode')}
        disabled={!isDarkMode}
        Icon={invertImgColorInDark ? MdCheck : undefined}
        onClick={() => setInvertImgColorInDark(!invertImgColorInDark)}
      />
    </Menu>
  );
};

export default ViewMenu;
