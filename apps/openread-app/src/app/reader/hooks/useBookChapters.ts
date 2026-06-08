import { useCallback, useRef } from 'react';
import type { BookDoc, TOCItem } from '@/libs/document';
import type { ReaderChapter, ReaderVisualContextImage } from '@/services/ai/tools/bookTools';
import { createLogger } from '@/utils/logger';

const logger = createLogger('book-chapters');

const MAX_VISUAL_CONTEXT_IMAGES = 5;
const MAX_VISUAL_CONTEXT_IMAGE_BYTES = 900_000;

type VisualLoadResult = string | { src?: string; data?: string } | Blob;
type VisualSection = {
  id: string | number;
  load?: () => Promise<VisualLoadResult>;
  createDocument?: () => Promise<Document>;
};

/**
 * Build two maps from section ID → label:
 *
 * 1. `titleMap`: section ID → its own TOC label (first/outermost match wins).
 * 2. `parentMap`: section ID → parent TOC label (e.g. "Chapter 3: The 5 Time Assassins").
 *
 * The parent map lets us prefix sub-section titles so the AI can resolve
 * "Chapter 3" even when the EPUB spine only has subsections like "The Three Trade Levels".
 */
async function buildSectionTitleMaps(bookDoc: BookDoc): Promise<{
  titleMap: Map<string, string>;
  parentMap: Map<string, string>;
}> {
  const titleMap = new Map<string, string>();
  const parentMap = new Map<string, string>();
  if (!bookDoc.toc) return { titleMap, parentMap };

  async function traverse(items: TOCItem[], parentLabel?: string) {
    for (const item of items) {
      if (item.href) {
        try {
          const [sectionRef] = await Promise.resolve(bookDoc.splitTOCHref(item.href));
          const sectionId = String(sectionRef ?? '');
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
        await traverse(item.subitems, item.label);
      }
    }
  }

  await traverse(bookDoc.toc);
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

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read image blob'));
    reader.readAsDataURL(blob);
  });
}

async function loadImageBlobFromVisualResult(result: VisualLoadResult): Promise<Blob | null> {
  if (result instanceof Blob) return result;

  const src = typeof result === 'string' ? result : result.src;
  const html = typeof result === 'object' && !(result instanceof Blob) ? result.data : undefined;
  if (!src && !html) return null;

  let imageSrc = src;
  const htmlText = html ?? (src ? await fetch(src).then((response) => response.text()) : '');
  if (htmlText) {
    const doc = new DOMParser().parseFromString(htmlText, 'text/html');
    imageSrc = doc.querySelector('img')?.getAttribute('src') ?? imageSrc;
  }

  if (!imageSrc) return null;
  const imageResponse = await fetch(imageSrc);
  if (!imageResponse.ok) return null;
  const blob = await imageResponse.blob();
  if (!blob.type.startsWith('image/')) return null;
  return blob;
}

async function imageBlobToVisionDataUrl(blob: Blob): Promise<string | null> {
  if (blob.size > MAX_VISUAL_CONTEXT_IMAGE_BYTES) {
    logger.warn(`Skipping oversized visual context image (${blob.size} bytes)`);
    return null;
  }
  const dataUrl = await blobToDataUrl(blob);
  return dataUrl.startsWith('data:image/') ? dataUrl : null;
}

