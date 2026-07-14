import {
  createCatalogBookRef,
  isCatalogAddFailureCode,
  type CatalogAddRequestResponse,
} from '@openread/types';
import { platform } from '@/services/platform/client';
import { LOCAL_PERSISTENCE_PREFIXES } from '@/services/persistence/localPersistenceRegistry';
import { syncWorker } from '@/services/sync/syncWorker';
import { useCatalogAddStore } from '@/store/catalogAddStore';
import { useLibraryStore } from '@/store/libraryStore';
import { eventDispatcher } from '@/utils/event';
import { createLogger } from '@/utils/logger';

const logger = createLogger('catalog-add');
const STORAGE_PREFIX = LOCAL_PERSISTENCE_PREFIXES.catalogAdd;
const POLL_DELAYS = [500, 1_000, 2_000, 4_000, 8_000] as const;
const POLL_REQUEST_TIMEOUT_MS = 15_000;
const CATALOG_BOOK_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9:._-]{0,159}$/;
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9:._-]{8,128}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type PendingAdd = { idempotencyKey: string; addRequestId?: string };
type PendingAdds = Record<string, PendingAdd>;
type ActivePoll = { controller: AbortController; promise: Promise<void> };

let activeUserId: string | null = null;
const activePolls = new Map<string, ActivePoll>();

function registryKey(userId: string): string {
  return `${STORAGE_PREFIX}${userId}`;
}

function readRegistry(userId: string): PendingAdds {
  if (typeof window === 'undefined') return {};
  try {
    const value = JSON.parse(window.localStorage.getItem(registryKey(userId)) ?? '{}') as unknown;
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    const registry: PendingAdds = {};
    let discarded = false;
    for (const [catalogBookId, candidate] of Object.entries(value)) {
      if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
        discarded = true;
        continue;
      }
      const pending = candidate as Record<string, unknown>;
      const idempotencyKey = pending.idempotencyKey;
      const addRequestId = pending.addRequestId;
      if (
        !CATALOG_BOOK_ID_PATTERN.test(catalogBookId) ||
        typeof idempotencyKey !== 'string' ||
        !IDEMPOTENCY_KEY_PATTERN.test(idempotencyKey) ||
        (addRequestId !== undefined &&
          (typeof addRequestId !== 'string' || !UUID_PATTERN.test(addRequestId)))
      ) {
        discarded = true;
        continue;
      }
      registry[catalogBookId] = { idempotencyKey, ...(addRequestId ? { addRequestId } : {}) };
    }
    if (discarded) {
      try {
        window.localStorage.setItem(registryKey(userId), JSON.stringify(registry));
      } catch {
        // The validated in-memory registry remains usable when persistence is unavailable.
      }
    }
    return registry;
  } catch {
    return {};
  }
}

function writeRegistry(userId: string, registry: PendingAdds): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(registryKey(userId), JSON.stringify(registry));
  } catch (error) {
    logger.warn('Unable to persist Catalog Add resume state', { error });
  }
}

function removePending(userId: string, catalogBookId: string): void {
  const registry = readRegistry(userId);
  delete registry[catalogBookId];
  writeRegistry(userId, registry);
}

function pollKey(userId: string, catalogBookId: string): string {
  return `${userId}:${catalogBookId}`;
}

function wait(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise<void>((resolve) => {
    const timeout = window.setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        window.clearTimeout(timeout);
        resolve();
      },
      { once: true },
    );
  });
}

export function catalogAddFailureMessage(failureCode: unknown): string {
  return isCatalogAddFailureCode(failureCode) ? failureCode : 'Catalog Add failed';
}

function visibleCanonicalBook(bookHash: string): boolean {
  return useLibraryStore
    .getState()
    .library.some((book) => book.hash === bookHash && !book.deletedAt);
}

