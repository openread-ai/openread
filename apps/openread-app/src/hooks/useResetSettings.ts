import { useEnv } from '@/context/EnvContext';
import { ViewSettings } from '@/types/book';

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
  const { appService } = useEnv();

  return (setters: StateSetters) => {
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
};
