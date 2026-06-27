import { BookDoc } from '@/libs/document';
import { Overlayer } from 'foliate-js/overlayer.js';
import {
  denormalizeAnnotationTargetRects,
  getAnnotationTargetKey,
  getBookNoteTarget,
  getBookNoteTextCfi,
  isFixedPageAnnotationTarget,
} from '@/services/annotation/annotationTargetContract';
import { AnnotationTarget, BookNote, BookSearchConfig, BookSearchResult } from '@/types/book';
import { TTSGranularity } from '@/services/tts';
import { TTS } from 'foliate-js/tts.js';
import { LocaleWithTextInfo } from './misc';

export const NOTE_PREFIX = 'foliate-note:';

export interface FoliateView extends HTMLElement {
  open: (book: BookDoc) => Promise<void>;
  close: () => void;
  init: (options: { lastLocation: string }) => void;
  goTo: (href: string) => void;
  goToFraction: (fraction: number) => void;
  prev: (distance?: number) => void;
  next: (distance?: number) => void;
  pan: (dx: number, dy: number) => void;
  isOverflowX: () => boolean;
  isOverflowY: () => boolean;
  goLeft: () => void;
  goRight: () => void;
  getCFI: (index: number, range: Range) => string;
  resolveCFI: (cfi: string) => { index: number; anchor: (doc: Document) => Range };
  addAnnotation: (
    note: BookNote & { value?: string },
    remove?: boolean,
  ) => { index: number; label: string };
  search: (config: BookSearchConfig) => AsyncGenerator<BookSearchResult | string, void, void>;
  clearSearch: () => void;
  select: (target: string | number | { fraction: number }) => void;
  deselect: () => void;
  initTTS: (
    granularity?: TTSGranularity,
    nodeFilter?: (node: Node) => number,
    highlight?: (range: Range) => void,
  ) => Promise<void>;
  book: BookDoc;
  tts: TTS | null;
  language: {
    locale?: LocaleWithTextInfo;
    isCJK?: boolean;
    canonical?: string;
    direction?: string;
  };
  history: {
    canGoBack: boolean;
    canGoForward: boolean;
    back: () => void;
    forward: () => void;
    clear: () => void;
  };
  renderer: {
    scrolled?: boolean;
    scrollLocked: boolean;
    size: number; // current page height
    viewSize: number; // whole document view height
    start: number;
    end: number;
    page: number;
    pages: number;
    containerPosition: number;
    sideProp: 'width' | 'height';
    setAttribute: (name: string, value: string | number) => void;
    removeAttribute: (name: string) => void;
    next: () => Promise<void>;
    prev: () => Promise<void>;
    nextSection?: () => Promise<void>;
    prevSection?: () => Promise<void>;
    goTo?: (params: { index: number; anchor: number }) => void;
    setStyles?: (css: string) => void;
    getContents: () => { doc: Document; index?: number; overlayer?: unknown }[];
    scrollToAnchor: (anchor: number | Range) => void;
    addEventListener: (
      type: string,
      listener: EventListener,
      option?: AddEventListenerOptions,
    ) => void;
    removeEventListener: (type: string, listener: EventListener) => void;
  };
}

function makeFixedTargetRange(doc: Document, target: AnnotationTarget) {
  return {
    commonAncestorContainer: doc.body ?? doc.documentElement,
    startContainer: doc.body ?? doc.documentElement,
    getClientRects: () => denormalizeAnnotationTargetRects(target, doc),
  } as unknown as Range;
}

function drawFixedTargetAnnotation(
  note: BookNote,
  rects: ReturnType<typeof denormalizeAnnotationTargetRects>,
) {
  const color = typeof note.color === 'string' ? note.color : 'yellow';
  if (note.note) return Overlayer.bubble(rects);
  if (note.style === 'underline') return Overlayer.underline(rects, { color });
  if (note.style === 'squiggly') return Overlayer.squiggly(rects, { color });
  return Overlayer.highlight(rects, { color });
}

export const wrappedFoliateView = (originalView: FoliateView): FoliateView => {
  const originalAddAnnotation = originalView.addAnnotation.bind(originalView);
  originalView.addAnnotation = (note: BookNote & { value?: string }, remove = false) => {
    const target = getBookNoteTarget(note);
    if (isFixedPageAnnotationTarget(target)) {
      const value = note.value ?? getAnnotationTargetKey(target) ?? note.id;
      const content = originalView.renderer
        .getContents()
        .find((item) => item.index === target.pageIndex && item.overlayer);
      if (!content?.overlayer || !content.doc) return { index: target.pageIndex, label: '' };
      const overlayer = content.overlayer as {
        add: (
          key: string,
          range: Range,
          draw: (rects: ReturnType<typeof denormalizeAnnotationTargetRects>) => SVGElement,
        ) => void;
        remove: (key: string) => void;
      };
      if (remove) {
        overlayer.remove(value);
        return { index: target.pageIndex, label: '' };
      }
      const rects = denormalizeAnnotationTargetRects(target, content.doc);
      if (rects.length === 0) return { index: target.pageIndex, label: '' };
      overlayer.add(value, makeFixedTargetRange(content.doc, target), (redrawnRects) =>
        drawFixedTargetAnnotation(note, redrawnRects),
      );
      return { index: target.pageIndex, label: '' };
    }

    const cfi = getBookNoteTextCfi(note);
    if (!cfi) return { index: -1, label: '' };
    // transform text-cfi BookNote to foliate annotation
    const annotation = {
      ...note,
      cfi,
      value: note.value ?? cfi,
    };
    return originalAddAnnotation(annotation, remove);
  };
  return originalView;
};