function findVisualStartIndex(sections: VisualSection[], sectionHref?: string): number {
  if (!sectionHref) return 0;
  const base = sectionHref.split('#')[0]!;
  const index = sections.findIndex((section) => {
    const id = String(section.id);
    return id === sectionHref || id === base || sectionHref.startsWith(id);
  });
  return index >= 0 ? index : 0;
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

function getSectionTitle(
  sectionId: string,
  index: number,
  titleMap: Map<string, string>,
  parentMap: Map<string, string>,
): string {
  // Build a title that includes the parent chapter label when available.
  // e.g. "Chapter 3: The 5 Time Assassins > The Three Trade Levels"
  // This allows the AI to resolve "Chapter 3" via substring match.
  const ownTitle = titleMap.get(sectionId) || `Section ${index + 1}`;
  const parent = parentMap.get(sectionId);
  return parent && parent !== ownTitle ? `${parent} > ${ownTitle}` : ownTitle;
}

function flattenTOC(items: TOCItem[] | undefined, depth = 0): string[] {
  if (!items) return [];
  const lines: string[] = [];
  for (const item of items) {
    const prefix = depth > 0 ? `${'  '.repeat(depth)}- ` : '- ';
    if (item.label) lines.push(`${prefix}${item.label}`);
    lines.push(...flattenTOC(item.subitems, depth + 1));
  }
  return lines;
}

function formatMetadataValue(value: unknown): string | undefined {
  if (!value) return undefined;
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(formatMetadataValue).filter(Boolean).join(', ');
  if (typeof value === 'object') {
    const candidate = value as { name?: unknown; label?: unknown; value?: unknown };
    const namedValue = formatMetadataValue(candidate.name ?? candidate.label ?? candidate.value);
    if (namedValue) return namedValue;
    return Object.values(value).map(formatMetadataValue).filter(Boolean).join(', ') || undefined;
  }
  return String(value);
}

function buildMetadataContextChapter(bookDoc: BookDoc): ReaderChapter | null {
  const metadata = bookDoc.metadata;
  const lines = [
    `Title: ${formatMetadataValue(metadata.title) ?? 'Unknown'}`,
    `Author: ${formatMetadataValue(metadata.author) ?? 'Unknown'}`,
    formatMetadataValue(metadata.subtitle)
      ? `Subtitle: ${formatMetadataValue(metadata.subtitle)}`
      : undefined,
    formatMetadataValue(metadata.publisher)
      ? `Publisher: ${formatMetadataValue(metadata.publisher)}`
      : undefined,
    formatMetadataValue(metadata.published)
      ? `Published: ${formatMetadataValue(metadata.published)}`
      : undefined,
    formatMetadataValue(metadata.language)
      ? `Language: ${formatMetadataValue(metadata.language)}`
      : undefined,
    formatMetadataValue(metadata.subject)
      ? `Subjects: ${formatMetadataValue(metadata.subject)}`
      : undefined,
    formatMetadataValue(metadata.description)
      ? `Description: ${formatMetadataValue(metadata.description)}`
      : undefined,
    bookDoc.sections?.length
      ? `Reader sections/pages available: ${bookDoc.sections.length}`
      : undefined,
  ].filter((line): line is string => Boolean(line));

  const tocLines = flattenTOC(bookDoc.toc).slice(0, 80);
  if (tocLines.length > 0) {
    lines.push('', 'Table of contents:', ...tocLines);
  }

  if (lines.join('\n').trim().length < 50) {
    lines.push(
      'Reader context: This book is open in Reader. Use the available book metadata, table of contents, and reader state as the starting context.',
    );
  }

  const text = lines.join('\n').trim();

  return {
    id: 'book-context',
    index: 0,
    title: 'Available book context',
    text,
  };
}

function chunkChapters(
  chunks: { id: string; title: string; text: string }[],
  idPrefix = 'dynamic-context',
): ReaderChapter[] {
  return chunks.map((chunk, ci) => ({
    id: `${idPrefix}-${chunk.id}`,
    index: ci,
    title: chunk.title,
    text: chunk.text,
  }));
}

export async function buildReaderVisualContextImages(
  bookDoc: BookDoc,
  sectionHref?: string,
): Promise<ReaderVisualContextImage[]> {
  const sections = (bookDoc.sections || []) as VisualSection[];
  const visualSections = sections.filter((section) => typeof section.load === 'function');
  if (visualSections.length === 0) return [];

  const startIndex = findVisualStartIndex(visualSections, sectionHref);
  const images: ReaderVisualContextImage[] = [];
  const candidates = visualSections.slice(startIndex, startIndex + MAX_VISUAL_CONTEXT_IMAGES);

  for (let i = 0; i < candidates.length; i++) {
    const section = candidates[i]!;
    try {
      const loaded = await section.load!();
      const blob = await loadImageBlobFromVisualResult(loaded);
      if (!blob) continue;
      const dataUrl = await imageBlobToVisionDataUrl(blob);
      if (!dataUrl) continue;

      images.push({
        id: String(section.id),
        index: startIndex + i,
        title: `Visual page ${startIndex + i + 1}`,
        dataUrl,
      });
    } catch (error) {
      logger.warn('Failed to load visual context image', error);
    }
  }

  if (images.length > 0) {
    logger.info(`Resolved ${images.length} visual context images for AI chat`);
  }
  return images;
}

export async function buildReaderChaptersForAI(bookDoc: BookDoc): Promise<ReaderChapter[]> {
  const sections = bookDoc.sections || [];
  const { titleMap, parentMap } = await buildSectionTitleMaps(bookDoc);
  const result: ReaderChapter[] = [];
  const shortReadableSections: ReaderChapter[] = [];

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i]!;
    if (section.linear === 'no') continue;

    try {
      const createDocument = (section as VisualSection).createDocument;
      if (!createDocument) continue;
      const doc = await createDocument();
      const text = extractText(doc);
      if (!text) continue;

      const sectionId = String(section.id);
      const title = getSectionTitle(sectionId, i, titleMap, parentMap);
      const chapter = {
        id: sectionId,
        index: i,
        title,
        text,
      };

      if (text.length < 50) {
        shortReadableSections.push(chapter);
      } else {
        result.push(chapter);
      }
    } catch {
      // Skip sections that fail to parse
    }
  }

  // Dynamic sparse-text fallback: PDFs and catalog imports can expose many
  // short page fragments. Preserve that text by merging it before falling back
  // to metadata-only context.
  if (result.length === 0 && shortReadableSections.length > 0) {
    const mergedText = shortReadableSections
      .map((section) => `${section.title}\n${section.text}`)
      .join('\n\n')
      .trim();

    if (mergedText.length >= 50) {
      logger.info(`Merged ${shortReadableSections.length} sparse sections into dynamic AI context`);
      return chunkChapters(syntheticChunkInline(mergedText, 'Reader text context'));
    }
  }

  // Metadata/TOC fallback: when body text is unavailable (e.g. scanned PDF),
  // keep the chat grounded in the book context the reader does know instead of
  // sending an empty payload that fails the API contract.
  if (result.length === 0) {
    const metadataChapter = buildMetadataContextChapter(bookDoc);
    if (metadataChapter) {
      logger.info('Using metadata/TOC context for AI chat');
      return [metadataChapter];
    }
    logger.info('No readable book context available for AI chat');
  } else if (result.length === 1 && result[0].text.length > OVERSIZED_CHAPTER_THRESHOLD) {
    logger.info(`Single chapter is ${result[0].text.length} chars — applying synthetic chunking`);
    const chunks = syntheticChunkInline(result[0].text, result[0].title);
    const chunked = chunkChapters(chunks, 'chapter');
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
export function useBookChapters(bookDoc: BookDoc | null | undefined, sectionHref?: string) {
  const cacheRef = useRef<{ forDoc: BookDoc; chapters: ReaderChapter[] } | null>(null);
  const visualCacheRef = useRef<{
    forDoc: BookDoc;
    sectionHref?: string;
    images: ReaderVisualContextImage[];
  } | null>(null);

  const getChapters = useCallback(async (): Promise<ReaderChapter[]> => {
    if (!bookDoc) return [];

    // Cache hit — same book, already extracted
    if (cacheRef.current?.forDoc === bookDoc) {
      return cacheRef.current.chapters;
    }

    // First call: resolve the best available reader context for AI.
    const chapters = await buildReaderChaptersForAI(bookDoc);
    cacheRef.current = { forDoc: bookDoc, chapters };
    return chapters;
  }, [bookDoc]);

  const getVisualContextImages = useCallback(async (): Promise<ReaderVisualContextImage[]> => {
    if (!bookDoc) return [];

    if (
      visualCacheRef.current?.forDoc === bookDoc &&
      visualCacheRef.current.sectionHref === sectionHref
    ) {
      return visualCacheRef.current.images;
    }

    const images = await buildReaderVisualContextImages(bookDoc, sectionHref);
    visualCacheRef.current = { forDoc: bookDoc, sectionHref, images };
    return images;
  }, [bookDoc, sectionHref]);

  return { getChapters, getVisualContextImages };
}
