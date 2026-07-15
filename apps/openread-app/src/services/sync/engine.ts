import type { DeviceId, UserId } from '@openread/sync';
import {
  SYNC_PROTOCOL_VERSION,
  type SyncMutation,
  type SyncPushConflict,
  type SyncPushRequest,
  type SyncPushResponse,
} from '@openread/sync/protocol';

import { syncOutbox, type StoredSyncMutation, type SyncOutbox } from './outbox';

const DEFAULT_DRAIN_BATCH_SIZE = 50;
const DEFAULT_MAX_RETRIES = 5;
const DEFAULT_RETRY_BACKOFF_MS = 1_000;
const DEFAULT_CLAIM_LEASE_DURATION_MS = 30_000;

export interface SyncTransport {
  push(request: SyncPushRequest): Promise<SyncPushResponse>;
}

export interface SyncEngineOptions {
  userId: UserId;
  deviceId: DeviceId;
  outbox?: SyncOutbox;
  transport?: SyncTransport;
  batchSize?: number;
  maxRetries?: number;
  retryBackoffMs?: number;
  claimLeaseDurationMs?: number;
  claimOwner?: string;
}

export interface SyncEngineStatus {
  syncing: boolean;
  lastDrainAt: number;
  lastError: string | null;
}

export interface SyncDrainResult {
  attempted: number;
  accepted: number;
  conflicted: number;
  failed: number;
  remaining: number;
}

export interface SyncMutationDeliveryResult {
  status: 'accepted' | 'pending' | 'failed';
  mutationIds: string[];
  acceptedMutationIds: string[];
  pendingMutationIds: string[];
  failedMutationIds: string[];
}

export class SyncMutationDeliveryError extends Error {
  constructor(
    readonly failedMutationIds: string[],
    readonly unknownMutationIds: string[],
  ) {
    super('Sync delivery could not be confirmed for every mutation');
    this.name = 'SyncMutationDeliveryError';
  }
}

export class SyncEngineTransportError extends Error {
  constructor() {
    super('SyncEngine transport is not configured');
    this.name = 'SyncEngineTransportError';
  }
}

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const createClaimOwner = (deviceId: DeviceId): string =>
  `${deviceId}:${Date.now()}:${Math.random().toString(36).slice(2)}`;

const toMutation = (record: StoredSyncMutation): SyncMutation => {
  if (record.op === 'delete') {
    return {
      id: record.id,
      entity: record.entity,
      entityId: record.entityId,
      op: record.op,
      baseRevision: record.baseRevision,
      userId: record.userId,
      deviceId: record.deviceId,
      clientUpdatedAt: record.clientUpdatedAt,
      tombstone: record.tombstone,
    } as SyncMutation;
  }

  return {
    id: record.id,
    entity: record.entity,
    entityId: record.entityId,
    op: record.op,
    baseRevision: record.baseRevision,
    userId: record.userId,
    deviceId: record.deviceId,
    clientUpdatedAt: record.clientUpdatedAt,
    payload: record.payload,
  } as SyncMutation;
};

export class SyncEngine {
  private readonly outbox: SyncOutbox;
  private readonly batchSize: number;
  private readonly maxRetries: number;
  private readonly retryBackoffMs: number;
  private readonly claimLeaseDurationMs: number;
  private readonly claimOwner: string;
  private transport: SyncTransport | null;
  private drainPromise: Promise<SyncDrainResult> | null = null;
  private statusValue: SyncEngineStatus = {
    syncing: false,
    lastDrainAt: 0,
    lastError: null,
  };

  constructor(private readonly options: SyncEngineOptions) {
    this.outbox = options.outbox ?? syncOutbox;
    this.transport = options.transport ?? null;
    this.batchSize = options.batchSize ?? DEFAULT_DRAIN_BATCH_SIZE;
    this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.retryBackoffMs = options.retryBackoffMs ?? DEFAULT_RETRY_BACKOFF_MS;
    this.claimLeaseDurationMs = options.claimLeaseDurationMs ?? DEFAULT_CLAIM_LEASE_DURATION_MS;
    this.claimOwner = options.claimOwner ?? createClaimOwner(options.deviceId);
  }

  get status(): SyncEngineStatus {
    return { ...this.statusValue };
  }

  setTransport(transport: SyncTransport): void {
    this.transport = transport;
  }

  async enqueue(mutation: SyncMutation): Promise<StoredSyncMutation> {
    return this.outbox.enqueue(mutation);
  }

  async pendingCount(): Promise<number> {
    return this.outbox.pendingCount(this.options.userId);
  }

  async recoverFailed(): Promise<StoredSyncMutation[]> {
    return this.outbox.recoverFailed({ userId: this.options.userId });
  }

