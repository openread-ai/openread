import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useEnv } from '@/context/EnvContext';
import { syncWorker } from '@/services/sync/syncWorker';
import { useLibraryStore } from '@/store/libraryStore';
import { useSettingsStore } from '@/store/settingsStore';
import { usePlatformSidebarStore } from '@/store/platformSidebarStore';
import { createLogger } from '@/utils/logger';
import type { SystemSettings } from '@/types/settings';

const logger = createLogger('useLibrary');
const LIBRARY_OWNER_STORAGE_KEY = 'openread_library_owner_user_id';
const qaAutomationEnabled = process.env.NEXT_PUBLIC_OPENREAD_QA_AUTOMATION === '1';

function resetAccountScopedWatermarks(settings: SystemSettings): SystemSettings {
  return {
    ...settings,
    lastSyncedAtBooks: 0,
    lastSyncedAtConfigs: 0,
    lastSyncedAtNotes: 0,
    lastSyncedAtSettings: 0,
  };
}

export const useLibrary = () => {
  const { envConfig } = useEnv();
  const { user } = useAuth();
  const {
    setLibrary,
    setIsReconciling,
    libraryLoaded: storeLibraryLoaded,
    isReconciling,
  } = useLibraryStore();
  const { setSettings } = useSettingsStore();
  const [libraryLoaded, setLibraryLoaded] = useState(false);
  const initiatedKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const userId = user?.id ?? null;
    const initKey = userId ?? 'anonymous';
    if (initiatedKeyRef.current === initKey) return;
    initiatedKeyRef.current = initKey;
    setLibraryLoaded(false);
    if (userId) setIsReconciling(true);
    let cancelled = false;

    const initLibrary = async () => {
      try {
        const appService = await envConfig.getAppService();
        const ownerUserId = userId ? localStorage.getItem(LIBRARY_OWNER_STORAGE_KEY) : null;
        const ownerMismatch = Boolean(userId && ownerUserId !== userId);
        const settings = await appService.loadSettings();
        if (cancelled) return;
        const scopedSettings = ownerMismatch ? resetAccountScopedWatermarks(settings) : settings;
        setSettings(scopedSettings);
        if (ownerMismatch) {
          await appService.saveSettings(scopedSettings);
        }

        if (!userId) {
          setLibrary([]);
          return;
        }

        if (ownerMismatch) {
          setLibrary([]);
          usePlatformSidebarStore.getState().resetAccountScopedCollections();
          await appService.saveLibraryBooks([]);
          localStorage.setItem(LIBRARY_OWNER_STORAGE_KEY, userId);
          return;
        }

        if (qaAutomationEnabled) {
          const currentLibrary = useLibraryStore.getState().library;
          setLibrary([...currentLibrary]);
          return;
        }

        const diskBooks = await appService.loadLibraryBooks();
        if (cancelled) return;
        // Disk is a startup fallback only. Auth/session changes, QA resets, or sync may
        // populate the store while this load is in flight; never let stale local disk
        // overwrite a newer in-memory account-scoped Library.
        const currentLibrary = useLibraryStore.getState().library;
        if (currentLibrary.length === 0) {
          setLibrary(diskBooks);
        }
      } catch (error) {
        logger.error('Failed to initialize library', error);
        // Set empty library so libraryLoaded=true in the store,
        // allowing sync to proceed even if disk load fails.
        const currentLibrary = useLibraryStore.getState().library;
        if (currentLibrary.length === 0) {
          setLibrary([]);
        }
      } finally {
        if (!cancelled && userId) {
          // AuthContext usually starts the worker, but Library can mount from the
          // locally restored user before AuthContext's async session effect runs.
          // Start/no-op here after account-scoped local Library initialization so
          // the initial reconcile is not dropped while the worker is still stopped.
          syncWorker.start(userId);
          try {
            await syncWorker.pullNow('books');
          } catch (error) {
            logger.warn('Initial account-scoped library sync failed', error);
          } finally {
            setIsReconciling(false);
          }
        }
        if (!cancelled) {
          setLibraryLoaded(true);
        }
      }
    };

    initLibrary();
    return () => {
      cancelled = true;
      if (userId) setIsReconciling(false);
    };
  }, [envConfig, setIsReconciling, setLibrary, setSettings, user?.id]);

  return { libraryLoaded: (libraryLoaded || storeLibraryLoaded) && !isReconciling };
};
