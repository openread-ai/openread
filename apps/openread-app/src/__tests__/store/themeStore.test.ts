import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_THEME_MODE,
  getDefaultThemeColor,
  loadDataTheme,
  useThemeStore,
} from '@/store/themeStore';

const setSystemDarkMode = (matches: boolean) => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
};

describe('loadDataTheme', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    window.__OPENREAD_IS_EINK = false;
    setSystemDarkMode(false);
  });

  it('applies default-light when no theme preference is saved', () => {
    loadDataTheme();

    expect(document.documentElement.getAttribute('data-theme')).toBe('default-light');
  });

  it('applies default-dark when no theme preference is saved and system is dark', () => {
    setSystemDarkMode(true);

    loadDataTheme();

    expect(document.documentElement.getAttribute('data-theme')).toBe('default-dark');
  });

  it('preserves saved theme preferences', () => {
    localStorage.setItem('themeMode', 'light');
    localStorage.setItem('themeColor', 'sepia');

    loadDataTheme();

    expect(document.documentElement.getAttribute('data-theme')).toBe('sepia-light');
  });

  it('keeps platform pages themed when system dark mode changes', () => {
    useThemeStore.setState({ themeMode: 'auto', themeColor: 'default' });

    useThemeStore.getState().handleSystemThemeChange(true);

    expect(document.documentElement.getAttribute('data-theme')).toBe('default-dark');
  });

  it('resets only global theme mode/color to canonical defaults', () => {
    localStorage.setItem('themeMode', 'dark');
    localStorage.setItem('themeColor', 'sepia');
    localStorage.setItem('notificationPreferences', '{"productUpdates":false}');
    useThemeStore.setState({
      themeMode: 'dark',
      themeColor: 'sepia',
      systemIsDarkMode: false,
      isDarkMode: true,
    });

    useThemeStore.getState().resetThemeDefaults();

    expect(localStorage.getItem('themeMode')).toBe(DEFAULT_THEME_MODE);
    expect(localStorage.getItem('themeColor')).toBe(getDefaultThemeColor());
    expect(localStorage.getItem('notificationPreferences')).toBe('{"productUpdates":false}');
    expect(useThemeStore.getState().themeMode).toBe(DEFAULT_THEME_MODE);
    expect(useThemeStore.getState().themeColor).toBe('default');
    expect(document.documentElement.getAttribute('data-theme')).toBe('default-light');
  });

  it('uses contrast as the default theme color on eink devices', () => {
    window.__OPENREAD_IS_EINK = true;
    useThemeStore.setState({
      themeMode: 'dark',
      themeColor: 'sepia',
      systemIsDarkMode: false,
      isDarkMode: true,
    });

    useThemeStore.getState().resetThemeDefaults();

    expect(localStorage.getItem('themeMode')).toBe(DEFAULT_THEME_MODE);
    expect(localStorage.getItem('themeColor')).toBe('contrast');
    expect(document.documentElement.getAttribute('data-theme')).toBe('contrast-light');
  });
});
