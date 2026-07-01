import { useEnv } from '@/context/EnvContext';
import { ViewSettings } from '@/types/book';
import {
  markCurrentBookReaderAppearanceResetEcho,
  restoreCurrentBookReaderAppearanceDefaults,
} from '@/helpers/settings';
import {
  getReaderAppearanceDefaultKeys,
  ReaderAppearanceDefaultCategory,
} from '@/services/settings/readerAppearanceDefaults';

type StateSetter<Value> = { bivarianceHack(value: Value): void }['bivarianceHack'];

type StateSetters = Partial<{
  [Key in keyof ViewSettings]: StateSetter<ViewSettings[Key]>;
}>;

const applyDefaultSetter = <Key extends keyof ViewSettings>(
  defaultSettings: ViewSettings,
  settingKey: Key,
  setter: StateSetter<ViewSettings[Key]>,
) => {
  const freshValue = defaultSettings[settingKey];
  if (freshValue !== undefined) {
    setter(freshValue);
  }
};

export const useResetViewSettings = () => {
  const { appService, envConfig } = useEnv();

  const resetLocalDefaults = (setters: StateSetters) => {
    if (!appService) return null;
    const defaultSettings = appService.getDefaultViewSettings();

    for (const settingKey of Object.keys(setters) as (keyof ViewSettings)[]) {
      const setter = setters[settingKey];
      if (setter) {
        applyDefaultSetter(defaultSettings, settingKey, setter);
      }
    }

    return defaultSettings;
  };

  const resetToDefaults = async (
    bookKeyOrSetters: string | StateSetters,
    categories?: readonly ReaderAppearanceDefaultCategory[],
    setters: StateSetters = {},
  ) => {
    // Non-appearance settings panels still use local-only reset semantics.
    // Appearance panels must pass a book key + category so persistence, store,
    // renderer, and local UI all consume the same canonical appearance registry.
    if (typeof bookKeyOrSetters !== 'string') {
      return resetLocalDefaults(bookKeyOrSetters);
    }
    if (!appService || !categories) return null;

    const nextViewSettings = await restoreCurrentBookReaderAppearanceDefaults(
      envConfig,
      bookKeyOrSetters,
      appService.getDefaultViewSettings(),
      { categories, appService },
    );
    if (!nextViewSettings) return null;

    for (const settingKey of getReaderAppearanceDefaultKeys(categories)) {
      const setter = setters[settingKey];
      if (setter) {
        markCurrentBookReaderAppearanceResetEcho(
          bookKeyOrSetters,
          settingKey,
          nextViewSettings[settingKey],
        );
        applyDefaultSetter(nextViewSettings, settingKey, setter);
      }
    }

    return nextViewSettings;
  };

  return resetToDefaults;
};
