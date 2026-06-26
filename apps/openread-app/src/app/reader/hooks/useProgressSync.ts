import { useCallback, useEffect, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useSync } from '@/hooks/useSync';
import { BookConfig, FIXED_LAYOUT_FORMATS } from '@/types/book';
import { useBookDataStore } from '@/store/bookDataStore';
import { useReaderStore } from '@/store/readerStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useTranslation } from '@/hooks/useTranslation';
import { serializeConfig } from '@/utils/serializer';
import { debounce } from '@/utils/debounce';
import { eventDispatcher } from '@/utils/event';
import { DEFAULT_BOOK_SEARCH_CONFIG, SYNC_PROGRESS_INTERVAL_SEC } from '@/services/constants';
import { getCFIFromXPointer, getXPointerFromCFI, normalizeProgressXPointer } from '@/utils/xcfi';
import { createLogger } from '@/utils/logger';
import { enqueueBookConfigForSync } from '@/services/sync/helpers';
import { remoteApplyEventMatchesBook, subscribeRemoteApply } from '@/services/sync/remoteApply';
import { parseBookRefFromReaderBookKey } from '@/utils/readerBookKey';
import { parseSyncableBookRef } from '@openread/types';

const logger = createLogger('progress-sync');

export const useProgressSync = (bookKey: string) => {
  const _ = useTranslation();
  const { getConfig, getBookDataByReaderKey } = useBookDataStore();
  const { getView, getProgress, setHoveredBookKey } = useReaderStore();
  const { settings } = useSettingsStore();
  const { syncConfigs } = useSync(bookKey);
  const { user } = useAuth();
  const progress = getProgress(bookKey);

  const configPulled = useRef(false);
  const hasPulledConfigOnce = useRef(false);

  const pushConfig = async (bookKey: string, config: BookConfig | null) => {
    const book = getBookDataByReaderKey(bookKey)?.book;
    if (!config || !book || !user) return;
    const bookHash = parseSyncableBookRef(parseBookRefFromReaderBookKey(bookKey));
    if (!bookHash) return;
    const metaHash = book.metaHash;
    const newConfig = { ...config, bookHash, metaHash };
    const compressedConfig = JSON.parse(
      serializeConfig(newConfig, settings.globalViewSettings, DEFAULT_BOOK_SEARCH_CONFIG),
    );
    delete compressedConfig.booknotes;
    await syncConfigs([compressedConfig], bookHash, metaHash, 'push');
  };

  const pullConfig = async (bookKey: string) => {
    const book = getBookDataByReaderKey(bookKey)?.book;
    if (!user || !book) return;
    const bookHash = parseSyncableBookRef(parseBookRefFromReaderBookKey(bookKey));
    if (!bookHash) return;
    const metaHash = book.metaHash;
    await syncConfigs([], bookHash, metaHash, 'pull');
    configPulled.current = true;
  };

  const syncConfig = async () => {
    if (!configPulled.current) {
      pullConfig(bookKey);
    } else {
      const config = getConfig(bookKey);
      const view = getView(bookKey);
      const book = getBookDataByReaderKey(bookKey)?.book;
      if (config && view && book && config.progress && config.progress[0] > 0) {
        try {
          const content = view.renderer.getContents()[0];
          if (content && !FIXED_LAYOUT_FORMATS.has(book.format)) {
            const { doc, index } = content;
            const xpointerResult = await getXPointerFromCFI(config.location!, doc, index || 0);
            config.xpointer = normalizeProgressXPointer(xpointerResult.xpointer);
          }
        } catch (error) {
          logger.warn('Failed to convert CFI to XPointer', error);
        }
        pushConfig(bookKey, config);
      }
    }
  };

  const handleSyncBookProgress = async (event: CustomEvent) => {
    const { bookKey: syncBookKey } = event.detail;
    if (syncBookKey === bookKey) {
      configPulled.current = false;
      await pullConfig(bookKey);
    }
  };

  // Push: ad-hoc push when the book is closed
  useEffect(() => {
    eventDispatcher.on('sync-book-progress', handleSyncBookProgress);
    return () => {
      eventDispatcher.off('sync-book-progress', handleSyncBookProgress);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookKey]);

  const flushConfigToQueue = useCallback(() => {
    const config = getConfig(bookKey);
    const book = getBookDataByReaderKey(bookKey)?.book;
    if (!config || !book || !user) return;

    const bookHash = parseSyncableBookRef(parseBookRefFromReaderBookKey(bookKey));
    if (!bookHash) return;
    if (config.updatedAt) {
      void enqueueBookConfigForSync({ ...config, bookHash, metaHash: book.metaHash });
    }
  }, [bookKey, getBookDataByReaderKey, getConfig, user]);

  // Flush unsaved config to the durable outbox on unmount and mobile browser lifecycle
  // transitions so progress is not lost before the debounce fires.
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') flushConfigToQueue();
    };
    window.addEventListener('pagehide', flushConfigToQueue);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      flushConfigToQueue();
      window.removeEventListener('pagehide', flushConfigToQueue);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [flushConfigToQueue]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const handleAutoSync = useCallback(
    debounce(() => {
      syncConfig();
    }, SYNC_PROGRESS_INTERVAL_SEC * 1000),
    [],
  );

  // Push: auto-push progress when progress changes with a debounce
  useEffect(() => {
    if (!progress?.location || !user) return;
    handleAutoSync();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progress?.location]);

  // Pull: pull progress once when the book is opened
  useEffect(() => {
    if (!progress || hasPulledConfigOnce.current) return;
    hasPulledConfigOnce.current = true;
    pullConfig(bookKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progress]);

  const remoteConfigMatchesCurrentBook = useCallback(
    (remoteConfig: BookConfig) => {
      const book = getBookDataByReaderKey(bookKey)?.book;
      const bookHash = parseSyncableBookRef(parseBookRefFromReaderBookKey(bookKey));
      if (!book || !bookHash) return false;
      return remoteApplyEventMatchesBook({
        eventBookHash: remoteConfig.bookHash,
        eventMetaHash: remoteConfig.metaHash,
        bookHash,
        bookMetaHash: book.metaHash,
      });
    },
    [bookKey, getBookDataByReaderKey],
  );

  const navigateToAppliedRemoteProgress = useCallback(
    async (remoteConfig: BookConfig) => {
      if (!remoteConfigMatchesCurrentBook(remoteConfig)) return;

      let remoteCFILocation = remoteConfig.location;
      const view = getView(bookKey);
      const bookData = getBookDataByReaderKey(bookKey);
      if (remoteConfig.xpointer && view && bookData?.bookDoc) {
        const content = view.renderer.getContents()[0];
        try {
          remoteCFILocation = await getCFIFromXPointer(
            normalizeProgressXPointer(remoteConfig.xpointer),
            content?.doc,
            content?.index,
            bookData.bookDoc,
          );
        } catch (error) {
          logger.warn('Failed to convert remote XPointer to CFI', error);
        }
      }

      if (!remoteCFILocation || !view) return;
      try {
        await view.goTo(remoteCFILocation);
        setHoveredBookKey(null);
        eventDispatcher.dispatch('hint', {
          bookKey,
          message: _('Reading Progress Synced'),
        });
      } catch (navError) {
        logger.warn('Navigation to synced position failed', { remoteCFILocation, navError });
      }
    },
    [
      _,
      bookKey,
      getBookDataByReaderKey,
      getView,
      remoteConfigMatchesCurrentBook,
      setHoveredBookKey,
    ],
  );

  useEffect(() => {
    return subscribeRemoteApply((event) => {
      if (event.type !== 'bookConfig') return;
      if (!remoteConfigMatchesCurrentBook(event.config)) return;
      configPulled.current = true;
      navigateToAppliedRemoteProgress(event.config).catch((error) => {
        logger.error('Failed to navigate to applied remote progress', error);
      });
    });
  }, [navigateToAppliedRemoteProgress, remoteConfigMatchesCurrentBook]);
};
