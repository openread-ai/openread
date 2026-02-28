import { useCallback, useRef } from 'react';
import type { BookDoc, TOCItem } from '@/libs/document';
import type { ReaderChapter } from '@/services/ai/tools/bookTools';
import { createLogger } from '@/utils/logger';

const logger = createLogger('book-chapters');

function getChapterTitle(toc: TOCItem[] | undefined, sectionIndex: number): string {
  if (!toc || toc.length === 0) return `Section ${sectionIndex + 1}`;
  for (let i = toc.length - 1; i >= 0; i--) {
    if (toc[i]!.id <= sectionIndex) return toc[i]!.label;
  }
  return toc[0]?.label || `Section ${sectionIndex + 1}`;
}

function extractText(doc: Document): string {
  const body = doc.body || doc.documentElement;
  if (!body) return '';
  const clone = body.cloneNode(true) as HTMLElement;
  clone
    .querySelectorAll('script, style, noscript, nav, header, footer')
    .forEach((el) => el.remove());
  return clone.textContent?.trim() || '';
}

async function extractAllChapters(bookDoc: BookDoc): Promise<ReaderChapter[]> {
  const sections = bookDoc.sections || [];
  const toc = bookDoc.toc;
  const result: ReaderChapter[] = [];

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i]!;
    if (section.linear === 'no') continue;

    try {
      const doc = await section.createDocument();
      const text = extractText(doc);
      if (text.length < 50) continue;

      result.push({
        id: section.id,
        index: i,
        title: getChapterTitle(toc, i),
        text,
      });
    } catch {
      // Skip sections that fail to parse
    }
  }

  logger.info(`Extracted ${result.length} chapters for agent tools`);
  return result;
}

/**
 * Provides a lazy chapter extractor for the agentic chat adapter.
 *
 * Returns a `getChapters()` function that extracts all chapter text from the
 * BookDoc on first call, then caches the result. Subsequent calls return
 * the cached chapters instantly. Cache is invalidated when bookDoc changes.
 */
export function useBookChapters(bookDoc: BookDoc | null | undefined) {
  const cacheRef = useRef<{ forDoc: BookDoc; chapters: ReaderChapter[] } | null>(null);

  const getChapters = useCallback(async (): Promise<ReaderChapter[]> => {
    if (!bookDoc) return [];

    // Cache hit — same book, already extracted
    if (cacheRef.current?.forDoc === bookDoc) {
      return cacheRef.current.chapters;
    }

    // First call: extract all chapters
    const chapters = await extractAllChapters(bookDoc);
    cacheRef.current = { forDoc: bookDoc, chapters };
    return chapters;
  }, [bookDoc]);

  return { getChapters };
}
