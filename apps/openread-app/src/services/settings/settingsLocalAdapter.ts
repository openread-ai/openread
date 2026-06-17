import type { ThemeMode } from '@/styles/themes';

const THEME_MODE_KEY = 'themeMode';
const THEME_COLOR_KEY = 'themeColor';
const DEVICE_ID_KEY = 'openread_device_id';

function canUseLocalStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

export const settingsLocalAdapter = {
  getThemeMode(defaultValue: ThemeMode = 'auto'): ThemeMode {
    if (!canUseLocalStorage()) return defaultValue;
    return (window.localStorage.getItem(THEME_MODE_KEY) as ThemeMode | null) ?? defaultValue;
  },

  setThemeMode(mode: ThemeMode): void {
    if (!canUseLocalStorage()) return;
    window.localStorage.setItem(THEME_MODE_KEY, mode);
  },

  getThemeColor(defaultValue: string): string {
    if (!canUseLocalStorage()) return defaultValue;
    return window.localStorage.getItem(THEME_COLOR_KEY) ?? defaultValue;
  },

  setThemeColor(color: string): void {
    if (!canUseLocalStorage()) return;
    window.localStorage.setItem(THEME_COLOR_KEY, color);
  },

  getDeviceId(): string | null {
    if (!canUseLocalStorage()) return null;
    return window.localStorage.getItem(DEVICE_ID_KEY);
  },

  setDeviceId(deviceId: string): void {
    if (!canUseLocalStorage()) return;
    window.localStorage.setItem(DEVICE_ID_KEY, deviceId);
  },
};