  async resolveDelivery(
    enqueuedRecords: StoredSyncMutation[],
    expectedUserId: UserId,
  ): Promise<SyncMutationDeliveryResult> {
    const recordsById = new Map(enqueuedRecords.map((record) => [record.id, record]));
    const exactRecords = [...recordsById.values()];
    const mutationIds = exactRecords.map((record) => record.id);
    const identityMismatch =
      expectedUserId !== this.options.userId ||
      exactRecords.some((record) => record.userId !== expectedUserId);
    if (identityMismatch) {
      throw new SyncMutationDeliveryError([], mutationIds);
    }

    const durableRecords = new Map(
      (await this.outbox.getAll(expectedUserId)).map((record) => [record.id, record]),
    );
    const failedMutationIds: string[] = [];
    const pendingMutationIds: string[] = [];
    const acceptedMutationIds: string[] = [];
    const unknownMutationIds: string[] = [];

    for (const record of exactRecords) {
      const durableRecord = durableRecords.get(record.id);
      if (!durableRecord) {
        acceptedMutationIds.push(record.id);
      } else if (durableRecord.status === 'failed') {
        failedMutationIds.push(record.id);
      } else if (durableRecord.status === 'pending' || durableRecord.status === 'pushing') {
        pendingMutationIds.push(record.id);
      } else {
        unknownMutationIds.push(record.id);
      }
    }

    if (unknownMutationIds.length > 0) {
      throw new SyncMutationDeliveryError([], unknownMutationIds);
    }

    return {
      status:
        failedMutationIds.length > 0
          ? 'failed'
          : pendingMutationIds.length > 0
            ? 'pending'
            : 'accepted',
      mutationIds,
      acceptedMutationIds,
      pendingMutationIds,
      failedMutationIds,
    };
  }

  async drainOnce(): Promise<SyncDrainResult> {
    this.drainPromise ??= this.drainInternal().finally(() => {
      this.drainPromise = null;
    });
    return this.drainPromise;
  }

  private async drainInternal(): Promise<SyncDrainResult> {
    if (!this.transport) throw new SyncEngineTransportError();

    this.statusValue = { ...this.statusValue, syncing: true, lastError: null };
    const pending = await this.outbox.claimPending({
      userId: this.options.userId,
      limit: this.batchSize,
      leaseOwner: this.claimOwner,
      leaseDurationMs: this.claimLeaseDurationMs,
    });
    if (pending.length === 0) {
      this.statusValue = { ...this.statusValue, syncing: false, lastDrainAt: Date.now() };
      return { attempted: 0, accepted: 0, conflicted: 0, failed: 0, remaining: 0 };
    }

    const ids = pending.map((record) => record.id);

    try {
      const response = await this.transport.push(this.buildPushRequest(pending));
      const attemptedIds = new Set(ids);
      const accepted = response.accepted.filter((ack) => attemptedIds.has(ack.mutationId));
      const conflicts = response.conflicts.filter((conflict) =>
        attemptedIds.has(conflict.mutationId),
      );
      const acceptedIds = new Set(accepted.map((ack) => ack.mutationId));
      const conflictIds = new Set(conflicts.map((conflict) => conflict.mutationId));
      const unacknowledgedIds = ids.filter((id) => !acceptedIds.has(id) && !conflictIds.has(id));

      const acknowledgedIds = await this.outbox.acknowledgeClaimed(
        [...acceptedIds],
        this.claimOwner,
      );
      const conflictRecords = await this.markConflicts(conflicts);
      const failedRecords = await this.outbox.recordClaimFailure(
        unacknowledgedIds,
        this.claimOwner,
        'Sync push did not acknowledge mutation',
        {
          maxRetries: this.maxRetries,
          retryBackoffMs: this.retryBackoffMs,
        },
      );

      const remaining = await this.outbox.pendingCount(this.options.userId);
      const result = {
        attempted: pending.length,
        accepted: acknowledgedIds.length,
        conflicted: conflictRecords.length,
        failed: failedRecords.length,
        remaining,
      };
      this.statusValue = { syncing: false, lastDrainAt: Date.now(), lastError: null };
      return result;
    } catch (error) {
      const message = errorMessage(error);
      const failedRecords = await this.outbox.recordClaimFailure(ids, this.claimOwner, message, {
        maxRetries: this.maxRetries,
        retryBackoffMs: this.retryBackoffMs,
      });
      const remaining = await this.outbox.pendingCount(this.options.userId);
      this.statusValue = { syncing: false, lastDrainAt: Date.now(), lastError: message };
      return {
        attempted: pending.length,
        accepted: 0,
        conflicted: 0,
        failed: failedRecords.length,
        remaining,
      };
    }
  }

  private buildPushRequest(records: StoredSyncMutation[]): SyncPushRequest {
    return {
      protocolVersion: SYNC_PROTOCOL_VERSION,
      userId: this.options.userId,
      deviceId: this.options.deviceId,
      mutations: records.map((record) => toMutation(record)),
    };
  }

  private async markConflicts(conflicts: SyncPushConflict[]): Promise<StoredSyncMutation[]> {
    if (conflicts.length === 0) return [];
    return this.outbox.markClaimFailed(
      conflicts.map((conflict) => conflict.mutationId),
      this.claimOwner,
      'Server rejected sync mutation',
    );
  }
}

export function createSyncEngine(options: SyncEngineOptions): SyncEngine {
  return new SyncEngine(options);
}
