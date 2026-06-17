import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import Providers from '@/components/Providers';

vi.mock('@/i18n/i18n', () => ({
  default: {
    on: vi.fn(),
    off: vi.fn(),
  },
}));

vi.mock('@/context/EnvContext', () => ({
  useEnv: () => ({
    envConfig: {},
    appService: null,
  }),
}));

vi.mock('@/store/themeStore', () => ({
  initSystemThemeListener: vi.fn(),
  loadDataTheme: vi.fn(),
}));

vi.mock('@/store/settingsStore', () => ({
  useSettingsStore: () => ({
    applyUILanguage: vi.fn(),
    setSettings: vi.fn(),
  }),
}));

vi.mock('@/hooks/useSafeAreaInsets', () => ({
  useSafeAreaInsets: vi.fn(),
}));

vi.mock('@/hooks/useResponsiveSize', () => ({
  useDefaultIconSize: () => 16,
}));

vi.mock('@/hooks/useBackgroundTexture', () => ({
  useBackgroundTexture: () => ({ applyBackgroundTexture: vi.fn() }),
}));

vi.mock('@/hooks/useEinkMode', () => ({
  useEinkMode: () => ({ applyEinkMode: vi.fn() }),
}));

vi.mock('@/utils/misc', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/utils/misc')>();
  return {
    ...actual,
    getLocale: () => 'en',
  };
});

vi.mock('@/utils/rtl', () => ({
  getDirFromUILanguage: () => 'ltr',
}));

describe('Providers', () => {
  it('renders null while appService is unavailable', () => {
    const { container } = render(
      <Providers>
        <div>child</div>
      </Providers>,
    );

    expect(container.textContent).toBe('');
  });
});
