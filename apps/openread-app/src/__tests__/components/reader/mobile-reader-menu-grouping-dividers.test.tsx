import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

import ViewMenu from '@/app/reader/components/ViewMenu';

const mockState = vi.hoisted(() => {
  const viewSettings = {
    pageZoomLevel: 100,
    pageZoomMode: 'fit-width',
    pageSpreadMode: 'none',
    keepCoverSpread: true,
    invertImgColorInDark: false,
    sortedTOC: false,
    layoutMode: 'continuous',
    paragraphModeEnabled: false,
  };
  const bookDoc = {
    rendition: { layout: 'reflowable' },
    toc: [
      { id: 2, label: 'Second' },
      { id: 1, label: 'First' },
    ],
    sections: [{ pageSpread: '' }],
    dir: 'ltr',
  };

  return {
    user: { id: 'user-1' },
    config: { updatedAt: Date.UTC(2026, 5, 28, 21, 10, 22), viewSettings },
    bookDoc,
    viewSettings,
    openMobileReaderPanel: vi.fn(),
    setParallel: vi.fn(),
    unsetParallel: vi.fn(),
    setSettingsDialogOpen: vi.fn(),
    setSettingsDialogBookKey: vi.fn(),
    setViewSettings: vi.fn(),
    setThemeMode: vi.fn(),
    resetThemeDefaults: vi.fn(),
    saveConfig: vi.fn(),
    saveViewSettings: vi.fn(),
    renderer: null as null | {
      setAttribute: ReturnType<typeof vi.fn>;
      setStyles: ReturnType<typeof vi.fn>;
    },
    restoreCurrentBookViewSettings: vi.fn(
      async (options: { renderer?: { setStyles?: (css: string) => void } }) => {
        options.renderer?.setStyles?.('restored-reader-styles');
        return viewSettings;
      },
    ),
    dispatch: vi.fn(),
    navigateToLogin: vi.fn(),
    setIsDropdownOpen: vi.fn(),
    appService: {
      isMobile: true,
      isIOSApp: false,
      isAndroidApp: false,
      appPlatform: 'web',
      hasWindow: false,
      getDefaultViewSettings: vi.fn(() => ({ defaultFontSize: 16 })),
    },
  };
});

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (key: string, values?: Record<string, string>) =>
    values?.time ? key.replace('{{time}}', values.time) : key,
}));

vi.mock('@/hooks/useResponsiveSize', () => ({
  useResponsiveSize: () => 16,
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: mockState.user }),
}));

vi.mock('@/context/EnvContext', () => ({
  useEnv: () => ({
    envConfig: {},
    appService: mockState.appService,
  }),
}));

vi.mock('@/store/bookDataStore', () => ({
  useBookDataStore: () => ({
    getConfig: () => mockState.config,
    getBookDataByReaderKey: () => ({
      isFixedLayout: false,
      bookDoc: mockState.bookDoc,
      book: { format: 'epub' },
    }),
    saveConfig: mockState.saveConfig,
  }),
}));

vi.mock('@/store/libraryStore', () => ({
  useLibraryStore: () => ({ getVisibleLibrary: () => [] }),
}));

vi.mock('@/store/mobileReaderPanelStore', () => ({
  useMobileReaderPanelStore: () => ({ openMobileReaderPanel: mockState.openMobileReaderPanel }),
}));

vi.mock('@/store/parallelViewStore', () => ({
  useParallelViewStore: () => ({
    parallelViews: [],
    setParallel: mockState.setParallel,
    unsetParallel: mockState.unsetParallel,
  }),
}));

vi.mock('@/store/settingsStore', () => ({
  useSettingsStore: () => ({
    settings: { globalViewSettings: mockState.viewSettings },
    setSettingsDialogOpen: mockState.setSettingsDialogOpen,
    setSettingsDialogBookKey: mockState.setSettingsDialogBookKey,
  }),
}));

vi.mock('@/store/readerStore', () => ({
  useReaderStore: () => ({
    bookKeys: ['book-1', 'book-2'],
    getView: () => ({ renderer: mockState.renderer }),
    getViewSettings: () => mockState.viewSettings,
    getViewState: () => ({ syncing: false }),
    setViewSettings: mockState.setViewSettings,
  }),
}));

vi.mock('@/store/themeStore', () => ({
  useThemeStore: () => ({
    themeMode: 'dark',
    isDarkMode: true,
    setThemeMode: mockState.setThemeMode,
    resetThemeDefaults: mockState.resetThemeDefaults,
  }),
}));

vi.mock('@/helpers/settings', () => ({
  saveViewSettings: mockState.saveViewSettings,
}));

vi.mock('@/app/reader/utils/restoreCurrentBookViewSettings', () => ({
  restoreCurrentBookViewSettings: mockState.restoreCurrentBookViewSettings,
}));

vi.mock('@/utils/nav', () => ({
  navigateToLogin: mockState.navigateToLogin,
}));

