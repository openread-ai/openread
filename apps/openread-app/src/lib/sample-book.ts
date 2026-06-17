/**
 * @module lib/sample-book
 *
 * Constants and helpers for the first-login sample book.
 * S6.2: On first login with empty library, auto-import one
 * CC-BY book from the catalog to demonstrate AI Q&A features.
 *
 * The sample book is imported via the catalog API.  If the import
 * fails for any reason, the error is swallowed and the user simply
 * sees the welcome screen with an empty library.
 */

import { platform } from '@/services/platform/client';
import { createLogger } from '@/utils/logger';
import { LOCAL_PERSISTENCE_KEYS } from '@/services/persistence/localPersistenceRegistry';

const logger = createLogger('sample-book');

// ── Constants ───────────────────────────────────────────

/**
 * Catalog book ID for the sample book.
 * Change this value to swap the default sample book.
 *
 * Current: "Alice's Adventures in Wonderland" by Lewis Carroll
 * — public domain, small (~300 KB), well-known, good for AI Q&A demo.
 */
export const SAMPLE_BOOK_ID = 'alice-in-wonderland';

/** localStorage key used to prevent retrying after a failed or successful attempt. */
export const SAMPLE_BOOK_ATTEMPTED_KEY = LOCAL_PERSISTENCE_KEYS.sampleBookAttempted;

// ── Import logic ────────────────────────────────────────

/**
 * Attempt to import the sample book via the catalog API.
 * Returns true on success, false on failure.
 *
 * This function is intentionally fire-and-forget-safe:
 * it catches all errors internally and always marks the
 * attempt in localStorage so it is never retried.
 */
export async function importSampleBook(token: string): Promise<boolean> {
  // Mark as attempted immediately so we never retry
  localStorage.setItem(SAMPLE_BOOK_ATTEMPTED_KEY, new Date().toISOString());

  try {
    if (!token) return false;

    const data = await platform.catalog.importBook(SAMPLE_BOOK_ID);

    if (data.status === 'ready') {
      logger.info('Sample book imported successfully', { bookId: data.book_id });
      return true;
    }

    // If the book is still being prepared, we don't poll —
    // keeping this lightweight.  The user can import from Explore later.
    logger.info('Sample book is still being prepared, skipping');
    return false;
  } catch (err) {
    logger.warn('Sample book import failed silently', err);
    return false;
  }
}
