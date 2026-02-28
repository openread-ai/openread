import { useEffect, useMemo, useState } from 'react';
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

/**
 * Extract chapter text from a parsed BookDoc for the agentic chat adapter.
 *
 * Runs once per book load — iterates through all linear sections,
 * calls createDocument() on each, and extracts the text content.
 */
export function useBookChapters(bookDoc: BookDoc | null | undefined): ReaderChapter[] {
  const [state, setState] = useState<{
    forDoc: BookDoc | null | undefined;
    chapters: ReaderChapter[];
  }>({ forDoc: undefined, chapters: [] });

  useEffect(() => {
    if (!bookDoc) return;

    const sections = bookDoc.sections || [];
    const toc = bookDoc.toc;
    let cancelled = false;

    (async () => {
      const result: ReaderChapter[] = [];

      for (let i = 0; i < sections.length; i++) {
        if (cancelled) return;
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

      if (!cancelled) {
        logger.info(`Extracted ${result.length} chapters for agent tools`);
        setState({ forDoc: bookDoc, chapters: result });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [bookDoc]);

  // Derive effective chapters: return empty when bookDoc doesn't match stored state
  return useMemo(() => (state.forDoc === bookDoc ? state.chapters : []), [state, bookDoc]);
}
