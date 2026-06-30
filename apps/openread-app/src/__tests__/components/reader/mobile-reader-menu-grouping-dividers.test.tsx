import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

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
    config: { updatedAt: Date.UTC(2026, 5, 28, 21, 10, 22) },
    bookDoc,
    viewSettings,
    openMobileReaderPanel: vi.fn(),
    setParallel: vi.fn(),
    unsetParallel: vi.fn(),
    setSettingsDialogOpen: vi.fn(),
    setSettingsDialogBookKey: vi.fn(),
    setViewSettings: vi.fn(),
    setThemeMode: vi.fn(),
    saveViewSettings: vi.fn(),
    dispatch: vi.fn(),
    navigateToLogin: vi.fn(),
    setIsDropdownOpen: vi.fn(),
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
    appService: {
      isMobile: true,
      isIOSApp: false,
      isAndroidApp: false,
      appPlatform: 'web',
      hasWindow: false,
    },
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
    setSettingsDialogOpen: mockState.setSettingsDialogOpen,
    setSettingsDialogBookKey: mockState.setSettingsDialogBookKey,
  }),
}));

vi.mock('@/store/readerStore', () => ({
  useReaderStore: () => ({
    bookKeys: ['book-1', 'book-2'],
    getView: () => ({ renderer: { setAttribute: vi.fn() } }),
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
  }),
}));

vi.mock('@/helpers/settings', () => ({
  saveViewSettings: mockState.saveViewSettings,
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
  return render(<ViewMenu bookKey='book-1' setIsDropdownOpen={mockState.setIsDropdownOpen} />);
}

function menuSequence(container: HTMLElement) {
  const menu = container.querySelector('.view-menu');
  if (!menu) throw new Error('ViewMenu was not rendered');

  return Array.from(menu.children).map((child) => {
    if ((child as HTMLElement).dataset.testid === 'mobile-reader-menu-group-divider') {
      return 'divider';
    }
    return child.textContent?.trim().replace(/\s+/g, ' ') ?? '';
  });
}

describe('mobile web reader menu grouping dividers', () => {
  beforeEach(() => {
    mockState.user = { id: 'user-1' };
    mockState.viewSettings.sortedTOC = false;
    mockState.viewSettings.invertImgColorInDark = false;
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

  it('preserves representative menu actions and toggles', () => {
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
    expect(mockState.setSettingsDialogOpen).toHaveBeenCalledWith(true);

    expect(screen.queryByText('Dark Mode')).toBeNull();
    expect(mockState.setThemeMode).not.toHaveBeenCalled();
    expect(screen.getByText('Invert Image In Dark Mode')).toBeTruthy();
  });
});