async function syncCanonicalBook(
  catalogBookId: string,
  bookHash: string,
  signal: AbortSignal,
): Promise<void> {
  let lastError: unknown;
  for (const delay of [0, 1_000, 2_000, 4_000] as const) {
    if (delay) await wait(delay, signal);
    if (signal.aborted) return;
    try {
      await syncWorker.pullNow('books');
      if (visibleCanonicalBook(bookHash)) return;
    } catch (error) {
      lastError = error;
      logger.warn('Catalog Add library sync failed', { catalogBookId, error });
    }
  }
  if (lastError instanceof Error) throw lastError;
  throw new Error(
    'Book was added, but Library sync has not made it visible yet. Please try again.',
  );
}

export function activateCatalogAddUser(userId: string | null): void {
  if (activeUserId === userId) return;
  for (const poll of activePolls.values()) poll.controller.abort();
  activePolls.clear();
  activeUserId = userId;
  useCatalogAddStore.getState().activateUser(userId);
}

async function getAddRequestWithTimeout(
  addRequestId: string,
  signal: AbortSignal,
): Promise<CatalogAddRequestResponse> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal.addEventListener('abort', abort, { once: true });
  const timeout = window.setTimeout(abort, POLL_REQUEST_TIMEOUT_MS);
  try {
    return await platform.catalog.getAddRequest(addRequestId, { signal: controller.signal });
  } finally {
    window.clearTimeout(timeout);
    signal.removeEventListener('abort', abort);
  }
}

async function runPoll(
  userId: string,
  catalogBookId: string,
  pending: PendingAdd,
  initial: CatalogAddRequestResponse | null,
  signal: AbortSignal,
): Promise<void> {
  let response = initial;
  let attempt = 0;
  while (true) {
    if (activeUserId !== userId || signal.aborted) return;
    if (!response) {
      if (!pending.addRequestId) return;
      try {
        response = await getAddRequestWithTimeout(pending.addRequestId, signal);
      } catch (error) {
        if (activeUserId !== userId || signal.aborted) return;
        logger.warn('Catalog Add status poll failed; retrying durable request', {
          catalogBookId,
          error,
        });
        useCatalogAddStore.getState().update(catalogBookId, {
          status: 'importing',
          phase: 'materializing',
          progress: Math.min(90, 20 + attempt),
          statusMessage: 'Waiting for Catalog Service...',
        });
        await wait(POLL_DELAYS[Math.min(attempt, POLL_DELAYS.length - 1)]!, signal);
        attempt += 1;
        continue;
      }
    }
    const current = response;
    if (current.state === 'failed') {
      removePending(userId, catalogBookId);
      const message = catalogAddFailureMessage(current.failureCode);
      if (message === 'Catalog Add failed') {
        logger.error('Catalog Add returned an unknown failure code', {
          catalogBookId,
          failureCode: current.failureCode,
        });
      }
      throw new Error(message);
    }
    if (current.state === 'ready') {
      if (!current.bookHash || current.bookHash !== createCatalogBookRef(catalogBookId)) {
        throw new Error('Catalog Add completed without the canonical Library book reference.');
      }
      useCatalogAddStore.getState().update(catalogBookId, {
        status: 'importing',
        phase: 'syncing',
        progress: 95,
        statusMessage: 'Updating Library...',
      });
      await syncCanonicalBook(catalogBookId, current.bookHash, signal);
      if (activeUserId !== userId || signal.aborted) return;
      removePending(userId, catalogBookId);
      useCatalogAddStore.getState().update(catalogBookId, {
        status: 'ready',
        phase: 'opening',
        progress: 100,
        statusMessage: 'Ready to open',
        bookId: current.finalBookId,
        bookHash: current.bookHash,
      });
      eventDispatcher.dispatch('toast', { message: 'Book added to your library', type: 'success' });
      return;
    }
    useCatalogAddStore.getState().update(catalogBookId, {
      status: 'importing',
      phase: 'materializing',
      progress: Math.min(90, 20 + attempt),
      statusMessage: 'Preparing book...',
    });
    await wait(POLL_DELAYS[Math.min(attempt, POLL_DELAYS.length - 1)]!, signal);
    attempt += 1;
    response = null;
  }
}

