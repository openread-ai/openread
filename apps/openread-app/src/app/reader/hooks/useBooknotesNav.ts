import { useCallback, useMemo } from 'react';
import * as CFI from 'foliate-js/epubcfi.js';
import {
  getBookNoteNavigationIndex,
  getBookNoteTarget,
  getBookNoteTargetKey,
  getBookNoteTextCfi,
  isFixedPageAnnotationTarget,
} from '@/services/annotation/annotationTargetContract';
import { useSidebarStore } from '@/store/sidebarStore';
import { useReaderStore } from '@/store/readerStore';
import { useBookDataStore } from '@/store/bookDataStore';
import { isCfiInLocation } from '@/utils/cfi';
import { findTocItemBS } from '@/utils/toc';
import { BookNote, BookNoteType } from '@/types/book';
import { TOCItem } from '@/libs/document';

function compareBooknotesByTarget(a: BookNote, b: BookNote) {
  const aCfi = getBookNoteTextCfi(a);
  const bCfi = getBookNoteTextCfi(b);
  if (aCfi && bCfi) return CFI.compare(aCfi, bCfi);

  const aIndex = getBookNoteNavigationIndex(a);
  const bIndex = getBookNoteNavigationIndex(b);
  if (aIndex != null && bIndex != null && aIndex !== bIndex) return aIndex - bIndex;

  return getBookNoteTargetKey(a).localeCompare(getBookNoteTargetKey(b));
}

function isBooknoteOnCurrentTarget(
  note: BookNote,
  currentLocation: string | null | undefined,
  currentPageIndex: number | null,
) {
  const target = getBookNoteTarget(note);
  if (target?.kind === 'text-cfi') return isCfiInLocation(target.cfi, currentLocation);
  return isFixedPageAnnotationTarget(target) && currentPageIndex != null
    ? target.pageIndex === currentPageIndex
    : false;
}

