import { useEffect, useRef } from 'react';
import { useEnv } from '@/context/EnvContext';
import { useBookDataStore } from '@/store/bookDataStore';
import { useReaderStore } from '@/store/readerStore';
import { useSettingsStore } from '@/store/settingsStore';
import { throttle } from '@/utils/throttle';

export const useProgressAutoSave = (bookKey: string) => {
  const { envConfig } = useEnv();
  const { getConfig, saveConfig } = useBookDataStore();
  const { getProgress } = useReaderStore();
  const progress = getProgress(bookKey);

  const saveContextRef = useRef({ envConfig, bookKey, getConfig, saveConfig });

  useEffect(() => {
    saveContextRef.current = { envConfig, bookKey, getConfig, saveConfig };
  }, [envConfig, bookKey, getConfig, saveConfig]);

  const saveBookConfigRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    saveBookConfigRef.current ??= throttle(() => {
      setTimeout(async () => {
        const current = saveContextRef.current;
        const config = current.getConfig(current.bookKey)!;
        const settings = useSettingsStore.getState().settings;
        await current.saveConfig(current.envConfig, current.bookKey, config, settings);
      }, 5000);
    }, 10000);
  }, []);

  useEffect(() => {
    saveBookConfigRef.current?.();
  }, [progress, bookKey]);
};
