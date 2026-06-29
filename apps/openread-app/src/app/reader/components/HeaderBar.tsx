import clsx from 'clsx';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  PiDotsThreeVerticalBold,
  PiCaretLeftBold,
  PiChatCircleBold,
  PiMagnifyingGlassBold,
} from 'react-icons/pi';
import { RxSlider } from 'react-icons/rx';

import { Insets } from '@/types/misc';
import type { BookProgress } from '@/types/book';
import { useEnv } from '@/context/EnvContext';
import { useThemeStore } from '@/store/themeStore';
import { useReaderStore } from '@/store/readerStore';
import { useNotebookStore } from '@/store/notebookStore';
import { useSidebarStore } from '@/store/sidebarStore';
import { useMobileReaderPanelStore } from '@/store/mobileReaderPanelStore';
import { useBookDataStore } from '@/store/bookDataStore';
import { useTranslation } from '@/hooks/useTranslation';
import { useSettingsStore } from '@/store/settingsStore';
import { useTrafficLightStore } from '@/store/trafficLightStore';
import { useResponsiveSize } from '@/hooks/useResponsiveSize';
import { getHighlightColorHex } from '../utils/annotatorUtil';
import { annotationToolQuickActions } from './annotator/AnnotationTools';
import { AnnotationToolType } from '@/types/annotator';
import { eventDispatcher } from '@/utils/event';
import { saveViewSettings } from '@/helpers/settings';
import { HighlighterIcon } from '@/components/HighlighterIcon';
import Dropdown from '@/components/Dropdown';
import WindowButtons from '@/components/WindowButtons';
import QuickActionMenu from './annotator/QuickActionMenu';
import SidebarToggler from './SidebarToggler';
import BookmarkToggler from './BookmarkToggler';
import NotebookToggler from './NotebookToggler';
import SettingsToggler from './SettingsToggler';
import TranslationToggler from './TranslationToggler';
import ViewMenu from './ViewMenu';
import { LAUNCH_TRANSLATION_ENABLED } from '@/services/launchFeatures';
import { isMobileWebReader } from '../utils/mobileReaderPanels';
import MobileBookInfoPopover, { MobileBookInfoPopoverData } from './mobile/MobileBookInfoPopover';

interface HeaderBarProps {
  bookKey: string;
  bookTitle: string;
  isTopLeft: boolean;
  isHoveredAnim: boolean;
  gridInsets: Insets;
  onCloseBook: (bookKey: string) => void;
  onToggleProgress?: () => void;
}

const formatReaderProgressLabel = (
  _: ReturnType<typeof useTranslation>,
  liveProgress: BookProgress | null,
  savedProgress?: [number, number],
) => {
  const pageInfo = liveProgress?.pageinfo;
  if (pageInfo && pageInfo.total > 0) {
    return _('Page {{current}} of {{total}}', {
      current: String(pageInfo.current + 1),
      total: String(pageInfo.total),
    });
  }

  if (savedProgress && savedProgress[1] > 0) {
    return _('Page {{current}} of {{total}}', {
      current: String(savedProgress[0]),
      total: String(savedProgress[1]),
    });
  }

  return null;
};

const getBookSourceLabel = (
  _: ReturnType<typeof useTranslation>,
  book?: { catalogBookId?: string | null; storagePath?: string | null; url?: string },
) => {
  if (!book) return null;
  if (book.catalogBookId) return _('Openread Catalog');
  if (book.storagePath) return _('Cloud Library');
  if (book.url) return _('Remote File');
  return null;
};

