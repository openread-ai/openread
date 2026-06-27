import { useCallback, useEffect, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useSync } from '@/hooks/useSync';
import { useBookDataStore } from '@/store/bookDataStore';
import { useReaderStore } from '@/store/readerStore';
import { SYNC_NOTES_INTERVAL_SEC } from '@/services/constants';
import { throttle } from '@/utils/throttle';
import { enqueueBookNotesForSync } from '@/services/sync/helpers';
import {
  getAnnotationTargetKey,
  getBookNoteTarget,
  getBookNoteTextCfi,
} from '@/services/annotation/annotationTargetContract';
import { remoteApplyEventMatchesBook, subscribeRemoteApply } from '@/services/sync/remoteApply';
import { NOTE_PREFIX } from '@/types/view';
import { parseSyncableBookRef } from '@openread/types';

export const useNotesSync = (bookKey: string) => {
  const { user } = useAuth();
  const { syncNotes, lastNotePullAt } = useSync(bookKey);
  const { getConfig, getBookDataByReaderKey } = useBookDataStore();
  const { getViewsById } = useReaderStore();

  const config = getConfig(bookKey);

  const getNewNotes = useCallback(() => {
    const config = getConfig(bookKey);
    const book = getBookDataByReaderKey(bookKey)?.book;
    if (!config?.location || !book || !user) return {};

    const syncBookRef = parseSyncableBookRef(book.hash);
    if (!syncBookRef) return {};

    const bookNotes = config.booknotes ?? [];
    const newNotes = bookNotes.filter(
      (note) => lastNotePullAt < note.updatedAt || lastNotePullAt < (note.deletedAt ?? 0),
    );
    newNotes.forEach((note) => {
      note.bookHash = syncBookRef;
      note.metaHash = book.metaHash;
    });
    return {
      notes: newNotes,
      lastSyncedAt: lastNotePullAt,
    };
  }, [user, bookKey, lastNotePullAt, getConfig, getBookDataByReaderKey]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const handleAutoSync = useCallback(
    throttle(
      async () => {
        const book = getBookDataByReaderKey(bookKey)?.book;
        const newNotes = getNewNotes();
        if (!newNotes.notes?.length) return;
        const syncBookRef = parseSyncableBookRef(book?.hash);
        await syncNotes(newNotes.notes, syncBookRef ?? undefined, book?.metaHash, 'both');
      },
      SYNC_NOTES_INTERVAL_SEC * 1000,
      { emitLast: true },
    ),
    [syncNotes],
  );

  // Pull notes once when the book opens (fills local state from server on fresh install)
  const hasPulledNotesOnce = useRef(false);
  useEffect(() => {
    if (!config?.location || !user || hasPulledNotesOnce.current) return;
    hasPulledNotesOnce.current = true;
    const book = getBookDataByReaderKey(bookKey)?.book;
    const syncBookRef = parseSyncableBookRef(book?.hash);
    syncNotes([], syncBookRef ?? undefined, book?.metaHash, 'pull');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config?.location, user]);

  useEffect(() => {
    if (!config?.location || !user) return;
    handleAutoSync();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config?.booknotes, handleAutoSync]);

  const flushNotesToQueue = useCallback(() => {
    const { notes } = getNewNotes();
    if (!notes?.length || !user) return;
    void enqueueBookNotesForSync(notes);
  }, [getNewNotes, user]);

  // Flush unsent notes to the durable outbox on unmount and mobile browser lifecycle
  // transitions so bookmark/highlight/note changes are not lost before throttled sync.
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') flushNotesToQueue();
    };
    window.addEventListener('pagehide', flushNotesToQueue);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      flushNotesToQueue();
      window.removeEventListener('pagehide', flushNotesToQueue);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [flushNotesToQueue]);

  useEffect(() => {
    return subscribeRemoteApply((event) => {
      if (event.type !== 'bookNotes') return;
      const book = getBookDataByReaderKey(bookKey)?.book;
      const syncBookRef = parseSyncableBookRef(book?.hash);
      if (
        !book ||
        !remoteApplyEventMatchesBook({
          eventBookHash: event.bookHash,
          eventMetaHash: event.metaHash,
          bookHash: syncBookRef,
          bookMetaHash: book.metaHash,
        })
      ) {
        return;
      }

      const views = getViewsById(book.hash);
      for (const note of event.changedNotes) {
        if (note.type !== 'annotation') continue;
        const previous = event.previousNotes.find((item) => item.id === note.id);
        if (previous) {
          views.forEach((view) => view?.addAnnotation(previous, true));
          const previousCfi = getBookNoteTextCfi(previous);
          if (previousCfi && previous.note?.trim()) {
            views.forEach((view) =>
              view?.addAnnotation(
                { ...previous, cfi: previousCfi, value: `${NOTE_PREFIX}${previousCfi}` },
                true,
              ),
            );
          }
        }
        if (note.deletedAt) continue;
        const noteTarget = getBookNoteTarget(note);
        const noteTargetKey = getAnnotationTargetKey(noteTarget);
        if (note.style || (noteTargetKey && note.note?.trim())) {
          views.forEach((view) =>
            view?.addAnnotation(noteTargetKey ? { ...note, value: noteTargetKey } : note),
          );
        }
        const noteCfi = getBookNoteTextCfi(note);
        if (noteCfi && note.note?.trim()) {
          views.forEach((view) =>
            view?.addAnnotation({ ...note, cfi: noteCfi, value: `${NOTE_PREFIX}${noteCfi}` }),
          );
        }
      }
    });
  }, [bookKey, getBookDataByReaderKey, getViewsById]);
};
