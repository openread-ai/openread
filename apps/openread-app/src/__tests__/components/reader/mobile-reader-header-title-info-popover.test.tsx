/* eslint-disable @next/next/no-img-element */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import HeaderBar from '@/app/reader/components/HeaderBar';
import { MOBILE_BOOK_INFO_POPOVER_TOP_OFFSET_CLASS } from '@/app/reader/components/mobile/MobileBookInfoPopover';

const mockState = vi.hoisted(() => {
  const appService = {
    isMobile: true,
    isIOSApp: false,
    isAndroidApp: false,
    hasWindowBar: false,
    hasTrafficLight: false,
    hasRoundedWindow: false,
    hasSafeAreaInset: false,
  };

  const readerStore = {
    bookKeys: ['book-1'],
    hoveredBookKey: 'book-1',
    getView: () => ({ renderer: { getContents: () => [] } }),
    getViewSettings: () => ({
      enableAnnotationQuickActions: false,
      annotationQuickAction: null,
      sortedTOC: false,
    }),
    getProgress: () => ({
      location: 'loc-1',
      sectionId: 1,
      sectionHref: 'chapter-1.xhtml',
      sectionLabel: 'Chapter 1',
      section: { current: 0, total: 10 },
      pageinfo: { current: 4, total: 120 },
      timeinfo: { section: 1, total: 20 },
      range: {} as Range,
    }),
    setHoveredBookKey: vi.fn(),
  };

  const book = {
    title: 'Moby-Dick',
    author: 'Herman Melville',
    format: 'epub',
    coverImageUrl: '/book-cover.jpg',
    progress: [5, 120] as [number, number],
    catalogBookId: 'catalog-1',
    metadata: { coverImageUrl: '/catalog-cover.jpg' },
  };

  const bookDataStore = {
    getBookDataByReaderKey: () => ({
      book,
      bookDoc: { metadata: { coverImageUrl: '/document-cover.jpg' } },
    }),
  };

  return {
    appService,
    readerStore,
    book,
    bookDataStore,
    openMobileReaderPanel: vi.fn(),
    setThemeMode: vi.fn(),
    dispatch: vi.fn(),
    onCloseBook: vi.fn(),
  };
});

vi.mock('next/image', () => ({
  default: ({
    alt = '',
    fill: _fill,
    sizes: _sizes,
    ...props
  }: {
    alt?: string;
    fill?: boolean;
    sizes?: string;
  }) => <img alt={alt} {...props} />,
}));

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (key: string, values?: Record<string, string>) => {
    if (!values) return key;
    return Object.entries(values).reduce(
      (label, [token, value]) => label.replace(`{{${token}}}`, value),
      key,
    );
  },
}));

vi.mock('@/hooks/useResponsiveSize', () => ({
  useResponsiveSize: () => 16,
}));

vi.mock('@/context/EnvContext', () => ({
  useEnv: () => ({ envConfig: {}, appService: mockState.appService }),
}));

vi.mock('@/store/themeStore', () => ({
  useThemeStore: () => ({
    themeMode: 'auto',
    isDarkMode: false,
    systemUIVisible: false,
    statusBarHeight: 0,
    setThemeMode: mockState.setThemeMode,
  }),
}));

vi.mock('@/store/settingsStore', () => ({
  useSettingsStore: () => ({
    settings: {
      aiSettings: { enabled: true },
      globalReadSettings: {
        highlightStyle: 'yellow',
        highlightStyles: { yellow: '#ffee88' },
      },
    },
  }),
}));

vi.mock('@/store/readerStore', () => ({
  useReaderStore: (selector?: (state: typeof mockState.readerStore) => unknown) =>
    selector ? selector(mockState.readerStore) : mockState.readerStore,
}));

vi.mock('@/store/bookDataStore', () => ({
  useBookDataStore: (selector: (state: typeof mockState.bookDataStore) => unknown) =>
    selector(mockState.bookDataStore),
}));

vi.mock('@/store/sidebarStore', () => ({
  useSidebarStore: () => ({ isSideBarVisible: false }),
}));

vi.mock('@/store/notebookStore', () => ({
  useNotebookStore: () => false,
}));

vi.mock('@/store/mobileReaderPanelStore', () => ({
  useMobileReaderPanelStore: () => ({ openMobileReaderPanel: mockState.openMobileReaderPanel }),
}));

vi.mock('@/store/trafficLightStore', () => ({
  useTrafficLightStore: () => ({
    trafficLightInFullscreen: false,
    setTrafficLightVisibility: vi.fn(),
  }),
}));

vi.mock('@/utils/event', () => ({
  eventDispatcher: { dispatch: mockState.dispatch },
}));

vi.mock('@/components/Dropdown', () => ({
  default: ({ label }: { label: string }) => <button type='button'>{label}</button>,
}));

