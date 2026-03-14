import { useCallback, useRef } from 'react';
import type { BookDoc, SectionItem, TOCItem } from '@/libs/document';
import type { ReaderChapter } from '@/services/ai/tools/bookTools';
import { createLogger } from '@/utils/logger';

const logger = createLogger('book-chapters');

/**
 * Build two maps from section ID → label:
 *
 * 1. `titleMap`: section ID → its own TOC label (first/outermost match wins).
 * 2. `parentMap`: section ID → parent TOC label (e.g. "Chapter 3: The 5 Time Assassins").
 *
 * The parent map lets us prefix sub-section titles so the AI can resolve
 * "Chapter 3" even when the EPUB spine only has subsections like "The Three Trade Levels".
 */
function buildSectionTitleMaps(bookDoc: BookDoc): {
  titleMap: Map<string, string>;
  parentMap: Map<string, string>;
} {
  const titleMap = new Map<string, string>();
  const parentMap = new Map<string, string>();
  if (!bookDoc.toc) return { titleMap, parentMap };

  function traverse(items: TOCItem[], parentLabel?: string) {
    for (const item of items) {
      if (item.href) {
        try {
          const sectionId = String(bookDoc.splitTOCHref(item.href)[0] ?? '');
          if (sectionId && !titleMap.has(sectionId)) {
            titleMap.set(sectionId, item.label);
          }
          if (sectionId && parentLabel && !parentMap.has(sectionId)) {
            parentMap.set(sectionId, parentLabel);
          }
        } catch {
          // Skip TOC items with malformed hrefs
        }
      }
      if (item.subitems) {
        // Children inherit this item's label as their parent chapter
        traverse(item.subitems, item.label);
      }
    }
  }

  traverse(bookDoc.toc);
  return { titleMap, parentMap };
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

/** Threshold for triggering synthetic chunking on a single oversized chapter. */
const OVERSIZED_CHAPTER_THRESHOLD = 30_000;

/** Target segment size for synthetic chunking. */
const CHUNK_TARGET_SIZE = 8_000;

/** Minimum chunk size — chunks smaller than this are merged with neighbors. */
const CHUNK_MIN_SIZE = 200;

/**
 * Heading pattern for detecting structural markers in plain text.
 * Matches markdown headings, CHAPTER/Part markers, and numbered titles.
 */
const HEADING_RE =
  /^(?:#{1,3}\s+.+|(?:CHAPTER|Chapter)\s+(?:\d+|[IVXLCDM]+|[A-Z][a-z]+)(?:\s*[:.]\s*.*)?|(?:PART|Part)\s+(?:\d+|[IVXLCDM]+|[A-Z][a-z]+)(?:\s*[:.]\s*.*)?|\d{1,3}\.\s+[A-Z].*)$/m;

/**
 * Inline synthetic chunking for the reader layer.
 *
 * Splits a single large text into navigable segments using:
 * 1. Heading detection (markdown, CHAPTER, Part, numbered)
 * 2. Paragraph grouping (~8K per segment)
 * 3. Fixed-size sentence-boundary splitting (fallback)
 *
 * This is intentionally inlined to avoid a cross-package dependency
 * on @openread/mcp from the reader app.
 */
function syntheticChunkInline(
  text: string,
  baseTitle: string,
): { id: string; title: string; text: string }[] {
  if (text.length <= CHUNK_TARGET_SIZE) {
    return [{ id: 'chunk-0', title: baseTitle, text }];
  }

  // Strategy 1: Heading detection
  const lines = text.split('\n');
  const headingSegments: { id: string; title: string; text: string }[] = [];
  let curTitle = '';
  let curLines: string[] = [];
  let idx = 0;

  for (const line of lines) {
    if (HEADING_RE.test(line.trim())) {
      if (curLines.length > 0) {
        const segText = curLines.join('\n').trim();
        if (segText.length > 0) {
          headingSegments.push({
            id: `heading-${idx}`,
            title: curTitle || baseTitle,
            text: segText,
          });
          idx++;
        }
      }
      curTitle = line.trim().replace(/^#{1,3}\s+/, '');
      curLines = [];
    } else {
      curLines.push(line);
    }
  }
  if (curLines.length > 0) {
    const segText = curLines.join('\n').trim();
    if (segText.length > 0) {
      headingSegments.push({
        id: `heading-${idx}`,
        title: curTitle || baseTitle,
        text: segText,
      });
    }
  }
  if (headingSegments.length > 1) {
    return mergeSmall(headingSegments);
  }

  // Strategy 2: Paragraph grouping
  const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim().length > 0);
  if (paragraphs.length > 1) {
    const segments: { id: string; title: string; text: string }[] = [];
    let curParas: string[] = [];
    let curSize = 0;
    let si = 0;
    for (const para of paragraphs) {
      const trimmed = para.trim();
      if (curSize + trimmed.length > CHUNK_TARGET_SIZE && curParas.length > 0) {
        segments.push({
          id: `chunk-${si}`,
          title: `${baseTitle} (${si + 1})`,
          text: curParas.join('\n\n'),
        });
        si++;
        curParas = [];
        curSize = 0;
      }
      curParas.push(trimmed);
      curSize += trimmed.length + 2;
    }
    if (curParas.length > 0) {
      segments.push({
        id: `chunk-${si}`,
        title: segments.length === 0 ? baseTitle : `${baseTitle} (${si + 1})`,
        text: curParas.join('\n\n'),
      });
    }
    if (segments.length > 1) {
      return mergeSmall(segments);
    }
  }

  // Strategy 3: Fixed-size sentence-boundary splitting
  const chunks: { id: string; title: string; text: string }[] = [];
  let start = 0;
  let ci = 0;
  while (start < text.length) {
    if (start + CHUNK_TARGET_SIZE >= text.length) {
      chunks.push({
        id: `chunk-${ci}`,
        title: `${baseTitle} (${ci + 1})`,
        text: text.slice(start),
      });
      break;
    }
    const candidate = text.slice(start, start + CHUNK_TARGET_SIZE);
    let bp = -1;
    for (let i = candidate.length - 1; i >= candidate.length * 0.8; i--) {
      const ch = candidate[i];
      if (
        (ch === '.' || ch === '!' || ch === '?') &&
        (candidate[i + 1] === ' ' || candidate[i + 1] === '\n' || i + 1 === candidate.length)
      ) {
        bp = i + 1;
        break;
      }
    }
    if (bp === -1) {
      for (let i = candidate.length - 1; i >= candidate.length * 0.8; i--) {
        if (candidate[i] === ' ' || candidate[i] === '\n') {
          bp = i + 1;
          break;
        }
      }
    }
    if (bp === -1) bp = CHUNK_TARGET_SIZE;
    chunks.push({
      id: `chunk-${ci}`,
      title: `${baseTitle} (${ci + 1})`,
      text: candidate.slice(0, bp),
    });
    ci++;
    start += bp;
  }
  return chunks;
}

function mergeSmall(
  segments: { id: string; title: string; text: string }[],
): { id: string; title: string; text: string }[] {
  if (segments.length <= 1) return segments;
  const result: { id: string; title: string; text: string }[] = [];
  for (const seg of segments) {
    if (seg.text.length < CHUNK_MIN_SIZE && result.length > 0) {
      result[result.length - 1].text += '\n\n' + seg.text;
    } else {
      result.push({ ...seg });
    }
  }
  if (result.length > 1 && result[result.length - 1].text.length < CHUNK_MIN_SIZE) {
    const last = result.pop()!;
    result[result.length - 1].text += '\n\n' + last.text;
  }
  return result;
}

/**
 * Resolve PDF TOC items to page index ranges by calling the async splitTOCHref.
 * Returns a flat list of { label, startPage } sorted by page number.
 */
async function resolvePdfTocRanges(
  bookDoc: BookDoc,
  totalPages: number,
): Promise<{ label: string; startPage: number }[]> {
  const toc = bookDoc.toc;
  if (!toc?.length) return [];

  const entries: { label: string; startPage: number }[] = [];

  async function traverse(items: TOCItem[], parentLabel?: string) {
    for (const item of items) {
      if (item.href) {
        try {
          const parts = await bookDoc.splitTOCHref(item.href);
          const pageIdx = typeof parts[0] === 'number' ? parts[0] : parseInt(String(parts[0]), 10);
          if (!isNaN(pageIdx) && pageIdx >= 0 && pageIdx < totalPages) {
            const label =
              parentLabel && parentLabel !== item.label
                ? `${parentLabel} > ${item.label}`
                : item.label;
            entries.push({ label, startPage: pageIdx });
          }
        } catch {
          // Skip unresolvable TOC entries
        }
      }
      if (item.subitems?.length) {
        await traverse(item.subitems, item.label);
      }
    }
  }

  await traverse(toc);

  // Sort by page number and deduplicate (same page = keep first)
  entries.sort((a, b) => a.startPage - b.startPage);
  const deduped: typeof entries = [];
  for (const entry of entries) {
    if (deduped.length === 0 || deduped[deduped.length - 1]!.startPage !== entry.startPage) {
      deduped.push(entry);
    }
  }
  return deduped;
}

/** Format a page marker for embedding between PDF page texts. 1-based page number. */
function pageMarker(pageIdx: number): string {
  return `--- Page ${pageIdx + 1} ---`;
}

/** Join page texts with `--- Page N ---` markers so the LLM can cite pages. */
function joinPagesWithMarkers(
  pageTexts: Map<number, string>,
  startPage: number,
  endPage: number,
): string {
  const parts: string[] = [];
  for (let p = startPage; p < endPage; p++) {
    const text = pageTexts.get(p);
    if (text) parts.push(`${pageMarker(p)}\n\n${text}`);
  }
  return parts.join('\n\n');
}

/**
 * Group pages into ~8K chapters that never split mid-page.
 * Each chunk is titled by its page range (e.g. "Pages 1–15").
 */
function groupPagesBySize(pageTexts: Map<number, string>, docTitle: string): ReaderChapter[] {
  const sorted = Array.from(pageTexts.entries()).sort(([a], [b]) => a - b);
  const chapters: ReaderChapter[] = [];
  let buf: { idx: number; text: string }[] = [];
  let bufSize = 0;

  const flush = () => {
    if (buf.length === 0) return;
    const first = buf[0]!.idx + 1;
    const last = buf[buf.length - 1]!.idx + 1;
    const title =
      first === last ? `${docTitle} — Page ${first}` : `${docTitle} — Pages ${first}–${last}`;
    chapters.push({
      id: `pdf-${buf[0]!.idx}`,
      index: chapters.length,
      title,
      text: buf.map((p) => `${pageMarker(p.idx)}\n\n${p.text}`).join('\n\n'),
    });
    buf = [];
    bufSize = 0;
  };

  for (const [idx, text] of sorted) {
    if (bufSize + text.length > CHUNK_TARGET_SIZE && buf.length > 0) flush();
    buf.push({ idx, text });
    bufSize += text.length;
  }
  flush();

  return chapters;
}

/**
 * Extract chapters from a PDF by grouping pages based on the TOC outline.
 * Falls back to page-boundary-respecting size chunks when no TOC is available.
 *
 * All page joins embed `--- Page N ---` markers so the LLM can cite page numbers.
 */
async function extractPdfChapters(
  bookDoc: BookDoc,
  sections: SectionItem[],
): Promise<ReaderChapter[]> {
  // 1. Extract text from each page
  const pageTexts = new Map<number, string>();
  for (let i = 0; i < sections.length; i++) {
    try {
      const doc = await sections[i]!.createDocument();
      const text = extractText(doc);
      if (text.length >= 20) {
        pageTexts.set(i, text);
      }
    } catch {
      // Skip pages that fail to extract
    }
  }

  if (pageTexts.size === 0) {
    logger.info('PDF: no text extracted from any page');
    return [];
  }

  // 2. Resolve TOC to page ranges
  const tocRanges = await resolvePdfTocRanges(bookDoc, sections.length);

  // 3. Group pages by TOC ranges (with page markers)
  if (tocRanges.length > 1) {
    const chapters: ReaderChapter[] = [];

    // Handle pages before the first TOC entry (front matter)
    if (tocRanges[0]!.startPage > 0) {
      const text = joinPagesWithMarkers(pageTexts, 0, tocRanges[0]!.startPage);
      if (text) {
        chapters.push({ id: 'pdf-0', index: 0, title: 'Front Matter', text });
      }
    }

    for (let r = 0; r < tocRanges.length; r++) {
      const range = tocRanges[r]!;
      const endPage = r + 1 < tocRanges.length ? tocRanges[r + 1]!.startPage : sections.length;
      const text = joinPagesWithMarkers(pageTexts, range.startPage, endPage);
      if (!text) continue;
      chapters.push({
        id: `pdf-${range.startPage}`,
        index: chapters.length,
        title: range.label,
        text,
      });
    }

    if (chapters.length > 0) {
      logger.info(
        `PDF: grouped ${pageTexts.size} pages into ${chapters.length} TOC-based chapters`,
      );
      return chapters;
    }
  }

  // 4. Fallback: group pages into ~8K size chunks (never splits mid-page)
  const docTitle =
    typeof bookDoc.metadata?.title === 'string' ? bookDoc.metadata.title : 'Document';
  const result = groupPagesBySize(pageTexts, docTitle);
  logger.info(
    `PDF: no usable TOC, grouped ${pageTexts.size} pages into ${result.length} page-range chapters`,
  );
  return result;
}

async function extractAllChapters(bookDoc: BookDoc): Promise<ReaderChapter[]> {
  const sections = bookDoc.sections || [];

  // PDF detection: sections lack the 'linear' property that EPUB/MOBI/FB2 provide
  const isPdf = sections.length > 0 && !('linear' in sections[0]!);
  if (isPdf) {
    return extractPdfChapters(bookDoc, sections);
  }

  const { titleMap, parentMap } = buildSectionTitleMaps(bookDoc);
  const result: ReaderChapter[] = [];

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i]!;
    if (section.linear === 'no') continue;

    try {
      const doc = await section.createDocument();
      const text = extractText(doc);
      if (text.length < 50) continue;

      // Build a title that includes the parent chapter label when available.
      // e.g. "Chapter 3: The 5 Time Assassins > The Three Trade Levels"
      // This allows the AI to resolve "Chapter 3" via substring match.
      const ownTitle = titleMap.get(section.id) || `Section ${i + 1}`;
      const parent = parentMap.get(section.id);
      const title = parent && parent !== ownTitle ? `${parent} > ${ownTitle}` : ownTitle;

      result.push({
        id: section.id,
        index: i,
        title,
        text,
      });
    } catch {
      // Skip sections that fail to parse
    }
  }

  // Synthetic chunking fallback: if we got 0 chapters or a single oversized
  // chapter, split it into navigable segments so the AI can reference parts.
  if (result.length === 0) {
    logger.info('No chapters extracted, skipping synthetic chunking');
  } else if (result.length === 1 && result[0]!.text.length > OVERSIZED_CHAPTER_THRESHOLD) {
    logger.info(`Single chapter is ${result[0]!.text.length} chars — applying synthetic chunking`);
    const chunks = syntheticChunkInline(result[0]!.text, result[0]!.title);
    const chunked: ReaderChapter[] = chunks.map((chunk, ci) => ({
      id: chunk.id,
      index: ci,
      title: chunk.title,
      text: chunk.text,
    }));
    logger.info(`Synthetic chunking produced ${chunked.length} segments`);
    return chunked;
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
