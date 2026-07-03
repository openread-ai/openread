import i18n from '@/i18n/i18n';
import { create } from 'zustand';
import { SystemSettings } from '@/types/settings';
import { EnvConfigType } from '@/services/environment';
import { settingsService } from '@/services/settings/settingsService';
import { initDayjs } from '@/utils/time';
import { isReaderBookKeyOrRef } from '@openread/types';
import { createLogger } from '@/utils/logger';

const logger = createLogger('settingsStore');

export type FontPanelView = 'main-fonts' | 'custom-fonts';
export type SettingsPanelType = 'Font' | 'Layout' | 'Color' | 'Control' | 'Language' | 'Custom';
export type SettingsDialogScope = 'all' | 'appearance';

export type SettingsDialogOpenOptions = {
  scope?: SettingsDialogScope;
  initialPanel?: SettingsPanelType;
};

interface SettingsState {
  settings: SystemSettings;
  settingsDialogBookKey: string | null;
  isSettingsDialogOpen: boolean;
  isSettingsGlobal: boolean;
  settingsDialogScope: SettingsDialogScope;
  initialSettingsPanel: SettingsPanelType | null;
  fontPanelView: FontPanelView;
  activeSettingsItemId: string | null;
  setSettings: (settings: SystemSettings) => void;
  saveSettings: (envConfig: EnvConfigType, settings: SystemSettings) => void;
  setSettingsDialogBookKey: (bookKey: string | null) => void;
  setSettingsDialogOpen: (open: boolean, options?: SettingsDialogOpenOptions) => void;
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
  settingsDialogScope: 'all',
  initialSettingsPanel: null,
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
  setSettingsDialogOpen: (open, options) =>
    set((state) => {
      if (!open) {
        return {
          isSettingsDialogOpen: false,
          settingsDialogScope: 'all',
          initialSettingsPanel: null,
        };
      }

      if (!state.settingsDialogBookKey) {
        return {
          isSettingsDialogOpen: false,
          settingsDialogScope: 'all',
          initialSettingsPanel: null,
        };
      }

      return {
        isSettingsDialogOpen: true,
        settingsDialogScope: options?.scope ?? 'all',
        initialSettingsPanel: options?.initialPanel ?? null,
      };
    }),
  setSettingsGlobal: (global) => set({ isSettingsGlobal: global }),
  setFontPanelView: (view) => set({ fontPanelView: view }),
  setActiveSettingsItemId: (id) => set({ activeSettingsItemId: id }),

  applyUILanguage: (uiLanguage?: string) => {
    const locale = uiLanguage ? uiLanguage : navigator.language;
    i18n.changeLanguage(locale);
    initDayjs(locale);
  },
}));