vi.mock('@/components/WindowButtons', () => ({
  default: () => null,
}));

vi.mock('@/app/reader/components/BookmarkToggler', () => ({
  default: () => <button type='button'>Bookmark</button>,
}));

vi.mock('@/app/reader/components/SidebarToggler', () => ({
  default: () => null,
}));

vi.mock('@/app/reader/components/NotebookToggler', () => ({
  default: () => null,
}));

vi.mock('@/app/reader/components/SettingsToggler', () => ({
  default: () => null,
}));

vi.mock('@/app/reader/components/TranslationToggler', () => ({
  default: () => null,
}));

vi.mock('@/app/reader/components/ViewMenu', () => ({
  default: () => null,
}));

vi.mock('@/app/reader/components/annotator/QuickActionMenu', () => ({
  default: () => null,
}));

vi.mock('@/app/reader/components/annotator/AnnotationTools', () => ({
  annotationToolQuickActions: [{ type: 'highlight', Icon: () => null }],
}));

vi.mock('@/components/HighlighterIcon', () => ({
  HighlighterIcon: () => null,
}));

function renderHeader() {
  return render(
    <HeaderBar
      bookKey='book-1'
      bookTitle='Moby-Dick'
      isTopLeft={true}
      isHoveredAnim={false}
      gridInsets={{ top: 0, right: 0, bottom: 0, left: 0 }}
      onCloseBook={mockState.onCloseBook}
    />,
  );
}

describe('mobile web reader header title info popover', () => {
  beforeEach(() => {
    mockState.appService.isMobile = true;
    mockState.appService.isIOSApp = false;
    mockState.appService.isAndroidApp = false;
    mockState.book.coverImageUrl = '/book-cover.jpg';
    mockState.book.catalogBookId = 'catalog-1';
    mockState.book.metadata = { coverImageUrl: '/catalog-cover.jpg' };
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders the mobile-web title as a left-aligned button and opens centered identity-only book info', () => {
    renderHeader();

    const titleButton = screen.getByRole('button', {
      name: 'Show book information for Moby-Dick',
    });
    expect(titleButton.className).toContain('justify-start');
    expect(screen.queryByRole('contentinfo', { name: /Title/ })).toBeNull();

    fireEvent.click(titleButton);

    const popover = screen.getByRole('dialog', { name: 'Moby-Dick book information' });
    expect(popover.className).toContain('fixed');
    expect(popover.className).toContain('left-1/2');
    expect(popover.className).toContain('-translate-x-1/2');
    expect(popover.className).toContain(MOBILE_BOOK_INFO_POPOVER_TOP_OFFSET_CLASS);
    expect(screen.getByText('Herman Melville')).toBeTruthy();
    expect(screen.getByAltText('Moby-Dick').getAttribute('src')).toBe('/catalog-cover.jpg');
    expect(screen.queryByText('Progress')).toBeNull();
    expect(screen.queryByText('Location')).toBeNull();
    expect(screen.queryByText('Format')).toBeNull();
    expect(screen.queryByText('Source')).toBeNull();
    expect(screen.queryByText('Page 5 of 120')).toBeNull();
    expect(screen.queryByText('Chapter 1')).toBeNull();
    expect(screen.queryByText('EPUB')).toBeNull();
    expect(screen.queryByText('Openread Catalog')).toBeNull();
  });

  it('replaces the mobile-web header AI shortcut with a theme toggle', () => {
    renderHeader();

    expect(screen.queryByRole('button', { name: 'AI Chat' })).toBeNull();
    fireEvent.click(screen.getByTestId('mobile-reader-theme-mode-button'));

    expect(screen.getByRole('button', { name: 'Auto Mode' })).toBeTruthy();
    expect(mockState.setThemeMode).toHaveBeenCalledWith('light');
    expect(mockState.openMobileReaderPanel).not.toHaveBeenCalled();
  });

  it('closes the popover with outside tap, Escape, and X button', () => {
    renderHeader();

    fireEvent.click(screen.getByRole('button', { name: 'Show book information for Moby-Dick' }));
    expect(screen.getByTestId('mobile-reader-book-info-popover')).toBeTruthy();

    fireEvent.mouseDown(document.body);
    expect(screen.queryByTestId('mobile-reader-book-info-popover')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Show book information for Moby-Dick' }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByTestId('mobile-reader-book-info-popover')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Show book information for Moby-Dick' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close book information' }));
    expect(screen.queryByTestId('mobile-reader-book-info-popover')).toBeNull();
  });

  it('preserves native mobile title behavior outside mobile web', () => {
    mockState.appService.isIOSApp = true;

    renderHeader();

    expect(
      screen.queryByRole('button', { name: 'Show book information for Moby-Dick' }),
    ).toBeNull();
    expect(screen.getByText('Moby-Dick')).toBeTruthy();
  });
});
