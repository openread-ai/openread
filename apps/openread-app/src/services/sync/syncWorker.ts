/**
 * @module services/sync/syncWorker
 * P9.22: Background sync worker that drains the canonical durable outbox.
 *
 * - Runs on demand and through fallback polling when Realtime is unavailable
 * - Pauses when offline, resumes on reconnection
 * - Uses the canonical SyncEngine for all app-side outbox mutations
 * - Single source of truth for all sync operations and watermarks
 */

import type { SyncMutation, SyncTombstone } from '@openread/sync';

import { createBackendSyncTransport } from './backendTransport';
import { SyncEngine, type SyncDrainResult } from './engine';
import { SyncClient, type CollectionRecord, type SyncType } from '@/libs/sync';
import { supabase } from '@/utils/supabase';
import {
  transformBookFromDB,
  transformBookConfigFromDB,
  transformBookNoteFromDB,
  applyRoamingSettings,
} from '@/utils/transform';
import { useLibraryStore } from '@/store/libraryStore';
import { useBookDataStore } from '@/store/bookDataStore';
import { useSettingsStore } from '@/store/settingsStore';
import envConfig from '@/services/environment';
import type { BookConfig, BookDataRecord } from '@/types/book';
import type { DBBook, DBBookConfig, DBBookNote } from '@/types/records';
import type { SystemSettings } from '@/types/settings';
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseClient } from '@/utils/supabase';
import { getAccessToken } from '@/utils/access';
import { getPlatformFetch } from '@/utils/fetch';
import type { AIConversation, AIMessage } from '@/services/ai/types';
import { aiStore } from '@/services/ai/storage/aiStore';
import { useAIChatStore } from '@/store/aiChatStore';
import { isSyncableLibraryBookHash } from '@/utils/bookHash';
import { getDeviceId } from '@/services/deviceService';
import {
  buildAIConversationMutation,
  buildAIMessageMutation,
  buildCollectionMutations,
  buildSettingsMutation,
} from './adapters';

/** Supabase row shape for ai_conversations table */
interface SupabaseAIConversation {
  id: string;
  user_id: string;
  book_hash: string;
  title: string;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
  // TODO: parallel_book_hashes?: string[] | null; — add once Supabase column exists
}

/** Supabase row shape for ai_messages table */
interface SupabaseAIMessage {
  id: string;
  conversation_id: string;
  user_id: string;
  role: string;
  content: string;
  created_at: string;
}

const LIBRARY_OWNER_STORAGE_KEY = 'openread_library_owner_user_id';
const RECONCILE_RETRY_DELAYS_MS = [500, 1_500] as const;

/** Realtime broadcast event names for cross-device sync */
export const SYNC_EVENTS = {
  BOOKS: 'books-changed',
  CONFIGS: 'configs-changed',
  NOTES: 'notes-changed',
  SETTINGS: 'settings-changed',
  AI_CONVERSATIONS: 'ai-conversations-changed',
} as const;

/** Fallback polling interval — only used if Realtime WebSocket fails */
const SYNC_FALLBACK_INTERVAL_MS = 30_000;

/** Check if the browser is offline. */
function isOffline(): boolean {
  return typeof navigator !== 'undefined' && !navigator.onLine;
}

/** Compute the max timestamp from an array of DB records (updated_at / deleted_at). */
function computeMaxTimestamp(records: BookDataRecord[]): number {
  let maxTime = 0;
  for (const rec of records) {
    if (rec.updated_at) {
      maxTime = Math.max(maxTime, new Date(rec.updated_at).getTime());
    }
    if (rec.deleted_at) {
      maxTime = Math.max(maxTime, new Date(rec.deleted_at).getTime());
    }
  }
  return maxTime;
}

function tombstoneTimestamp(tombstone: SyncTombstone): number {
  return Math.max(tombstone.serverUpdatedAt, tombstone.deletedAt);
}

function computeMaxTombstoneTimestamp(tombstones: SyncTombstone[]): number {
  return tombstones.reduce(
    (maxTime, tombstone) => Math.max(maxTime, tombstoneTimestamp(tombstone)),
    0,
  );
}

function parseBookNoteEntityId(entityId: string): { bookHash: string; noteId: string } | null {
  const separatorIndex = entityId.indexOf(':');
  if (separatorIndex <= 0 || separatorIndex === entityId.length - 1) return null;
  return {
    bookHash: entityId.slice(0, separatorIndex),
    noteId: entityId.slice(separatorIndex + 1),
  };
}

function configDeletePatch(bookHash: string, deletedAt: number): Partial<BookConfig> {
  return {
    bookHash,
    progress: undefined,
    location: undefined,
    xpointer: undefined,
    searchConfig: undefined,
    viewSettings: undefined,
    updatedAt: deletedAt,
  };
}

/**
 * Persist watermark updates to the settings store.
 * Creates a new object (immutable) and saves locally without triggering a push.
 */
function resetAccountScopedWatermarks(settings: SystemSettings): SystemSettings {
  return {
    ...settings,
    lastSyncedAtBooks: 0,
    lastSyncedAtConfigs: 0,
    lastSyncedAtNotes: 0,
    lastSyncedAtSettings: 0,
  };
}

async function saveWatermarks(updates: Partial<SystemSettings>): Promise<void> {
  const settings = { ...useSettingsStore.getState().settings, ...updates };
  useSettingsStore.getState().setSettings(settings);
  // Save locally only — no push to avoid recursion and redundant network calls.
  // Watermarks are per-device and excluded from roaming settings.
  const appService = await envConfig.getAppService();
  await appService.saveSettings(settings);
}

