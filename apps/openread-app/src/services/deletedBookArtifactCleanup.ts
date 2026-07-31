import { normalizeBookReference, parseBookRefFromReaderBookKey } from '@openread/types';

import { runAccountLibraryMutation } from '@/services/accountLibraryLifecycle';
import { aiStore } from '@/services/ai/storage/aiStore';
import { resolveBookAvailability } from '@/services/libraryBookAvailability';
import { removeBookLocalPersistence } from '@/services/persistence/localPersistenceRegistry';
import { beginBookChatEviction, finishBookChatEviction, useAIChatStore } from '@/store/aiChatStore';
import { useBookDataStore } from '@/store/bookDataStore';
import type { TransferItem } from '@/store/transferStore';
import type { Book } from '@/types/book';
import type { AppService, BaseDir } from '@/types/system';
import { createLogger } from '@/utils/logger';

const logger = createLogger('deletedBookArtifactCleanup');

export interface DeletedBookArtifactCleanupSummary {
  candidates: number;
  evicted: number;
  retained: number;
  failed: number;
  bytesReclaimed: number;
  localStorageKeysRemoved: number;
  evictedBookHashes: string[];
}

interface CleanupState {
  library: readonly Book[];
  libraryLoaded: boolean;
  libraryReconciliationSettled: boolean;
  transfers: readonly TransferItem[];
  openReaderBookKeys: readonly string[];
}

interface CleanupInput {
  appService: AppService;
  library: readonly Book[];
  ownerUserId: string | null;
  isOwnerCurrent: () => boolean;
  getCurrentState: () => CleanupState;
  storage?: Storage;
}

type DirectoryTarget = { path: string; base: BaseDir };

const isTransferBlockingCleanup = (transfer: TransferItem, bookHash: string): boolean => {
  if (transfer.bookHash !== bookHash) return false;
  if (!transfer.ownerUserId) return true;
  return transfer.status === 'pending' || transfer.status === 'in_progress';
};

const inspectDirectory = async (
  appService: AppService,
  target: DirectoryTarget,
): Promise<{ exists: boolean; bytes: number }> => {
  if (!(await appService.exists(target.path, target.base))) return { exists: false, bytes: 0 };
  const files = await appService.readDirectory(target.path, target.base);
  return { exists: true, bytes: files.reduce((total, file) => total + file.size, 0) };
};

function canEvictBook(
  input: CleanupInput,
  bookHash: string,
  normalizedBookRef: NonNullable<ReturnType<typeof normalizeBookReference>>,
): boolean {
  // The account lock serializes transitions, but a queued request can acquire it after its owner changed.
  if (!input.ownerUserId || !input.isOwnerCurrent()) return false;

  const state = input.getCurrentState();
  const availability = resolveBookAvailability({
    bookHash,
    library: state.library,
    libraryLoaded: state.libraryLoaded,
    libraryReconciliationSettled: state.libraryReconciliationSettled,
  });
  if (availability.state !== 'absent') return false;
  if (state.transfers.some((transfer) => isTransferBlockingCleanup(transfer, bookHash))) {
    return false;
  }

  return !state.openReaderBookKeys.some(
    (bookKey) => parseBookRefFromReaderBookKey(bookKey) === normalizedBookRef,
  );
}

async function evictDirectories(
  appService: AppService,
  bookHash: string,
  canEvict: () => boolean,
): Promise<{ complete: boolean; failed: boolean; bytesReclaimed: number }> {
  const targets: DirectoryTarget[] = [
    { path: bookHash, base: 'Books' },
    { path: `search/${bookHash}`, base: 'Cache' },
  ];
  let bytesReclaimed = 0;

  try {
    for (const target of targets) {
      if (!canEvict()) return { complete: false, failed: false, bytesReclaimed };
      const directory = await inspectDirectory(appService, target);
      if (!canEvict()) return { complete: false, failed: false, bytesReclaimed };
      if (directory.exists) {
        await appService.deleteDir(target.path, target.base, true);
        bytesReclaimed += directory.bytes;
      }
    }
  } catch {
    return { complete: false, failed: true, bytesReclaimed };
  }

  return { complete: canEvict(), failed: false, bytesReclaimed };
}

async function cleanupDeletedBookArtifactsUnlocked(
  input: CleanupInput,
): Promise<DeletedBookArtifactCleanupSummary> {
  const candidates = input.library.filter((book) => Boolean(book.deletedAt));
  const summary: DeletedBookArtifactCleanupSummary = {
    candidates: candidates.length,
    evicted: 0,
    retained: 0,
    failed: 0,
    bytesReclaimed: 0,
    localStorageKeysRemoved: 0,
    evictedBookHashes: [],
  };

  for (const book of candidates) {
    const normalizedBookRef = normalizeBookReference(book.hash);
    if (!normalizedBookRef) {
      summary.retained += 1;
      continue;
    }

    const canEvict = () => canEvictBook(input, book.hash, normalizedBookRef);
    if (!canEvict()) {
      summary.retained += 1;
      continue;
    }

    const result = await evictDirectories(input.appService, book.hash, canEvict);
    summary.bytesReclaimed += result.bytesReclaimed;
    if (result.failed) {
      summary.failed += 1;
      continue;
    }
    if (!result.complete || !canEvict()) {
      summary.retained += 1;
      continue;
    }

    try {
      if (!canEvict()) {
        summary.retained += 1;
        continue;
      }
      let chatEvictionStarted = false;
      try {
        const chatDeleted = await aiStore.deleteBookConversations(book.hash, canEvict, () => {
          beginBookChatEviction(book.hash);
          chatEvictionStarted = true;
        });
        if (!chatDeleted || !canEvict()) {
          summary.retained += 1;
          continue;
        }
        useAIChatStore.getState().clearBookChatState(book.hash);
      } finally {
        if (chatEvictionStarted) finishBookChatEviction(book.hash);
      }
      summary.localStorageKeysRemoved += removeBookLocalPersistence(
        normalizedBookRef,
        input.storage,
      );
      useBookDataStore.getState().clearBookDataByRef(normalizedBookRef);
      summary.evicted += 1;
      summary.evictedBookHashes.push(book.hash);
    } catch {
      summary.failed += 1;
    }
  }

  logger.info('Deleted-book local artifact cleanup pass', summary);
  return summary;
}

export function cleanupDeletedBookArtifacts(
  input: CleanupInput,
): Promise<DeletedBookArtifactCleanupSummary> {
  return runAccountLibraryMutation(() => cleanupDeletedBookArtifactsUnlocked(input));
}