function coordinatePoll(
  userId: string,
  catalogBookId: string,
  pending: PendingAdd,
  initial: CatalogAddRequestResponse | null,
): Promise<void> {
  const key = pollKey(userId, catalogBookId);
  const existing = activePolls.get(key);
  if (existing) return existing.promise;
  const controller = new AbortController();
  const promise = runPoll(userId, catalogBookId, pending, initial, controller.signal)
    .catch((error) => {
      if (controller.signal.aborted || activeUserId !== userId) return;
      const message = error instanceof Error ? error.message : 'Catalog Add failed';
      useCatalogAddStore
        .getState()
        .update(catalogBookId, { status: 'error', progress: 0, error: message });
      eventDispatcher.dispatch('toast', { message, type: 'error' });
      throw error;
    })
    .finally(() => {
      if (activePolls.get(key)?.controller === controller) activePolls.delete(key);
    });
  activePolls.set(key, { controller, promise });
  return promise;
}

export function resumeCatalogAdds(userId: string): void {
  activateCatalogAddUser(userId);
  for (const [catalogBookId, pending] of Object.entries(readRegistry(userId))) {
    if (!pending.addRequestId) {
      void startCatalogAdd(userId, catalogBookId).catch(() => undefined);
      continue;
    }
    useCatalogAddStore.getState().update(catalogBookId, {
      status: 'importing',
      phase: 'materializing',
      progress: 20,
      statusMessage: 'Resuming Add...',
    });
    void coordinatePoll(userId, catalogBookId, pending, null).catch(() => undefined);
  }
}

async function runCatalogAdd(
  userId: string,
  catalogBookId: string,
  signal: AbortSignal,
): Promise<void> {
  const registry = readRegistry(userId);
  const pending = registry[catalogBookId] ?? {
    idempotencyKey: `catalog-add:${userId}:${catalogBookId}:${crypto.randomUUID()}`,
  };
  registry[catalogBookId] = pending;
  writeRegistry(userId, registry);
  useCatalogAddStore.getState().update(catalogBookId, {
    status: 'importing',
    progress: 5,
    phase: 'requesting_add',
    statusMessage: 'Preparing Add...',
    error: undefined,
  });
  let response: CatalogAddRequestResponse | null = null;
  if (!pending.addRequestId) {
    response = await platform.catalog.importBook(catalogBookId, {
      headers: { 'Idempotency-Key': pending.idempotencyKey },
      signal,
    });
    if (signal.aborted || activeUserId !== userId) return;
    pending.addRequestId = response.addRequestId;
    registry[catalogBookId] = pending;
    writeRegistry(userId, registry);
  }
  await runPoll(userId, catalogBookId, pending, response, signal);
}

export function startCatalogAdd(userId: string, catalogBookId: string): Promise<void> {
  activateCatalogAddUser(userId);
  const key = pollKey(userId, catalogBookId);
  const existing = activePolls.get(key);
  if (existing) return existing.promise;
  const controller = new AbortController();
  const promise = runCatalogAdd(userId, catalogBookId, controller.signal)
    .catch((error) => {
      if (controller.signal.aborted || activeUserId !== userId) return;
      const message = error instanceof Error ? error.message : 'Catalog Add failed';
      logger.error('Catalog Add failed', { catalogBookId, error });
      useCatalogAddStore
        .getState()
        .update(catalogBookId, { status: 'error', progress: 0, error: message });
      eventDispatcher.dispatch('toast', { message, type: 'error' });
      throw error;
    })
    .finally(() => {
      if (activePolls.get(key)?.controller === controller) activePolls.delete(key);
    });
  activePolls.set(key, { controller, promise });
  return promise;
}

export function resetCatalogAdd(userId: string, catalogBookId: string): void {
  const key = pollKey(userId, catalogBookId);
  activePolls.get(key)?.controller.abort();
  activePolls.delete(key);
  removePending(userId, catalogBookId);
  useCatalogAddStore.getState().reset(catalogBookId);
}