const HeaderBar: React.FC<HeaderBarProps> = ({
  bookKey,
  bookTitle,
  isTopLeft,
  isHoveredAnim,
  gridInsets,
  onCloseBook,
  onToggleProgress,
}) => {
  const _ = useTranslation();
  const { envConfig, appService } = useEnv();
  const { settings } = useSettingsStore();
  const { trafficLightInFullscreen, setTrafficLightVisibility } = useTrafficLightStore();
  const { bookKeys, hoveredBookKey } = useReaderStore();
  const { isDarkMode, systemUIVisible, statusBarHeight } = useThemeStore();
  const { isSideBarVisible } = useSidebarStore();
  const isNotebookVisible = useNotebookStore((s) => s.isNotebookVisible);
  const notebookOnAI = useNotebookStore((s) => s.notebookActiveTab === 'ai');
  const { getView, getViewSettings, setHoveredBookKey } = useReaderStore();
  const progress = useReaderStore((state) => state.getProgress(bookKey));
  const bookData = useBookDataStore((state) => state.getBookDataByReaderKey(bookKey));
  const { openMobileReaderPanel } = useMobileReaderPanelStore();
  const viewSettings = getViewSettings(bookKey);

  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [bookInfoOpen, setBookInfoOpen] = useState(false);
  const view = getView(bookKey);
  const iconSize16 = useResponsiveSize(16);
  const headerRef = useRef<HTMLDivElement>(null);
  // On macOS, native traffic lights handle minimize/maximize/close — no HTML buttons needed.
  // On Windows/Linux, show HTML buttons since there are no native decorations.
  const windowButtonVisible = appService?.hasWindowBar && !appService?.hasTrafficLight;
  const useMobileWebHeader = isMobileWebReader(appService);
  const aiEnabled = settings?.aiSettings?.enabled ?? true;
  const showHeaderViewMenu = !useMobileWebHeader || !aiEnabled;
  const bookInfoData = useMemo<MobileBookInfoPopoverData>(() => {
    const book = bookData?.book;
    const metadataCover = bookData?.bookDoc?.metadata?.coverImageUrl;

    return {
      title: bookTitle || book?.title || _('Untitled Book'),
      author: book?.author,
      coverImageUrl: book?.coverImageUrl ?? metadataCover ?? null,
      progressLabel: formatReaderProgressLabel(_, progress, book?.progress),
      locationLabel: progress?.sectionLabel || progress?.sectionHref || null,
      formatLabel: book?.format ? book.format.toUpperCase() : null,
      sourceLabel: getBookSourceLabel(_, book ?? undefined),
    };
  }, [_, bookData, bookTitle, progress]);

  const docs = view?.renderer.getContents() ?? [];
  const pointerInDoc = docs.some(({ doc }) => doc?.body?.style.cursor === 'pointer');

  const enableAnnotationQuickActions = viewSettings?.enableAnnotationQuickActions;
  const annotationQuickActionButton =
    annotationToolQuickActions.find(
      (button) => button.type === viewSettings?.annotationQuickAction,
    ) || annotationToolQuickActions[0]!;
  const annotationQuickAction = viewSettings?.annotationQuickAction;
  const AnnotationToolQuickActionIcon = annotationQuickActionButton.Icon;
  const highlightStyle = settings.globalReadSettings.highlightStyle;
  const highlightColor = settings.globalReadSettings.highlightStyles[highlightStyle];
  const highlightHexColor = getHighlightColorHex(settings, highlightColor);

  const handleToggleDropdown = (isOpen: boolean) => {
    setIsDropdownOpen(isOpen);
    if (!isOpen) setHoveredBookKey(null);
  };

  const handleAnnotationQuickActionSelect = (action: AnnotationToolType | null) => {
    if (viewSettings?.annotationQuickAction === action) action = null;
    saveViewSettings(envConfig, bookKey, 'annotationQuickAction', action, false, true);
  };

  useEffect(() => {
    setBookInfoOpen(false);
  }, [bookKey, useMobileWebHeader]);

  useEffect(() => {
    if (!appService?.hasTrafficLight) return;
    if (isSideBarVisible) return;
    if (!isTopLeft) return;

    // Always keep native traffic lights visible in the reader on macOS
    setTrafficLightVisibility(true, { x: 10, y: 20 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appService, isSideBarVisible, isTopLeft]);

  // Check if mouse is outside header area to avoid false positive event of MouseLeave when clicking inside header on Windows
  const isMouseOutsideHeader = useCallback((clientX: number, clientY: number) => {
    if (!headerRef.current) return true;

    const rect = headerRef.current.getBoundingClientRect();
    return (
      clientX <= rect.left || clientX >= rect.right || clientY <= rect.top || clientY >= rect.bottom
    );
  }, []);

  const isHeaderVisible = hoveredBookKey === bookKey || isDropdownOpen;
  const trafficLightInHeader =
    appService?.hasTrafficLight && !trafficLightInFullscreen && !isSideBarVisible && isTopLeft;

  return (
    <div
      className={clsx('bg-base-100 absolute top-0 z-40 w-full')}
      style={{
        paddingTop: appService?.hasSafeAreaInset ? `${gridInsets.top}px` : '0px',
      }}
    >
      <div
        role='none'
        className={clsx(
          'absolute top-0 z-10 h-11 w-full',
          (pointerInDoc || appService?.isMobile) && 'pointer-events-none',
        )}
        onClick={() => setHoveredBookKey(bookKey)}
        onMouseEnter={() => !appService?.isMobile && setHoveredBookKey(bookKey)}
        onTouchStart={() => !appService?.isMobile && setHoveredBookKey(bookKey)}
      />
      <div
        className={clsx(
          'bg-base-100 absolute left-0 right-0 top-0 z-10',
          appService?.hasRoundedWindow && 'rounded-window-top-right',
          isHeaderVisible ? 'visible' : 'hidden',
        )}
        style={{
          height: systemUIVisible ? `${Math.max(gridInsets.top, statusBarHeight)}px` : '0px',
        }}
      />
      <div
        ref={headerRef}
        role='group'
        aria-label={_('Header Bar')}
        className={clsx(
          `header-bar bg-base-100 absolute top-0 z-30 flex h-11 w-full items-center pr-4`,
          `shadow-xs transition-[opacity,margin-top] duration-300`,
          trafficLightInHeader ? 'pl-20' : 'pl-4',
          appService?.hasRoundedWindow && 'rounded-window-top-right',
          !isSideBarVisible && appService?.hasRoundedWindow && 'rounded-window-top-left',
          isHoveredAnim && 'hover-bar-anim',
          isHeaderVisible
            ? 'pointer-events-auto visible opacity-100'
            : 'pointer-events-none invisible opacity-0',
          isDropdownOpen && 'header-bar-pinned',
        )}
        style={{
          marginTop: systemUIVisible
            ? `${Math.max(gridInsets.top, statusBarHeight)}px`
            : `${gridInsets.top}px`,
        }}
        onFocus={() => !appService?.isMobile && setHoveredBookKey(bookKey)}
        onMouseLeave={(e) => {
          if (!appService?.isMobile && isMouseOutsideHeader(e.clientX, e.clientY)) {
            setHoveredBookKey(null);
          }
        }}
      >
        {appService?.isMobile ? (
          <>
            <div className='bg-base-100 z-20 flex h-full min-w-0 flex-1 items-center gap-x-2'>
              <button
                className='btn btn-ghost h-8 min-h-8 w-8 flex-shrink-0 p-0'
                onClick={() => {
                  setHoveredBookKey(null);
                  onCloseBook(bookKey);
                }}
                aria-label={_('Back to Library')}
              >
                <PiCaretLeftBold size={iconSize16} />
              </button>
              {useMobileWebHeader ? (
                <div className='relative min-w-0 flex-1'>
                  <button
                    type='button'
                    className={clsx(
                      'btn btn-ghost h-8 min-h-8 w-full min-w-0 justify-start px-2 text-left normal-case',
                      bookInfoOpen && 'bg-base-200/80',
                    )}
                    onClick={() => setBookInfoOpen(true)}
                    aria-label={_('Show book information for {{title}}', {
                      title: bookInfoData.title,
                    })}
                    aria-expanded={bookInfoOpen}
                    aria-haspopup='dialog'
                  >
                    <span className='line-clamp-1 min-w-0 max-w-full text-sm font-semibold'>
                      {bookInfoData.title}
                    </span>
                  </button>
                  {bookInfoOpen && (
                    <MobileBookInfoPopover
                      data={bookInfoData}
                      onClose={() => setBookInfoOpen(false)}
                    />
                  )}
                </div>
              ) : (
                <span className='line-clamp-1 max-w-[40vw] text-xs font-semibold'>{bookTitle}</span>
              )}
            </div>
            <div className='bg-base-100 z-20 ms-auto flex h-full flex-shrink-0 items-center gap-x-3'>
              <button
                className='btn btn-ghost h-8 min-h-8 w-8 p-0'
                onClick={() => {
                  eventDispatcher.dispatch('search-term', { bookKey });
                }}
                aria-label={_('Search')}
              >
                <PiMagnifyingGlassBold size={iconSize16} />
              </button>
              {appService?.isIOSApp && (
                <button
                  className='btn btn-ghost h-8 min-h-8 w-8 p-0'
                  onClick={onToggleProgress}
                  aria-label={_('Reading Progress')}
                >
                  <RxSlider size={iconSize16} />
                </button>
              )}
              <BookmarkToggler bookKey={bookKey} />
              {!appService?.isIOSApp && (
                <button
                  className={clsx(
                    'btn btn-ghost h-8 min-h-8 w-8 p-0',
                    isNotebookVisible && notebookOnAI && 'bg-base-300/50',
                  )}
                  onClick={() => {
                    if (useMobileWebHeader) {
                      openMobileReaderPanel(bookKey, 'ai-chat-history');
                      setHoveredBookKey(bookKey);
                      return;
                    }

                    const { setNotebookVisible, setNotebookActiveTab } =
                      useNotebookStore.getState();
                    if (isNotebookVisible && notebookOnAI) {
                      setNotebookVisible(false);
                    } else {
                      setNotebookVisible(true);
                      setNotebookActiveTab('ai');
                    }
                  }}
                  aria-label={_('AI Chat')}
                >
                  <PiChatCircleBold size={iconSize16} />
                </button>
              )}
              {showHeaderViewMenu && (
                <Dropdown
                  label={_('More Options')}
                  className='exclude-title-bar-mousedown dropdown-bottom dropdown-end'
                  buttonClassName='btn btn-ghost h-8 min-h-8 w-8 p-0'
                  toggleButton={<PiDotsThreeVerticalBold size={iconSize16} />}
                  onToggle={handleToggleDropdown}
                >
                  <ViewMenu bookKey={bookKey} />
                </Dropdown>
              )}
            </div>
          </>
        ) : (
          <>
            <div className='header-tools-start bg-base-100 sidebar-bookmark-toggler z-20 flex h-full items-center gap-x-4 pe-2 max-[350px]:gap-x-2'>
              <div className='hidden sm:flex'>
                <SidebarToggler bookKey={bookKey} />
              </div>
              <BookmarkToggler bookKey={bookKey} />
              {/* Launch holdback: translation toggle remains available in code but hidden. */}
              {LAUNCH_TRANSLATION_ENABLED && <TranslationToggler bookKey={bookKey} />}
              {enableAnnotationQuickActions && (
                <Dropdown
                  label={
                    annotationQuickAction
                      ? _('Disable Quick Action')
                      : _('Enable Quick Action on Selection')
                  }
                  className='exclude-title-bar-mousedown dropdown-bottom'
                  menuClassName='dropdown-center'
                  buttonClassName={clsx(
                    'btn btn-ghost h-8 min-h-8 w-8 p-0',
                    viewSettings?.annotationQuickAction && 'bg-base-300/50',
                  )}
                  toggleButton={
                    annotationQuickAction === 'highlight' || annotationQuickAction === null ? (
                      <HighlighterIcon
                        size={iconSize16}
                        tipColor={annotationQuickAction === null ? '#8F8F8F' : highlightHexColor}
                        tipStyle={{
                          opacity: annotationQuickAction === null ? 0.5 : 0.8,
                          mixBlendMode: isDarkMode ? 'screen' : 'multiply',
                        }}
                      />
                    ) : (
                      <AnnotationToolQuickActionIcon size={iconSize16} />
                    )
                  }
                  onToggle={handleToggleDropdown}
                >
                  <QuickActionMenu
                    selectedAction={viewSettings.annotationQuickAction}
                    onActionSelect={handleAnnotationQuickActionSelect}
                  />
                </Dropdown>
              )}
            </div>

            <div
              role='contentinfo'
              aria-label={_('Title') + ' - ' + bookTitle}
              className={clsx(
                'header-title z-15 bg-base-100 pointer-events-none hidden flex-1 items-center justify-center sm:flex',
                !windowButtonVisible && 'absolute inset-0',
              )}
            >
              <div
                aria-hidden='true'
                className={clsx(
                  'line-clamp-1 text-center text-xs font-semibold',
                  !windowButtonVisible && 'max-w-[50%]',
                )}
              >
                {bookTitle}
              </div>
            </div>

            <div className='header-tools-end bg-base-100 z-20 ms-auto flex h-full items-center gap-x-4 ps-2 max-[350px]:gap-x-2'>
              <SettingsToggler bookKey={bookKey} />
              <NotebookToggler bookKey={bookKey} />
              <Dropdown
                label={_('View Options')}
                className='exclude-title-bar-mousedown dropdown-bottom dropdown-end'
                buttonClassName='btn btn-ghost h-8 min-h-8 w-8 p-0'
                toggleButton={<PiDotsThreeVerticalBold size={iconSize16} />}
                onToggle={handleToggleDropdown}
              >
                <ViewMenu bookKey={bookKey} />
              </Dropdown>

              <WindowButtons
                className='window-buttons flex h-full items-center'
                headerRef={headerRef}
                showMinimize={bookKeys.length == 1 && windowButtonVisible}
                showMaximize={bookKeys.length == 1 && windowButtonVisible}
                onClose={() => {
                  setHoveredBookKey(null);
                  onCloseBook(bookKey);
                }}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default HeaderBar;