vi.mock('@/utils/event', () => ({
  eventDispatcher: { dispatch: mockState.dispatch },
}));

vi.mock('@/utils/window', () => ({
  tauriHandleToggleFullScreen: vi.fn(),
}));

vi.mock('@/app/reader/utils/parallelReadEligibility', () => ({
  getParallelReadMenuBooks: () => [],
}));

vi.mock('@/utils/toc', () => ({
  sortTocItems: vi.fn(),
}));

vi.mock('@/app/reader/hooks/useBooksManager', () => ({
  default: () => ({ openParallelView: vi.fn() }),
}));

function renderMobileWebMenu() {
  mockState.appService = {
    isMobile: true,
    isIOSApp: false,
    isAndroidApp: false,
    appPlatform: 'web',
    hasWindow: false,
    getDefaultViewSettings: vi.fn(() => ({ defaultFontSize: 16 })),
  };
  return render(<ViewMenu bookKey='book-1' setIsDropdownOpen={mockState.setIsDropdownOpen} />);
}

function renderDesktopMenu() {
  mockState.appService = {
    isMobile: false,
    isIOSApp: false,
    isAndroidApp: false,
    appPlatform: 'web',
    hasWindow: false,
    getDefaultViewSettings: vi.fn(() => ({ defaultFontSize: 16 })),
  };
  return render(<ViewMenu bookKey='book-1' setIsDropdownOpen={mockState.setIsDropdownOpen} />);
}

function menuSequence(container: HTMLElement) {
  const menu = container.querySelector('.view-menu');
  if (!menu) throw new Error('ViewMenu was not rendered');

  return Array.from(menu.children).map((child) => {
    if ((child as HTMLElement).dataset.testid === 'mobile-reader-menu-group-divider') {
      return 'divider';
    }
    return child.querySelector('.mx-2')?.textContent?.trim().replace(/\s+/g, ' ') ?? '';
  });
}