function isTransientSyncError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /Failed to fetch|AbortError|timeout|network/i.test(message);
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function waitForLibraryLoaded(timeoutMs = 5_000): Promise<boolean> {
  if (useLibraryStore.getState().libraryLoaded) return Promise.resolve(true);

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      unsubscribe();
      resolve(false);
    }, timeoutMs);
    const unsubscribe = useLibraryStore.subscribe((state) => {
      if (!state.libraryLoaded) return;
      clearTimeout(timeout);
      unsubscribe();
      resolve(true);
    });
  });
}

type SyncableCollection = CollectionRecord;

/**
 * Merge local and remote collections using per-collection LWW.
 * New collections from either side are added; conflicts resolved by updatedAt.
 */
function mergeCollections(
  local: SyncableCollection[],
  remote: SyncableCollection[],
): SyncableCollection[] {
  const localMap = new Map(local.map((c) => [c.id, c]));
  for (const r of remote) {
    if (!r.id) continue;
    const l = localMap.get(r.id);
    if (!l) {
      localMap.set(r.id, r);
    } else if (
      Math.max(r.updatedAt ?? 0, r.deletedAt ?? 0) > Math.max(l.updatedAt ?? 0, l.deletedAt ?? 0)
    ) {
      localMap.set(r.id, r);
    }
  }
  return Array.from(localMap.values()).filter((c) => !c.deletedAt);
}

export interface SyncWorkerStatus {
  pending: number;
  syncing: boolean;
  lastDrainResult: { synced: number; failed: number; remaining: number } | null;
  lastSyncAt: number;
  error: string | null;
}

/**
 * Background sync worker.
 * Call start() to begin periodic queue draining.
 */
/**
 * Coalescing guard: prevents concurrent runs of an async operation while
 * ensuring at most one queued re-run when a request arrives mid-execution.
 * Returns { run, requestRerun, reset } — call reset() in stop() teardown.
 */
function createCoalescingGuard() {
  let busy = false;
  let pending = false;
  return {
    /** Try to enter. Returns true if caller should proceed, false if already busy (re-run queued). */
    tryEnter(): boolean {
      if (busy) {
        pending = true;
        return false;
      }
      busy = true;
      return true;
    },
    /** Call in finally block. Returns true if a re-run was requested while busy. */
    exit(): boolean {
      busy = false;
      if (pending) {
        pending = false;
        return true;
      }
      return false;
    },
    /** Reset state on teardown (stop). */
    reset() {
      busy = false;
      pending = false;
    },
  };
}

export class SyncWorker {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private drainGuard = createCoalescingGuard();
  private aiPullGuard = createCoalescingGuard();
  private reconcileRun: Promise<void> | null = null;
  private reconcileRerunRequested = false;
  private syncClient = new SyncClient();
  private canonicalEngine: SyncEngine | null = null;
  private realtimeChannel: RealtimeChannel | null = null;
  private userId: string | null = null;
  /** When true, all new sync operations are suppressed (set by stop()). */
  private stopped = true;
  /** Cached authenticated Supabase client — avoids creating a new GoTrueClient on every call. */
  private cachedSupabase: { client: SupabaseClient; token: string } | null = null;
  private _status: SyncWorkerStatus = {
    pending: 0,
    syncing: false,
    lastDrainResult: null,
    lastSyncAt: 0,
    error: null,
  };
  private listeners = new Set<(status: SyncWorkerStatus) => void>();

  /**
   * Start the background sync worker.
   * Drains the queue immediately, then every SYNC_INTERVAL_MS.
   * Subscribes to Supabase Realtime for instant cross-device sync.
   */
  start(userId?: string): void {
    const nextUserId = userId ?? null;
    const previousUserId = this.userId;
    if (!this.stopped && previousUserId === nextUserId) return; // Already started for this account
    if (!this.stopped) this.stop();
    const persistedOwnerUserId =
      typeof window !== 'undefined' ? localStorage.getItem(LIBRARY_OWNER_STORAGE_KEY) : null;
    const accountChanged =
      Boolean(previousUserId && previousUserId !== nextUserId) ||
      Boolean(nextUserId && persistedOwnerUserId && persistedOwnerUserId !== nextUserId);
    if (accountChanged) {
      useLibraryStore.getState().setLibrary([]);
      void import('@/store/platformSidebarStore').then(({ usePlatformSidebarStore }) => {
        usePlatformSidebarStore.getState().resetAccountScopedCollections();
      });
      const currentSettings = useSettingsStore.getState().settings;
      const resetSettings = Object.keys(currentSettings).length
        ? resetAccountScopedWatermarks(currentSettings)
        : null;
      if (resetSettings) {
        useSettingsStore.getState().setSettings(resetSettings);
      }
      if (typeof window !== 'undefined' && nextUserId) {
        localStorage.setItem(LIBRARY_OWNER_STORAGE_KEY, nextUserId);
      }
      void envConfig
        .getAppService()
        .then(async (appService) => {
          await Promise.all([
            appService.saveLibraryBooks([]),
            resetSettings ? appService.saveSettings(resetSettings) : Promise.resolve(),
          ]);
        })
        .catch((error) => console.warn('[SyncWorker] Failed to clear account-scoped state', error));
    }

    this.stopped = false;
    this.userId = nextUserId;
    this.canonicalEngine = nextUserId
      ? new SyncEngine({
          userId: nextUserId,
          deviceId: getDeviceId(),
          transport: createBackendSyncTransport(),
        })
      : null;
    // Listen to online/offline events
    if (typeof window !== 'undefined') {
      window.addEventListener('online', this.handleOnline);
      window.addEventListener('offline', this.handleOffline);
    }

    // Subscribe to Supabase Realtime broadcast for instant sync.
    // Primary sync mechanism — triggers immediately when another device pushes changes.
    if (this.userId) {
      try {
        this.realtimeChannel = supabase
          .channel(`sync:${this.userId}`)
          .on('broadcast', { event: SYNC_EVENTS.BOOKS }, () => {
            this.reconcileBooks();
          })
          .on('broadcast', { event: SYNC_EVENTS.CONFIGS }, () => {
            this.pullRemoteConfigs();
          })
          .on('broadcast', { event: SYNC_EVENTS.NOTES }, () => {
            this.pullRemoteNotes();
          })
          .on('broadcast', { event: SYNC_EVENTS.SETTINGS }, () => {
            this.pullRemoteSettings();
          })
          .on('broadcast', { event: SYNC_EVENTS.AI_CONVERSATIONS }, () => {
            this.pullRemoteAIConversations();
          })
          .subscribe((status) => {
            if (status === 'SUBSCRIBED') {
              console.log('[SyncWorker] Realtime connected — polling disabled');
            } else if (status === 'CHANNEL_ERROR') {
              console.warn('[SyncWorker] Realtime failed — enabling fallback polling');
              this.startFallbackPolling();
            }
          });
      } catch {
        console.warn('[SyncWorker] Realtime unavailable — enabling fallback polling');
        this.realtimeChannel = null;
        this.startFallbackPolling();
      }
    }

    // Hydrate books immediately on startup. Do not let stale offline queue pushes
    // block the remote Library pull for a fresh browser/webview session.
    this.reconcileBooks();
    this.runSyncCycle();
  }