export function useBooknotesNav(bookKey: string, toc: TOCItem[]) {
  const { getView, getProgress } = useReaderStore();
  const { getConfig } = useBookDataStore();
  const {
    setSideBarVisible,
    getBooknotesNavState,
    setActiveBooknoteType,
    setBooknoteResults,
    setBooknoteIndex,
    clearBooknotesNav,
  } = useSidebarStore();

  const booknotesNavState = getBooknotesNavState(bookKey);
  const { activeBooknoteType, booknoteResults, booknoteIndex } = booknotesNavState;

  const progress = getProgress(bookKey);
  const currentLocation = progress?.location;
  const currentPageIndex = progress?.section?.current ?? progress?.pageinfo?.current ?? null;

  // Get booknotes from config and filter by type
  const allBooknotes = useMemo(() => {
    const config = getConfig(bookKey);
    return config?.booknotes?.filter((note) => !note.deletedAt) || [];
  }, [bookKey, getConfig]);

  const sortedBooknotes = useMemo(() => {
    if (!booknoteResults) return [];
    return [...booknoteResults].sort(compareBooknotesByTarget);
  }, [booknoteResults]);

  const totalResults = sortedBooknotes.length;
  const hasBooknotes = booknoteResults && totalResults > 0;
  const showBooknotesNav = hasBooknotes && activeBooknoteType !== null;

  // Get current section label
  const currentSection = useMemo(() => {
    if (!sortedBooknotes.length || booknoteIndex >= sortedBooknotes.length) return '';
    const currentNote = sortedBooknotes[booknoteIndex];
    if (!currentNote) return '';
    const cfi = getBookNoteTextCfi(currentNote);
    const tocItem = cfi ? findTocItemBS(toc, cfi) : null;
    if (tocItem?.label) return tocItem.label;
    const target = getBookNoteTarget(currentNote);
    return isFixedPageAnnotationTarget(target) ? `Page ${target.pageIndex + 1}` : '';
  }, [sortedBooknotes, booknoteIndex, toc]);

  // Find booknotes on the current page
  const currentPageResults = useMemo(() => {
    if (!sortedBooknotes.length) return { firstIndex: -1, lastIndex: -1 };

    let firstIndex = -1;
    let lastIndex = -1;

    for (let i = 0; i < sortedBooknotes.length; i++) {
      const note = sortedBooknotes[i];
      if (note && isBooknoteOnCurrentTarget(note, currentLocation, currentPageIndex)) {
        if (firstIndex === -1) firstIndex = i;
        lastIndex = i;
      }
    }
    if (firstIndex !== -1) {
      setTimeout(() => setBooknoteIndex(bookKey, firstIndex), 0);
    }

    return { firstIndex, lastIndex };
  }, [sortedBooknotes, currentLocation, currentPageIndex, bookKey, setBooknoteIndex]);

  // Navigate to a specific booknote
  const navigateToBooknote = useCallback(
    (index: number) => {
      if (!sortedBooknotes.length) return;
      if (index < 0 || index >= sortedBooknotes.length) return;

      const note = sortedBooknotes[index];
      if (note) {
        setBooknoteIndex(bookKey, index);
        const view = getView(bookKey);
        const cfi = getBookNoteTextCfi(note);
        if (cfi) {
          view?.goTo(cfi);
          return;
        }
        const target = getBookNoteTarget(note);
        if (isFixedPageAnnotationTarget(target)) view?.select(target.pageIndex);
      }
    },
    [bookKey, sortedBooknotes, setBooknoteIndex, getView],
  );

  // Start navigation for a specific booknote type
  const startNavigation = useCallback(
    (type: BookNoteType) => {
      const filtered = allBooknotes.filter((note) => note.type === type);
      if (filtered.length === 0) return;

      const sorted = [...filtered].sort(compareBooknotesByTarget);
      setActiveBooknoteType(bookKey, type);
      setBooknoteResults(bookKey, sorted);
      setBooknoteIndex(bookKey, 0);

      // Navigate to first booknote
      if (sorted.length > 0) {
        const view = getView(bookKey);
        const firstNote = sorted[0]!;
        const cfi = getBookNoteTextCfi(firstNote);
        if (cfi) {
          view?.goTo(cfi);
          return;
        }
        const target = getBookNoteTarget(firstNote);
        if (isFixedPageAnnotationTarget(target)) view?.select(target.pageIndex);
      }
    },
    [allBooknotes, bookKey, setActiveBooknoteType, setBooknoteResults, setBooknoteIndex, getView],
  );

  const handleShowResults = useCallback(() => {
    setSideBarVisible(true);
  }, [setSideBarVisible]);

  const handleClose = useCallback(() => {
    clearBooknotesNav(bookKey);
  }, [clearBooknotesNav, bookKey]);

  // Navigate to the previous page with booknotes
  const handlePrevious = useCallback(() => {
    const { firstIndex } = currentPageResults;

    if (firstIndex > 0) {
      navigateToBooknote(firstIndex - 1);
    } else if (firstIndex === -1 && booknoteIndex > 0) {
      navigateToBooknote(booknoteIndex - 1);
    }
  }, [currentPageResults, booknoteIndex, navigateToBooknote]);

  // Navigate to the next page with booknotes
  const handleNext = useCallback(() => {
    const { lastIndex } = currentPageResults;

    if (lastIndex >= 0 && lastIndex < totalResults - 1) {
      navigateToBooknote(lastIndex + 1);
    } else if (lastIndex === -1 && booknoteIndex < totalResults - 1) {
      navigateToBooknote(booknoteIndex + 1);
    }
  }, [currentPageResults, totalResults, booknoteIndex, navigateToBooknote]);

  // Check if there are booknotes before/after the current page
  const hasPreviousPage =
    currentPageResults.firstIndex > 0 ||
    (currentPageResults.firstIndex === -1 && booknoteIndex > 0);
  const hasNextPage =
    (currentPageResults.lastIndex >= 0 && currentPageResults.lastIndex < totalResults - 1) ||
    (currentPageResults.lastIndex === -1 && booknoteIndex < totalResults - 1);

  // Get counts for each booknote type
  const bookmarkCount = useMemo(
    () => allBooknotes.filter((n) => n.type === 'bookmark').length,
    [allBooknotes],
  );
  const annotationCount = useMemo(
    () => allBooknotes.filter((n) => n.type === 'annotation').length,
    [allBooknotes],
  );
  const excerptCount = useMemo(
    () => allBooknotes.filter((n) => n.type === 'excerpt').length,
    [allBooknotes],
  );

  return {
    activeBooknoteType,
    currentSection,
    booknoteIndex,
    totalResults,
    showBooknotesNav,
    hasPreviousPage,
    hasNextPage,
    bookmarkCount,
    annotationCount,
    excerptCount,
    startNavigation,
    handleShowResults,
    handleClose,
    handlePrevious,
    handleNext,
  };
}