describe('mobile web reader menu grouping dividers', () => {
  beforeEach(() => {
    mockState.user = { id: 'user-1' };
    mockState.viewSettings.sortedTOC = false;
    mockState.viewSettings.invertImgColorInDark = false;
    mockState.appService = {
      isMobile: true,
      isIOSApp: false,
      isAndroidApp: false,
      appPlatform: 'web',
      hasWindow: false,
      getDefaultViewSettings: vi.fn(() => ({ defaultFontSize: 16 })),
    };
    mockState.renderer = {
      setAttribute: vi.fn(),
      setStyles: vi.fn(),
    };
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders logical groups in the required order with subtle non-interactive dividers and no labels', () => {
    const { container } = renderMobileWebMenu();

    expect(menuSequence(container)).toEqual([
      'Table of Contents',
      'Highlights',
      'Bookmarks',
      'divider',
      'AI Chat',
      'divider',
      'Speed Reading Mode',
      'Parallel Read',
      'divider',
      'Export Annotations',
      'divider',
      'Font & Layout',
      'Restore Reader & Theme Defaults',
      'Invert Image In Dark Mode',
    ]);

    expect(screen.getAllByTestId('mobile-reader-menu-group-divider')).toHaveLength(4);
    screen.getAllByTestId('mobile-reader-menu-group-divider').forEach((divider) => {
      expect(divider.getAttribute('aria-hidden')).toBe('true');
      expect(divider.getAttribute('role')).toBeNull();
      expect(divider.className).toContain('bg-base-content/15');
    });

    const menu = container.querySelector('.view-menu') as HTMLElement;
    expect(menu.style.maxHeight).toBe('var(--mobile-reader-menu-max-height, 80dvh)');
    expect(menu.className).toContain('overflow-y-auto');

    expect(screen.queryByText('Navigation destinations')).toBeNull();
    expect(screen.queryByText('Reading tools')).toBeNull();
    expect(screen.queryByText('Display settings')).toBeNull();
    expect(screen.queryByText('Sort TOC by Page')).toBeNull();
    expect(screen.queryByText('Reload Page')).toBeNull();
    expect(screen.queryByText('AI Chat History')).toBeNull();
    expect(screen.queryByText('Dark Mode')).toBeNull();
    expect(screen.queryByText('Light Mode')).toBeNull();
    expect(screen.queryByText('Auto Mode')).toBeNull();
    expect(screen.queryByText(/^Synced at /)).toBeNull();
    expect(screen.queryByText('Never synced')).toBeNull();
    expect(screen.queryByText('Sign in to Sync')).toBeNull();
  });

  it('preserves representative menu actions and toggles', async () => {
    renderMobileWebMenu();

    fireEvent.click(screen.getByText('Table of Contents'));
    expect(mockState.openMobileReaderPanel).toHaveBeenCalledWith('book-1', 'toc');
    expect(mockState.setIsDropdownOpen).toHaveBeenCalledWith(false);

    fireEvent.click(screen.getByText('AI Chat'));
    expect(mockState.openMobileReaderPanel).toHaveBeenCalledWith('book-1', 'ai-chat-history');

    fireEvent.click(screen.getByText('Speed Reading Mode'));
    expect(mockState.dispatch).toHaveBeenCalledWith('rsvp-start', { bookKey: 'book-1' });

    fireEvent.click(screen.getByText('Parallel Read'));
    expect(mockState.setParallel).toHaveBeenCalledWith(['book-1', 'book-2']);

    fireEvent.click(screen.getByText('Export Annotations'));
    expect(mockState.dispatch).toHaveBeenCalledWith('export-annotations', { bookKey: 'book-1' });
    expect(mockState.setViewSettings).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText('Font & Layout'));
    expect(mockState.setIsDropdownOpen).toHaveBeenCalledWith(false);
    expect(mockState.setSettingsDialogBookKey).toHaveBeenCalledWith('book-1');
    expect(mockState.setSettingsDialogOpen).toHaveBeenCalledWith(true, {
      scope: 'appearance',
      initialPanel: 'Font',
    });

    expect(screen.queryByText('Dark Mode')).toBeNull();
    expect(screen.getAllByText('Restore Reader & Theme Defaults')).toHaveLength(1);
    expect(
      screen.getByText('Resets this book’s reader settings and the app theme for all books.'),
    ).toBeTruthy();
    expect(mockState.setThemeMode).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText('Restore Reader & Theme Defaults'));
    await waitFor(() => expect(mockState.restoreCurrentBookViewSettings).toHaveBeenCalledOnce());
    const renderer = mockState.renderer!;
    await waitFor(() => expect(renderer.setStyles).toHaveBeenCalledOnce());
    expect(mockState.resetThemeDefaults).toHaveBeenCalledOnce();
    expect(mockState.restoreCurrentBookViewSettings.mock.invocationCallOrder[0]).toBeLessThan(
      mockState.resetThemeDefaults.mock.invocationCallOrder[0],
    );
    expect(renderer.setStyles).toHaveBeenCalledWith('restored-reader-styles');
    expect(mockState.restoreCurrentBookViewSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        bookKey: 'book-1',
        config: mockState.config,
        settings: { globalViewSettings: mockState.viewSettings },
        currentViewSettings: mockState.viewSettings,
        renderer,
        setViewSettings: mockState.setViewSettings,
        saveConfig: mockState.saveConfig,
      }),
    );
    expect(mockState.dispatch).toHaveBeenCalledWith('toast', {
      type: 'success',
      message: 'Reader and theme defaults restored',
    });

    expect(screen.getByText('Invert Image In Dark Mode')).toBeTruthy();
  });

  it('does not show success when the visible reader renderer is unavailable', async () => {
    mockState.renderer = null;
    renderMobileWebMenu();

    fireEvent.click(screen.getByText('Restore Reader & Theme Defaults'));

    await waitFor(() =>
      expect(mockState.dispatch).toHaveBeenCalledWith('toast', {
        type: 'error',
        message: 'Failed to restore reader and theme defaults',
      }),
    );
    expect(mockState.restoreCurrentBookViewSettings).not.toHaveBeenCalled();
    expect(mockState.resetThemeDefaults).not.toHaveBeenCalled();
    expect(mockState.dispatch).not.toHaveBeenCalledWith('toast', {
      type: 'success',
      message: 'Reader and theme defaults restored',
    });
  });

  it('does not show success when the global theme reset fails', async () => {
    mockState.resetThemeDefaults.mockImplementationOnce(() => {
      throw new Error('theme reset failed');
    });
    renderMobileWebMenu();

    fireEvent.click(screen.getByText('Restore Reader & Theme Defaults'));

    await waitFor(() =>
      expect(mockState.dispatch).toHaveBeenCalledWith('toast', {
        type: 'error',
        message: 'Failed to restore reader and theme defaults',
      }),
    );
    expect(mockState.restoreCurrentBookViewSettings).toHaveBeenCalledOnce();
    expect(mockState.dispatch).not.toHaveBeenCalledWith('toast', {
      type: 'success',
      message: 'Reader and theme defaults restored',
    });
  });

  it('keeps the desktop Font & Layout entry on the full settings dialog path', () => {
    renderDesktopMenu();

    fireEvent.click(screen.getByText('Font & Layout'));

    expect(mockState.setIsDropdownOpen).toHaveBeenCalledWith(false);
    expect(mockState.setSettingsDialogBookKey).toHaveBeenCalledWith('book-1');
    expect(mockState.setSettingsDialogOpen).toHaveBeenCalledTimes(1);
    expect(mockState.setSettingsDialogOpen).toHaveBeenCalledWith(true);
    expect(screen.queryByText('Restore Reader & Theme Defaults')).toBeNull();
  });
});
