import { useEffect } from 'react';
import { useSettingsStore } from '@/store/settingsStore';
import { useBookDataStore } from '@/store/bookDataStore';
import {
  indexBook,
  getEmbeddingModelName,
  clearBookIndex,
  cloudIndexStatus,
  cloudIndexBook,
  aiStore,
  CURRENT_SCHEMA_VERSION,
} from '@/services/ai';
import { getAccessToken } from '@/utils/access';
import { createLogger } from '@/utils/logger';

const logger = createLogger('background-indexing');

/**
 * Triggers AI book indexing in the background as soon as a book is loaded,
 * so the index is ready when the user opens the AI chat tab.
 *
 * Cloud-first: If the user is authenticated with a cloud provider, checks the
 * cloud catalog first. If already embedded, done. If not, chunks locally and
 * sends to the cloud for embedding + storage.
 *
 * Falls back to local IndexedDB pipeline for offline / Ollama-only users.
 */
export function useBackgroundIndexing(bookKey: string | null) {
  const { settings } = useSettingsStore();
  const { getBookData } = useBookDataStore();

  const aiSettings = settings?.aiSettings;
  const bookHash = bookKey?.split('-')[0] || '';
  const bookData = bookKey ? getBookData(bookKey) : null;
  const bookDoc = bookData?.bookDoc;

  useEffect(() => {
    if (!aiSettings?.enabled || !bookHash || !bookDoc) return;

    let cancelled = false;
    const abortController = new AbortController();

    (async () => {
      try {
        const token = await getAccessToken();
        if (cancelled) return;

        const isCloudProvider =
          aiSettings.provider === 'groq' ||
          aiSettings.provider === 'ai-gateway' ||
          !!aiSettings.byokProvider;

        // Cloud path: check cloud catalog first
        if (token && isCloudProvider) {
          const status = await cloudIndexStatus(bookHash);
          if (cancelled) return;

          if (status.status === 'ready' && status.hasRef) {
            logger.info('Book already indexed in cloud', bookHash);
            return;
          }

          if (status.status === 'processing') {
            logger.info('Book indexing in progress in cloud', bookHash);
            return;
          }

          // Not found in cloud — chunk locally and send to cloud
          logger.info('Cloud indexing started', bookHash);
          type BookDocParam = Parameters<typeof cloudIndexBook>[0];
          await cloudIndexBook(bookDoc as BookDocParam, bookHash);
          if (cancelled) return;
          logger.info('Cloud indexing complete', bookHash);
          return;
        }

        // Local path: Ollama / offline fallback
        const currentModel = getEmbeddingModelName(aiSettings);
        const isIndexed = await aiStore.isIndexed(bookHash);
        const stale =
          isIndexed && (await aiStore.isStale(bookHash, currentModel, CURRENT_SCHEMA_VERSION));

        if (isIndexed && !stale) return;

        if (cancelled) return;

        if (stale) {
          await clearBookIndex(bookHash);
        }

        logger.info('Local background indexing started', bookHash);
        await indexBook(bookDoc as Parameters<typeof indexBook>[0], bookHash, aiSettings);
        logger.info('Local background indexing complete', bookHash);
      } catch (e) {
        if (cancelled) return; // Suppress errors from cancelled operations
        const message = e instanceof Error ? e.message : String(e);
        logger.error(`Background indexing failed for ${bookHash}: ${message}`);
      }
    })();

    return () => {
      cancelled = true;
      abortController.abort();
    };
  }, [aiSettings, bookHash, bookDoc]);
}