  /**
   * Stop the background sync worker.
   */
  stop(): void {
    this.stopped = true;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    if (this.realtimeChannel) {
      supabase.removeChannel(this.realtimeChannel);
      this.realtimeChannel = null;
    }
    this.userId = null;
    this.canonicalEngine = null;
    this.cachedSupabase = null;
    this.drainGuard.reset();
    this.reconcileRun = null;
    this.reconcileRerunRequested = false;
    this.aiPullGuard.reset();
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', this.handleOnline);
      window.removeEventListener('offline', this.handleOffline);
    }
  }

  /**
   * Manually trigger a drain (e.g., after enqueuing a delete).
   * If a drain is already running, schedules a re-drain so the new item
   * isn't stuck waiting for the next periodic cycle.
   */
  async syncNow(): Promise<void> {
    // drainQueue uses drainGuard internally — if already running,
    // tryEnter() queues a re-run instead of silently dropping.
    await this.drainQueue();
  }

  /**
   * Get current status.
   */
  get status(): SyncWorkerStatus {
    return { ...this._status };
  }

  get currentUserId(): string | null {
    return this.userId;
  }

  private async enqueueCanonicalMutations(mutations: SyncMutation[]): Promise<void> {
    if (!this.canonicalEngine || !this.userId || mutations.length === 0) return;
    for (const mutation of mutations) {
      await this.canonicalEngine.enqueue(mutation);
    }
    await this.syncNow();
  }

  /**
   * Subscribe to status changes.
   */
  subscribe(callback: (status: SyncWorkerStatus) => void): () => void {
    this.listeners.add(callback);
    callback(this._status);
    return () => this.listeners.delete(callback);
  }

  /**
   * Pull on demand. Components call this instead of using SyncClient directly.
   */
  async pullNow(type?: SyncType): Promise<void> {
    if (type === 'books') {
      await this.reconcileBooks();
    } else if (type === 'configs') {
      await this.pullRemoteConfigs();
    } else if (type === 'notes') {
      await this.pullRemoteNotes();
    } else if (type === 'settings') {
      await this.pullRemoteSettings();
    } else {
      await this.runSyncCycle();
    }
  }

  /**
   * Enqueue the current settings through the canonical outbox.
   */
  async pushSettings(): Promise<void> {
    if (!this.userId) return;

    try {
      const settings = useSettingsStore.getState().settings;
      await this.enqueueCanonicalMutations([
        buildSettingsMutation(settings, { userId: this.userId, deviceId: getDeviceId() }),
      ]);
    } catch (error) {
      console.error('[SyncWorker] Push settings failed:', error);
    }
  }

  /**
   * Enqueue current collections through the canonical outbox.
   */
  async pushCollections(): Promise<void> {
    if (!this.userId) return;

    try {
      const { usePlatformSidebarStore } = await import('@/store/platformSidebarStore');
      const collections = usePlatformSidebarStore.getState().collections;
      await this.enqueueCanonicalMutations(
        buildCollectionMutations(collections, { userId: this.userId, deviceId: getDeviceId() }),
      );
    } catch (error) {
      console.error('[SyncWorker] Push collections failed:', error);
    }
  }

  /**
   * Get an authenticated Supabase client for direct table access.
   * Caches the client and only recreates if the token changes.
   */
  private async getAuthenticatedSupabase(): Promise<SupabaseClient | null> {
    const token = await getAccessToken();
    if (!token) return null;
    if (this.cachedSupabase && this.cachedSupabase.token === token) {
      return this.cachedSupabase.client;
    }
    // Pass platform-aware fetch so Supabase queries work on iOS
    // (WKWebView blocks cross-origin requests without native HTTP layer).
    const customFetch = await getPlatformFetch();
    const client = createSupabaseClient(token, customFetch);
    this.cachedSupabase = { client, token };
    return client;
  }

  /**
   * Enqueue an AI conversation mutation through the canonical outbox.
   */
  async pushAIConversation(conversation: AIConversation): Promise<void> {
    if (!this.userId) return;

    try {
      await this.enqueueCanonicalMutations([
        buildAIConversationMutation(conversation, { userId: this.userId, deviceId: getDeviceId() }),
      ]);
    } catch (error) {
      console.error('[SyncWorker] Push AI conversation error:', error);
    }
  }

  /**
   * Enqueue an AI message mutation through the canonical outbox.
   */
  async pushAIMessage(message: AIMessage): Promise<void> {
    if (!this.userId) return;

    try {
      await this.enqueueCanonicalMutations([
        buildAIMessageMutation(message, { userId: this.userId, deviceId: getDeviceId() }),
      ]);
    } catch (error) {
      console.error('[SyncWorker] Push AI message error:', error);
    }
  }

  /**
   * Start fallback polling (only when Realtime WebSocket fails).
   */
  private startFallbackPolling(): void {
    if (this.intervalId) return;
    this.intervalId = setInterval(() => this.runSyncCycle(), SYNC_FALLBACK_INTERVAL_MS);
  }

  private handleOnline = (): void => {
    // Resume: drain immediately when coming back online
    this.drainQueue();
  };

  private handleOffline = (): void => {
    // Nothing to do — drainQueue checks navigator.onLine
    this.updateStatus({ error: 'Offline — changes will sync when connected' });
  };

  /**
   * Process all pending canonical outbox mutations.
   */
  private async drainQueue(): Promise<void> {
    if (isOffline()) {
      const canonicalPending = await this.canonicalPendingCount();
      this.updateStatus({ pending: canonicalPending });
      return;
    }

    if (!this.drainGuard.tryEnter()) return;
    this.updateStatus({ syncing: true, error: null });

    try {
      const canonicalResult = await this.drainCanonicalOutbox();
      const canonicalFailed = canonicalResult.failed + canonicalResult.conflicted;
      const result = {
        synced: canonicalResult.accepted,
        failed: canonicalFailed,
        remaining: canonicalResult.remaining,
      };

      this.updateStatus({
        syncing: false,
        pending: result.remaining,
        lastDrainResult: result,
        lastSyncAt: result.failed === 0 ? Date.now() : this._status.lastSyncAt,
        error: result.failed > 0 ? `${result.failed} items failed to sync` : null,
      });
      if (canonicalResult.accepted > 0 || canonicalResult.conflicted > 0) {
        this.broadcast(SYNC_EVENTS.BOOKS);
        this.broadcast(SYNC_EVENTS.CONFIGS);
        this.broadcast(SYNC_EVENTS.NOTES);
        this.broadcast(SYNC_EVENTS.SETTINGS);
        this.broadcast(SYNC_EVENTS.AI_CONVERSATIONS);
      }
      // After pushing changes, reconcile to pick up cross-device updates
      if (result.synced > 0) {
        this.reconcileBooks();
      }
    } catch (error) {
      this.updateStatus({
        syncing: false,
        error: error instanceof Error ? error.message : 'Sync failed',
      });
    } finally {
      if (this.drainGuard.exit()) {
        this.drainQueue();
      }
    }
  }

  private async drainCanonicalOutbox(): Promise<SyncDrainResult> {
    if (!this.canonicalEngine) {
      return { attempted: 0, accepted: 0, conflicted: 0, failed: 0, remaining: 0 };
    }
    return this.canonicalEngine.drainOnce();
  }

  private async canonicalPendingCount(): Promise<number> {
    if (!this.canonicalEngine) return 0;
    try {
      return await this.canonicalEngine.pendingCount();
    } catch (error) {
      console.warn('[SyncWorker] Failed to read canonical outbox pending count:', error);
      return 0;
    }
  }

  /**
   * Periodic sync: drain canonical outbox, reconcile books, pull configs/notes/settings/AI.
   * Books always use reconciliation (watermark can't detect deletions).
   * Configs/notes/settings use canonical backend pull watermarks.
   * AI conversations pulled directly from Supabase (no-op if no book is active).
   */
  private async runSyncCycle(): Promise<void> {
    if (this.stopped) return;
    await this.drainQueue();
    await Promise.all([
      this.reconcileBooks(),
      this.pullRemoteConfigs(),
      this.pullRemoteNotes(),
      this.pullRemoteSettings(),
      this.pullRemoteAIConversations(),
    ]);
  }

  /**
   * Pull the complete remote book set when the visible local Library is empty.
   *
   * This gives a fresh browser or webview a fast hydration path before the slower
   * hash-reconcile POST path has to push local inventory or drain pending mutations.
   */
  private async pullAllRemoteBooksIfVisibleLibraryEmpty(reconcileUserId: string | null) {
    if (useLibraryStore.getState().getVisibleLibrary().length > 0) return;

    let result = null;
    for (let attempt = 0; attempt <= RECONCILE_RETRY_DELAYS_MS.length; attempt += 1) {
      try {
        result = await this.syncClient.pullChanges(0, 'books');
        break;
      } catch (error) {
        const retryDelay = RECONCILE_RETRY_DELAYS_MS[attempt];
        if (this.stopped || !retryDelay || !isTransientSyncError(error)) throw error;
        await wait(retryDelay);
      }
    }

    if (!result || this.stopped || this.userId !== reconcileUserId) return;
    if (result.books?.length) {
      const books = result.books.map((b) => transformBookFromDB(b as unknown as DBBook));
      await useLibraryStore.getState().updateBooks(envConfig, books);
      await this.downloadMissingCovers();
    }
  }

  /**
   * Full hash-based reconciliation for books.
   * Sends full local inventory; server returns diff (upserts + removals).
   * Used on startup, after pushes, and on Realtime events — not every 10s.
   */
  private reconcileBooks(): Promise<void> {
    if (this.stopped || isOffline()) return Promise.resolve();

    this.reconcileRerunRequested = true;
    this.reconcileRun ??= this.runBookReconcileQueue().finally(() => {
      this.reconcileRun = null;
    });

    return this.reconcileRun;
  }

  private async runBookReconcileQueue(): Promise<void> {
    while (this.reconcileRerunRequested && !this.stopped && !isOffline()) {
      this.reconcileRerunRequested = false;
      await this.reconcileBooksOnce();
    }
  }

  private async reconcileBooksOnce(): Promise<void> {
    const reconcileUserId = this.userId;
    this.updateStatus({ syncing: true, error: null });

    try {
      await this.pullAllRemoteBooksIfVisibleLibraryEmpty(reconcileUserId);

      // Wait for useLibrary() to load books from disk before comparing local
      // inventory. The empty-remote hydration above is safe before this point:
      // useLibrary() preserves a non-empty in-memory Library instead of
      // overwriting it with stale disk.
      if (!(await waitForLibraryLoaded())) return;

      const library = useLibraryStore.getState().library;
      const localHashes: Record<string, number> = {};
      for (const book of library) {
        if (!isSyncableLibraryBookHash(book.hash)) continue;
        localHashes[book.hash] = Math.max(book.updatedAt || 0, book.deletedAt || 0);
      }

      if (Object.keys(localHashes).length === 0) {
        const result = await this.syncClient.pullChanges(0, 'books');
        if (this.stopped || this.userId !== reconcileUserId) return;
        if (result.books?.length) {
          const books = result.books.map((b) => transformBookFromDB(b as unknown as DBBook));
          await useLibraryStore.getState().updateBooks(envConfig, books);
        }
        await this.downloadMissingCovers();
        this.updateStatus({ syncing: false, error: null, lastSyncAt: Date.now() });
        return;
      }

      let result = null;
      for (let attempt = 0; attempt <= RECONCILE_RETRY_DELAYS_MS.length; attempt += 1) {
        try {
          result = await this.syncClient.pushChanges({
            reconcile: { books: localHashes },
          });
          break;
        } catch (error) {
          const retryDelay = RECONCILE_RETRY_DELAYS_MS[attempt];
          if (this.stopped || !retryDelay || !isTransientSyncError(error)) throw error;
          await wait(retryDelay);
        }
      }
      if (!result) return;
      if (this.stopped || this.userId !== reconcileUserId) return;
      const reconcile = result.reconcile;
      if (!reconcile) return;

      if (reconcile.upsert?.length) {
        const books = reconcile.upsert.map((b) => transformBookFromDB(b as unknown as DBBook));
        await useLibraryStore.getState().updateBooks(envConfig, books);
      }

      if (reconcile.remove?.length) {
        const removeSet = new Set(reconcile.remove);
        const current = useLibraryStore.getState().library;
        const remaining = current.filter((b) => !removeSet.has(b.hash));
        useLibraryStore.getState().setLibrary(remaining);
        const appService = await envConfig.getAppService();
        await appService.saveLibraryBooks(remaining);
      }

      // Download covers AFTER all store mutations are complete.
      // Must be sequential — see docs/epics/sync-fixes/005_cover_sync_race_condition.md
      await this.downloadMissingCovers();
      this.updateStatus({ syncing: false, error: null, lastSyncAt: Date.now() });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Sync failed';
      this.updateStatus({ syncing: false, error: message });
      console.error('[SyncWorker] Reconciliation failed:', error);
    }
  }

  /**
   * Download covers for books that have uploadedAt but no local cover file.
   * Checks ALL library books, not just upserted ones, because uploadedAt
   * may arrive in a later reconciliation cycle after the book was first synced.
   */
  private async downloadMissingCovers(): Promise<void> {
    try {
      const appService = await envConfig.getAppService();
      const { getCoverFilename } = await import('@/utils/book');

      const library = useLibraryStore.getState().library;
      const candidates = library.filter((b) => !b.deletedAt && b.uploadedAt && !b.coverImageUrl);
      const existResults = await Promise.all(
        candidates.map((book) => appService.exists(getCoverFilename(book), 'Books')),
      );
      const needsDownload = candidates.filter((_, i) => !existResults[i]);

      if (needsDownload.length > 0) {
        console.log(
          `[SyncWorker] Downloading covers for ${needsDownload.length} books:`,
          needsDownload.map((b) => b.title),
        );
        try {
          await appService.downloadBookCovers(needsDownload);
        } catch (dlErr) {
          console.error('[SyncWorker] Cover download failed:', dlErr);
          // Don't return — still generate URLs for books that already have files
        }
      }

      // Generate URLs for ALL candidates: both freshly downloaded and books
      // that already have the file locally but no URL. generateCoverImageUrl
      // returns null for books whose files don't exist (safe after download failure).
      const coverUrls = new Map<string, string>();
      await Promise.all(
        candidates.map(async (book) => {
          const coverUrl = await appService.generateCoverImageUrl(book);
          if (coverUrl) {
            coverUrls.set(book.hash, coverUrl);
          }
        }),
      );
      if (coverUrls.size > 0) {
        const currentLib = useLibraryStore.getState().library;
        const updated = currentLib.map((b) => {
          const url = coverUrls.get(b.hash);
          return url ? { ...b, coverImageUrl: url } : b;
        });
        useLibraryStore.getState().setLibrary(updated);
        await appService.saveLibraryBooks(updated);
        console.log(`[SyncWorker] Updated ${coverUrls.size} cover URLs in library`);
      }
    } catch (error) {
      console.error('[SyncWorker] Failed to download covers:', error);
    }
  }

  /**
   * Pull remote config changes and merge into bookDataStore.
   */
  private async pullRemoteConfigs(): Promise<void> {
    if (isOffline()) return;
    if (!useLibraryStore.getState().libraryLoaded) return;

    try {
      const settings = useSettingsStore.getState().settings;
      const since = (settings.lastSyncedAtConfigs ?? 0) + 1;

      const result = await this.syncClient.pullChanges(since, 'configs');
      const dbConfigs = result.configs ?? [];
      const configTombstones =
        result.tombstones?.filter((tombstone) => tombstone.entity === 'bookConfig') ?? [];
      if (!dbConfigs.length && !configTombstones.length) return;

      const configs = dbConfigs.map((c) => transformBookConfigFromDB(c as unknown as DBBookConfig));
      const bookDataStore = useBookDataStore.getState();
      // Build lookup map of active (non-deleted) books to skip orphaned configs
      const library = useLibraryStore.getState().library;
      const bookByHash = new Map(library.map((b) => [b.hash, b]));

      const booksToUpdate: Array<{
        hash: string;
        progress: BookConfig['progress'];
        updatedAt: number;
      }> = [];
      const acceptedConfigRecords: BookDataRecord[] = [];
      const acceptedConfigTombstones: SyncTombstone[] = [];

      for (let index = 0; index < configs.length; index += 1) {
        const config = configs[index]!;
        if (!config.bookHash) continue;
        const book = bookByHash.get(config.bookHash);
        if (!book) continue;
        acceptedConfigRecords.push(dbConfigs[index] as unknown as BookDataRecord);
        const bookKey = `${book.hash}-${book.format}`;
        const existing = bookDataStore.getConfig(bookKey);
        if (!existing || (config.updatedAt ?? 0) >= (existing.updatedAt ?? 0)) {
          const merged = { ...existing, ...config };
          // Discard malformed CFI location strings from remote
          if (merged.location && !merged.location.startsWith('epubcfi(')) {
            delete merged.location;
          }
          bookDataStore.setConfig(bookKey, merged);

          // Also store in pre-synced cache so initViewState can merge the location
          // before FoliateViewer initializes (avoids flash from page 1). See #62.
          bookDataStore.setPreSyncedConfig(config.bookHash, merged);

          // Sync progress from config back to library book for card display
          if (config.progress) {
            booksToUpdate.push({
              hash: book.hash,
              progress: config.progress,
              updatedAt: Date.now(),
            });
          }
        }
      }

      for (const tombstone of configTombstones) {
        const bookHash = tombstone.entityId;
        const book = bookByHash.get(bookHash);
        if (!book) continue;
        const deletedAt = tombstoneTimestamp(tombstone);
        const bookKey = `${book.hash}-${book.format}`;
        const existing = bookDataStore.getConfig(bookKey);
        if (!existing || deletedAt >= (existing.updatedAt ?? 0)) {
          const patch = configDeletePatch(bookHash, deletedAt);
          bookDataStore.setConfig(bookKey, patch);
          bookDataStore.setPreSyncedConfig(bookHash, patch);
        }
        acceptedConfigTombstones.push(tombstone);
      }

      // Batch-update library books with synced progress only.
      // Merge only the changed fields (progress, updatedAt) into current state —
      // never spread a stale full-book snapshot which would clobber fields set
      // concurrently by downloadMissingCovers (e.g., coverImageUrl). See #63.
      if (booksToUpdate.length > 0) {
        const currentLibrary = useLibraryStore.getState().library;
        const updateMap = new Map(booksToUpdate.map((b) => [b.hash, b]));
        const updatedLibrary = currentLibrary.map((b) => {
          const update = updateMap.get(b.hash);
          if (!update) return b;
          return { ...b, progress: update.progress, updatedAt: update.updatedAt };
        });
        useLibraryStore.getState().setLibrary(updatedLibrary);
      }

      const maxTime = Math.max(
        computeMaxTimestamp(acceptedConfigRecords),
        computeMaxTombstoneTimestamp(acceptedConfigTombstones),
      );
      if (maxTime > 0) {
        await saveWatermarks({ lastSyncedAtConfigs: maxTime });
      }
    } catch (error) {
      console.error('[SyncWorker] Pull remote configs failed:', error);
    }
  }

  /**
   * Pull remote note changes and merge into bookDataStore.
   */
  private async pullRemoteNotes(): Promise<void> {
    if (isOffline()) return;
    if (!useLibraryStore.getState().libraryLoaded) return;

    try {
      const settings = useSettingsStore.getState().settings;
      const since = (settings.lastSyncedAtNotes ?? 0) + 1;

      const result = await this.syncClient.pullChanges(since, 'notes');
      const dbNotes = result.notes ?? [];
      const noteTombstones =
        result.tombstones?.filter((tombstone) => tombstone.entity === 'bookNote') ?? [];
      if (!dbNotes.length && !noteTombstones.length) return;

      const notes = dbNotes.map((n) => transformBookNoteFromDB(n as unknown as DBBookNote));
      const bookDataStore = useBookDataStore.getState();

      // Group notes by bookHash
      const notesByBook = new Map<string, typeof notes>();
      for (const note of notes) {
        if (!note.bookHash) continue;
        const existing = notesByBook.get(note.bookHash) ?? [];
        existing.push(note);
        notesByBook.set(note.bookHash, existing);
      }

      // Build lookup map of active (non-deleted) books to skip orphaned notes
      const library = useLibraryStore.getState().library;
      const bookByHash = new Map(library.map((b) => [b.hash, b]));

      const appliedNoteKeys = new Set<string>();
      const appliedNoteTombstones: SyncTombstone[] = [];
      for (const [bookHash, bookNotes] of notesByBook) {
        const book = bookByHash.get(bookHash);
        if (!book) continue;
        const bookKey = `${book.hash}-${book.format}`;
        const config = bookDataStore.getConfig(bookKey);
        if (!config) continue;

        const oldNotes = config.booknotes ?? [];
        const noteIdxMap = new Map(oldNotes.map((n, i) => [n.id, i]));
        const mergedNotes = [...oldNotes];

        for (const note of bookNotes) {
          const idx = noteIdxMap.get(note.id);
          if (idx !== undefined) {
            const remoteTime = Math.max(note.updatedAt ?? 0, note.deletedAt ?? 0);
            const localTime = Math.max(
              mergedNotes[idx]!.updatedAt ?? 0,
              mergedNotes[idx]!.deletedAt ?? 0,
            );
            if (remoteTime > localTime) {
              mergedNotes[idx] = { ...mergedNotes[idx]!, ...note };
            }
          } else {
            mergedNotes.push(note);
          }
        }

        bookDataStore.setConfig(bookKey, { booknotes: mergedNotes });
        bookNotes.forEach((note) => appliedNoteKeys.add(`${note.bookHash}:${note.id}`));
      }

      for (const tombstone of noteTombstones) {
        const parsed = parseBookNoteEntityId(tombstone.entityId);
        if (!parsed) continue;
        const book = bookByHash.get(parsed.bookHash);
        if (!book) continue;
        const bookKey = `${book.hash}-${book.format}`;
        const config = bookDataStore.getConfig(bookKey);
        if (!config) continue;

        const oldNotes = config.booknotes ?? [];
        const idx = oldNotes.findIndex((note) => note.id === parsed.noteId);
        if (idx !== -1) {
          const remoteTime = tombstoneTimestamp(tombstone);
          const localTime = Math.max(oldNotes[idx]!.updatedAt ?? 0, oldNotes[idx]!.deletedAt ?? 0);
          if (remoteTime > localTime) {
            const mergedNotes = [...oldNotes];
            mergedNotes[idx] = {
              ...mergedNotes[idx]!,
              updatedAt: remoteTime,
              deletedAt: tombstone.deletedAt,
            };
            bookDataStore.setConfig(bookKey, { booknotes: mergedNotes });
          }
        }
        appliedNoteTombstones.push(tombstone);
      }

      // Only advance the watermark for records/tombstones actually applied — prevents
      // silently skipping notes on fresh installs where booksData is empty.
      const appliedNoteRecords = (dbNotes as unknown as BookDataRecord[]).filter((note) =>
        appliedNoteKeys.has(`${String(note.book_hash)}:${String(note.id)}`),
      );
      const maxTime = Math.max(
        computeMaxTimestamp(appliedNoteRecords),
        computeMaxTombstoneTimestamp(appliedNoteTombstones),
      );
      if (maxTime > 0) {
        await saveWatermarks({ lastSyncedAtNotes: maxTime });
      }
    } catch (error) {
      console.error('[SyncWorker] Pull remote notes failed:', error);
    }
  }

  /**
   * Pull remote settings and merge roaming fields into local settings.
   */
  private async pullRemoteSettings(): Promise<void> {
    if (isOffline()) return;

    try {
      const settings = useSettingsStore.getState().settings;
      const since = (settings.lastSyncedAtSettings ?? 0) + 1;

      const result = await this.syncClient.pullChanges(since, 'settings');
      const remoteSettings = result.settings;
      const remoteCollections = result.collections ?? [];
      const collectionTombstones =
        result.tombstones?.filter((tombstone) => tombstone.entity === 'collection') ?? [];
      if (
        (!remoteSettings || Object.keys(remoteSettings).length === 0) &&
        remoteCollections.length === 0 &&
        collectionTombstones.length === 0
      ) {
        return;
      }

      const nextWatermark = result.settingsUpdatedAt ?? Date.now();
      const freshSettings = { ...useSettingsStore.getState().settings };
      const mergedSettings = remoteSettings
        ? applyRoamingSettings(freshSettings, remoteSettings)
        : freshSettings;
      mergedSettings.lastSyncedAtSettings = nextWatermark;
      useSettingsStore.getState().setSettings(mergedSettings);
      const appService = await envConfig.getAppService();
      await appService.saveSettings(mergedSettings);

      if (remoteCollections.length > 0 || collectionTombstones.length > 0) {
        const { usePlatformSidebarStore } = await import('@/store/platformSidebarStore');
        const localCollections = usePlatformSidebarStore.getState().collections;
        const tombstoneCollections = collectionTombstones.map((tombstone) => ({
          id: tombstone.entityId,
          name: '',
          bookHashes: [],
          createdAt: new Date(tombstone.deletedAt).toISOString(),
          updatedAt: tombstoneTimestamp(tombstone),
          deletedAt: tombstone.deletedAt,
        }));
        const mergedCollections = mergeCollections(localCollections, [
          ...remoteCollections,
          ...tombstoneCollections,
        ]);
        usePlatformSidebarStore.setState({
          collections: mergedCollections as typeof localCollections,
        });
      }
    } catch (error) {
      console.error('[SyncWorker] Pull remote settings failed:', error);
    }
  }

  /**
   * Pull AI conversations and messages from Supabase for the active book.
   * Merges into IndexedDB (LWW by updatedAt), then refreshes Zustand store.
   * Uses coalescing guard to prevent duplicate pulls from rapid broadcasts.
   */
  async pullRemoteAIConversations(): Promise<void> {
    if (isOffline() || !this.userId) return;

    const bookHash = useAIChatStore.getState().currentBookHash;
    if (!bookHash) return;

    if (!this.aiPullGuard.tryEnter()) return;

    try {
      const sb = await this.getAuthenticatedSupabase();
      if (!sb) return;

      // Pull conversations for this book
      const { data: remoteConversations, error: convError } = await sb
        .from('ai_conversations')
        .select('*')
        .eq('book_hash', bookHash)
        .eq('user_id', this.userId);

      if (convError) {
        console.error('[SyncWorker] Pull AI conversations failed:', convError.message);
        return;
      }

      if (!remoteConversations || remoteConversations.length === 0) return;

      // Get local conversations (including soft-deleted) for LWW merge
      const localConversations = await aiStore.getAllConversations(bookHash);
      const localMap = new Map(localConversations.map((c) => [c.id, c]));

      // Merge: remote wins if updatedAt is newer (LWW)
      const merged: AIConversation[] = [];
      for (const remote of remoteConversations as SupabaseAIConversation[]) {
        const local = localMap.get(remote.id);
        const remoteConv: AIConversation = {
          id: remote.id,
          bookHash: remote.book_hash,
          title: remote.title,
          createdAt: new Date(remote.created_at).getTime(),
          updatedAt: new Date(remote.updated_at).getTime(),
          deletedAt: remote.deleted_at ? new Date(remote.deleted_at).getTime() : undefined,
          // TODO: pull parallel_book_hashes once Supabase column is added
        };

        if (!local || remoteConv.updatedAt > local.updatedAt) {
          merged.push(remoteConv);
        }
      }

      if (merged.length > 0) {
        await aiStore.upsertConversations(merged);
      }

      // Pull messages for all conversations
      const conversationIds = (remoteConversations as SupabaseAIConversation[]).map((c) => c.id);
      let newMessages: AIMessage[] = [];
      if (conversationIds.length > 0) {
        const { data: remoteMessages, error: msgError } = await sb
          .from('ai_messages')
          .select('*')
          .in('conversation_id', conversationIds)
          .eq('user_id', this.userId)
          .order('created_at', { ascending: true })
          .limit(1000);

        if (msgError) {
          console.error('[SyncWorker] Pull AI messages failed:', msgError.message);
          return;
        }

        if (remoteMessages && remoteMessages.length > 0) {
          const localMessageArrays = await Promise.all(
            conversationIds.map((id) => aiStore.getMessages(id)),
          );
          const localMsgIds = new Set(localMessageArrays.flat().map((m) => m.id));

          newMessages = (remoteMessages as SupabaseAIMessage[])
            .filter((m) => !localMsgIds.has(m.id))
            .map((m) => ({
              id: m.id,
              conversationId: m.conversation_id,
              role: m.role as 'user' | 'assistant',
              content: m.content,
              createdAt: new Date(m.created_at).getTime(),
            }));

          if (newMessages.length > 0) {
            await aiStore.upsertMessages(newMessages);
          }
        }
      }

      // Refresh Zustand store only if remote data introduced actual changes.
      // Skipping no-op updates prevents cascading re-renders that can
      // trigger pushes → broadcasts → pulls → infinite loop.
      if (merged.length > 0) {
        const { currentBookHash, conversations: existing } = useAIChatStore.getState();
        if (currentBookHash === bookHash) {
          const freshConversations = await aiStore.getConversations(bookHash);
          const changed =
            freshConversations.length !== existing.length ||
            freshConversations.some(
              (c, i) => c.id !== existing[i]?.id || c.updatedAt !== existing[i]?.updatedAt,
            );
          if (changed) {
            useAIChatStore.setState({ conversations: freshConversations });
          }
        }
      }
      if (newMessages.length > 0) {
        const { activeConversationId, messages: existingMsgs } = useAIChatStore.getState();
        if (
          activeConversationId &&
          newMessages.some((m) => m.conversationId === activeConversationId)
        ) {
          const freshMessages = await aiStore.getMessages(activeConversationId);
          const changed =
            freshMessages.length !== existingMsgs.length ||
            freshMessages.some((m, i) => m.id !== existingMsgs[i]?.id);
          if (changed) {
            useAIChatStore.setState({ messages: freshMessages });
          }
        }
      }
    } catch (error) {
      console.error('[SyncWorker] Pull AI conversations error:', error);
    } finally {
      if (this.aiPullGuard.exit()) {
        this.pullRemoteAIConversations();
      }
    }
  }

  /**
   * Broadcast a sync event to other devices via Supabase Realtime.
   */
  broadcast(event: string): void {
    if (!this.realtimeChannel) return;
    this.realtimeChannel.send({
      type: 'broadcast',
      event,
      payload: {},
    });
  }

  private updateStatus(partial: Partial<SyncWorkerStatus>): void {
    this._status = { ...this._status, ...partial };
    this.listeners.forEach((cb) => cb(this._status));
  }
}

/** Singleton instance */
export const syncWorker = new SyncWorker();
