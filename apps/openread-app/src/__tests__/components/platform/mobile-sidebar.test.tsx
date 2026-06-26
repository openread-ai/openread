import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MobileSidebar } from '@/components/platform/mobile-sidebar';

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (key: string) => key,
}));

const mockStore = {
  isMobileOpen: true,
  setMobileOpen: vi.fn(),
};

vi.mock('@/store/platformSidebarStore', () => ({
  usePlatformSidebarStore: (selector: (state: typeof mockStore) => unknown) => selector(mockStore),
}));

vi.mock('@/store/themeStore', () => ({
  useThemeStore: (
    selector: (state: { safeAreaInsets: { top: number; bottom: number } }) => unknown,
  ) => selector({ safeAreaInsets: { top: 12, bottom: 20 } }),
}));

vi.mock('@/context/EnvContext', () => ({
  useEnv: () => ({
    appService: null,
  }),
}));

vi.mock('@/components/platform/sidebar', () => ({
  Sidebar: ({
    className,
    onNavigate,
    reserveMobileToolbarSpace,
  }: {
    className?: string;
    onNavigate?: () => void;
    reserveMobileToolbarSpace?: boolean;
  }) => (
    <aside
      data-testid='sidebar'
      className={className}
      data-reserve-mobile-toolbar-space={String(reserveMobileToolbarSpace)}
    >
      <button type='button' onClick={onNavigate}>
        Mock sidebar navigation
      </button>
    </aside>
  ),
}));

describe('MobileSidebar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStore.isMobileOpen = true;
  });

  afterEach(() => {
    cleanup();
    document.body.style.overflow = '';
  });

  it('renders a dynamic-height constrained drawer with a shrinkable sidebar body', () => {
    render(<MobileSidebar />);

    const drawer = screen.getByRole('dialog', { name: 'Navigation menu' });
    const closeButton = screen.getByRole('button', { name: 'Close menu' });
    const sidebar = screen.getByTestId('sidebar');

    expect(drawer.className).toContain('h-[100dvh]');
    expect(drawer.className).toContain('max-h-[100dvh]');
    expect(drawer.className).toContain('flex-col');
    expect(drawer.className).toContain('overflow-hidden');
    expect((drawer as HTMLElement).style.paddingTop).toBe('20px');
    expect((drawer as HTMLElement).style.paddingBottom).toBe('20px');
    expect(closeButton.parentElement?.className).toContain('flex-shrink-0');
    expect(sidebar.className).toContain('min-h-0');
    expect(sidebar.className).toContain('flex-1');
    expect(sidebar.getAttribute('data-reserve-mobile-toolbar-space')).toBe('false');
  });

  it('closes the mobile drawer when nested sidebar navigation fires', () => {
    render(<MobileSidebar />);

    screen.getByRole('button', { name: 'Mock sidebar navigation' }).click();

    expect(mockStore.setMobileOpen).toHaveBeenCalledWith(false);
  });
});
