import i18n from '@/i18n/i18n';
import { create } from 'zustand';
import { SystemSettings } from '@/types/settings';
import { EnvConfigType } from '@/services/environment';
import { settingsService } from '@/services/settings/settingsService';
import { initDayjs } from '@/utils/time';
import { isReaderBookKeyOrRef } from '@/utils/readerBookKey';
import { createLogger } from '@/utils/logger';

const logger = createLogger('settingsStore');

export type FontPanelView = 'main-fonts' | 'custom-fonts';

interface SettingsState {
  settings: SystemSettings;
  settingsDialogBookKey: string | null;
  isSettingsDialogOpen: boolean;
  isSettingsGlobal: boolean;
  fontPanelView: FontPanelView;
  activeSettingsItemId: string | null;
  setSettings: (settings: SystemSettings) => void;
  saveSettings: (envConfig: EnvConfigType, settings: SystemSettings) => void;
  setSettingsDialogBookKey: (bookKey: string | null) => void;
  setSettingsDialogOpen: (open: boolean) => void;
  setSettingsGlobal: (global: boolean) => void;
  setFontPanelView: (view: FontPanelView) => void;
  setActiveSettingsItemId: (id: string | null) => void;

  applyUILanguage: (uiLanguage?: string) => void;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  settings: {} as SystemSettings,
  settingsDialogBookKey: null,
  isSettingsDialogOpen: false,
  isSettingsGlobal: true,
  fontPanelView: 'main-fonts',
  activeSettingsItemId: null,
  setSettings: (settings) => set({ settings }),
  saveSettings: async (envConfig: EnvConfigType, settings: SystemSettings) => {
    await settingsService.save(envConfig, settings);
  },
  setSettingsDialogBookKey: (bookKey) => {
    if (bookKey === null) {
      set({ settingsDialogBookKey: null });
      return;
    }
    if (!isReaderBookKeyOrRef(bookKey)) {
      logger.warn('Ignoring invalid settings dialog book key', { bookKey });
      set({ settingsDialogBookKey: null });
      return;
    }
    set({ settingsDialogBookKey: bookKey });
  },
  setSettingsDialogOpen: (open) =>
    set((state) => ({
      isSettingsDialogOpen: open && state.settingsDialogBookKey ? true : false,
    })),
  setSettingsGlobal: (global) => set({ isSettingsGlobal: global }),
  setFontPanelView: (view) => set({ fontPanelView: view }),
  setActiveSettingsItemId: (id) => set({ activeSettingsItemId: id }),

  applyUILanguage: (uiLanguage?: string) => {
    const locale = uiLanguage ? uiLanguage : navigator.language;
    i18n.changeLanguage(locale);
    initDayjs(locale);
  },
}));
