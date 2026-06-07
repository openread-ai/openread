import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadDataTheme, useThemeStore } from '@/store/themeStore';

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
});
