import { randomBytes, randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { assertUserOwnedObjectKey } from '@openread/storage';
import { ACCOUNT_DELETION_TARGETS, assertAccountDeletionSchemaInventory } from '@openread/types';

export { ACCOUNT_DELETION_TARGETS };

/**
 * COVERAGE GAP: accounts created here bypass real email signup and recovery.
 * This mechanism proves product sign-in and teardown only. It must never be
 * cited as signup or password-recovery coverage.
 *
 * The deletion marker must remain in app_metadata: Supabase users can edit
 * user_metadata and choose their email, but only an admin can write app_metadata.
 * Email shape is diagnostic and is never part of the deletion allowlist.
 */
export const E2E_ACCOUNT_MARKER_KEY = 'openread_e2e_disposable';
export const E2E_ACCOUNT_MARKER_VALUE = true;

export const UNMARKED_ACCOUNT_ERROR =
  'Refusing to delete account without the admin-owned OpenRead E2E marker';

const RUN_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,62}$/i;
const MAX_PREFIX_CLEANUP_PASSES = 8;

const requiredFunction = (dependencies, name) => {
  const value = dependencies[name];
  if (typeof value !== 'function') throw new Error(`Missing account lifecycle dependency: ${name}`);
  return value;
};

const errorMessage = (error) => (error instanceof Error ? error.message : String(error));

const accountPassword = () => `${randomBytes(24).toString('base64url')}Aa1!`;

const validateRunId = (runId) => {
  if (typeof runId !== 'string' || !RUN_ID_PATTERN.test(runId)) {
    throw new Error('runId must be 1-63 letters, digits, underscores, or hyphens');
  }
  return runId.toLowerCase();
};

const validateAccountCredentials = (credentials) => {
  if (
    !credentials ||
    typeof credentials.email !== 'string' ||
    !credentials.email ||
    typeof credentials.password !== 'string' ||
    !credentials.password ||
    typeof credentials.createdAt !== 'string'
  ) {
    throw new Error(
      'Prepared account credentials with email, password, and createdAt are required',
    );
  }
};

const validateAccountHandle = (account) => {
  validateAccountCredentials(account);
  if (typeof account.userId !== 'string' || !account.userId) {
    throw new Error('A provisioned account handle with userId, email, and password is required');
  }
};

export const hasE2EAccountMarker = (user) =>
  user?.app_metadata?.[E2E_ACCOUNT_MARKER_KEY] === E2E_ACCOUNT_MARKER_VALUE;

export const assertE2EAccountMarker = (user) => {
  if (!hasE2EAccountMarker(user)) throw new Error(UNMARKED_ACCOUNT_ERROR);
};

const normalizeUserOwnedObjects = (objects, userId) => {
  if (!Array.isArray(objects)) throw new Error('R2 inventory returned a non-array result');
  return objects.map((object) => {
    const key = object?.key;
    const size = object?.size;
    assertUserOwnedObjectKey(key, userId);
    if (!Number.isSafeInteger(size) || size < 0) {
      throw new Error(`R2 inventory returned an invalid size for ${key}`);
    }
    return Object.freeze({ key, size, type: 'user-prefix' });
  });
};

const normalizeFileRecords = (records, userId) => {
  if (!Array.isArray(records)) throw new Error('File metadata query returned a non-array result');

  return records.map((record) => {
    const key = record?.file_key;
    const type = record?.file_type;
    const size = record?.file_size;
    if (typeof key !== 'string' || !key) {
      throw new Error('File metadata contains an empty object key');
    }
    if (!['book', 'cover', 'temp'].includes(type)) {
      throw new Error(`File metadata contains unsupported type: ${String(type)}`);
    }
    if (size != null && (!Number.isSafeInteger(size) || size < 0)) {
      throw new Error(`File metadata contains an invalid size for ${key}`);
    }
    if (type !== 'temp') assertUserOwnedObjectKey(key, userId);
    if (
      type === 'temp' &&
      (!/^temp\/[^/]+\//.test(key) || key.includes('..') || key.includes('\\'))
    ) {
      throw new Error('Temporary object key is outside the canonical temp namespace');
    }
    return Object.freeze({ key, size: size ?? null, type });
  });
};

const userCreatedAt = (user) => {
  const timestamp = Date.parse(user?.created_at ?? '');
  if (!Number.isFinite(timestamp)) throw new Error('Marked account has no valid creation time');
  return timestamp;
};

export function createAccountLifecycle(dependencies) {
  const adminCreateUser = requiredFunction(dependencies, 'adminCreateUser');
  const adminGetUser = requiredFunction(dependencies, 'adminGetUser');
  const adminUpdateUser = requiredFunction(dependencies, 'adminUpdateUser');
  const adminDeleteUser = requiredFunction(dependencies, 'adminDeleteUser');
  const listUsers = requiredFunction(dependencies, 'listUsers');
  const signInWithPassword = requiredFunction(dependencies, 'signInWithPassword');
  const queryFileRecords = requiredFunction(dependencies, 'queryFileRecords');
  const listObjects = requiredFunction(dependencies, 'listObjects');
  const queryTableCount = requiredFunction(dependencies, 'queryTableCount');
  const deleteTableRows = requiredFunction(dependencies, 'deleteTableRows');
  const queryDeletionSchemaInventory = requiredFunction(
    dependencies,
    'queryDeletionSchemaInventory',
  );
  const headObject = requiredFunction(dependencies, 'headObject');
  const deleteObject = requiredFunction(dependencies, 'deleteObject');
  const now = dependencies.now ?? Date.now;
  const uuid = dependencies.randomUUID ?? randomUUID;
  const makePassword = dependencies.makePassword ?? accountPassword;
  const preparedAccounts = new WeakSet();
  const preparedSignupCredentials = new WeakSet();
  const verifiedAccounts = new WeakSet();

  const requirePreparedAccount = (account) => {
    validateAccountHandle(account);
    if (!preparedAccounts.has(account)) {
      throw new Error("Refusing cleanup without this runtime's prepared account handle");
    }
  };

  const getMarkedUser = async (userId) => {
    const user = await adminGetUser(userId);
    if (!user) throw new Error(`Marked account ${userId} no longer exists`);
    assertE2EAccountMarker(user);
    return user;
  };

  const verifyDeletionSchemaContract = async () => {
    assertAccountDeletionSchemaInventory(await queryDeletionSchemaInventory());
  };

  const captureArtifacts = async (userId) => {
    await getMarkedUser(userId);
    const [fileRecords, prefixObjects] = await Promise.all([
      queryFileRecords(userId),
      listObjects(userId),
    ]);
    const artifacts = [
      ...normalizeFileRecords(fileRecords, userId),
      ...normalizeUserOwnedObjects(prefixObjects, userId),
    ];
    return [...new Map(artifacts.map((artifact) => [artifact.key, artifact])).values()];
  };

  const cleanupPredeleteRows = async (userId) => {
    for (const target of ACCOUNT_DELETION_TARGETS.filter(
      ({ cleanupMode }) => cleanupMode === 'predelete',
    )) {
      await deleteTableRows(target, userId);
      const count = await queryTableCount(target, userId);
      if (!Number.isSafeInteger(count) || count !== 0) {
        throw new Error(`Predelete cleanup could not prove zero rows for ${target.table}`);
      }
    }
  };

  const inspectDatabaseRows = async (userId) => {
    const results = [];
    for (const target of ACCOUNT_DELETION_TARGETS) {
      const count = await queryTableCount(target, userId);
      if (!Number.isSafeInteger(count) || count < 0) {
        throw new Error(`Deletion verification for ${target.table} returned an invalid count`);
      }
      results.push({ ...target, count });
    }
    return results;
  };

  const verifyDatabaseRowsAbsent = async (userId) => {
    const results = await inspectDatabaseRows(userId);
    const remaining = results.filter(({ count }) => count > 0);
    if (remaining.length > 0) {
      throw new Error(
        `Account deletion left database rows: ${remaining
          .map(({ table, count }) => `${table}=${count}`)
          .join(', ')}`,
      );
    }
    return results;
  };

  const inspectAccountState = async (userId) => {
    const [user, database, prefixObjects] = await Promise.all([
      adminGetUser(userId),
      inspectDatabaseRows(userId),
      listObjects(userId),
    ]);
    return Object.freeze({
      userId,
      auth: Object.freeze({
        exists: Boolean(user),
        marked: user ? hasE2EAccountMarker(user) : false,
      }),
      database,
      objects: normalizeUserOwnedObjects(prefixObjects, userId).map(({ key, size }) => ({
        key,
        size,
      })),
    });
  };

  const verifyObjectsAbsent = async (userId, artifacts) => {
    const remaining = [];
    for (const artifact of artifacts) {
      if ((await headObject(artifact.key)).exists) remaining.push(artifact.key);
    }
    const prefixObjects = normalizeUserOwnedObjects(await listObjects(userId), userId);
    const remainingKeys = [...new Set([...remaining, ...prefixObjects.map(({ key }) => key)])];
    if (remainingKeys.length > 0) {
      throw new Error(`Account deletion left ${remainingKeys.length} R2 object(s)`);
    }
    return artifacts.map(({ key, size }) => ({ key, size }));
  };

  const verifyAdminUserAbsent = async (userId) => {
    const user = await adminGetUser(userId);
    if (user) throw new Error('Account deletion left the Supabase auth user active');
  };

  const verifyCredentialSignInRejected = async (account) => {
    const result = await signInWithPassword(account.email, account.password);
    if (result?.session) throw new Error('Deleted account credentials still produce a session');
    if (!['invalid_credentials', 'user_not_found'].includes(result?.error?.code)) {
      throw new Error(
        'Deleted account sign-in did not return the expected invalid-credentials code',
      );
    }
    return true;
  };

  const verifyDeleted = async (account, artifacts) => {
    validateAccountHandle(account);
    await verifyCredentialSignInRejected(account);
    await verifyAdminUserAbsent(account.userId);
    const database = await verifyDatabaseRowsAbsent(account.userId);
    const objects = await verifyObjectsAbsent(account.userId, artifacts);
    return Object.freeze({
      userId: account.userId,
      signInRejected: true,
      database,
      objects,
      r2PrefixEmpty: true,
    });
  };

  const stateHasDatabaseRows = (state) => state.database.some(({ count }) => count > 0);

  const stateIsEmpty = (state) =>
    !state.auth.exists && !stateHasDatabaseRows(state) && state.objects.length === 0;

  const cleanupAuthAbsentPrefixes = async ({
    userId,
    initialState,
    initialInventoryReported,
    onInventory,
    removedObjects = new Map(),
  }) => {
    let state = initialState;
    let inventoryReported = initialInventoryReported;
    let consecutiveEmptyInventories = 0;

    for (let pass = 0; pass < MAX_PREFIX_CLEANUP_PASSES; pass += 1) {
      if (!inventoryReported && onInventory) await onInventory(state);
      inventoryReported = false;
      if (state.auth.exists) {
        throw new Error('Provisioned-account cleanup found the auth user active after deletion');
      }

      if (state.objects.length > 0) {
        consecutiveEmptyInventories = 0;
        for (const object of state.objects) {
          removedObjects.set(object.key, object);
          await deleteObject(object.key);
        }
      } else if (stateHasDatabaseRows(state)) {
        throw new Error('Provisioned-account cleanup left database rows after auth deletion');
      } else {
        consecutiveEmptyInventories += 1;
        if (consecutiveEmptyInventories === 2) {
          const finalState = await inspectAccountState(userId);
          if (stateIsEmpty(finalState)) {
            return Object.freeze({
              removedObjects: [...removedObjects.values()],
              stateAfter: finalState,
              proof: Object.freeze({
                userId,
                database: finalState.database,
                objects: [...removedObjects.values()],
                r2PrefixEmpty: true,
              }),
            });
          }
          if (onInventory) await onInventory(finalState);
          state = finalState;
          inventoryReported = true;
          consecutiveEmptyInventories = 0;
          continue;
        }
      }
      state = await inspectAccountState(userId);
    }

    throw new Error('Provisioned-account prefix cleanup did not reach a quiescent empty state');
  };

  const prepare = (runId) => {
    const safeRunId = validateRunId(runId);
    const userId = uuid();
    const account = Object.freeze({
      userId,
      email: `e2e-${safeRunId}-${userId}@qa.openread.invalid`,
      password: makePassword(),
      createdAt: new Date(now()).toISOString(),
    });
    preparedAccounts.add(account);
    return account;
  };

  const prepareSignup = (runId) => {
    const safeRunId = validateRunId(runId).slice(0, 24);
    const nonce = uuid().replaceAll('-', '').slice(0, 12);
    const credentials = Object.freeze({
      email: `e2e-signup-${safeRunId}-${nonce}@qa.openread.invalid`,
      password: makePassword(),
      createdAt: new Date(now()).toISOString(),
    });
    preparedSignupCredentials.add(credentials);
    return credentials;
  };

  const adoptSignupAccount = (credentials, userId) => {
    validateAccountCredentials(credentials);
    if (!preparedSignupCredentials.has(credentials)) {
      throw new Error("Refusing signup adoption without this runtime's prepared credentials");
    }
    if (typeof userId !== 'string' || !userId) throw new Error('Public signup returned no user id');
    const account = Object.freeze({ ...credentials, userId });
    preparedAccounts.add(account);
    return account;
  };

  const stampSignupAccount = async (account) => {
    requirePreparedAccount(account);
    const existing = await adminGetUser(account.userId);
    if (!existing) throw new Error('Public signup user was not visible to the service role');
    if (existing.email?.toLowerCase() !== account.email.toLowerCase()) {
      throw new Error('Public signup user email did not match the prepared credentials');
    }
    if (
      existing.app_metadata !== undefined &&
      (existing.app_metadata === null ||
        typeof existing.app_metadata !== 'object' ||
        Array.isArray(existing.app_metadata))
    ) {
      throw new Error('Public signup user returned malformed app metadata');
    }

    const appMetadata = {
      ...(existing.app_metadata ?? {}),
      [E2E_ACCOUNT_MARKER_KEY]: E2E_ACCOUNT_MARKER_VALUE,
    };
    const updated = await adminUpdateUser(account.userId, { app_metadata: appMetadata });
    if (updated?.id !== account.userId) {
      throw new Error('Supabase admin marker update returned an unexpected user id');
    }

    const verified = await adminGetUser(account.userId);
    if (!verified) throw new Error('Stamped signup user was not visible on re-read');
    if (verified.email?.toLowerCase() !== account.email.toLowerCase()) {
      throw new Error('Stamped signup user email changed before marker verification');
    }
    assertE2EAccountMarker(verified);
    for (const [key, value] of Object.entries(existing.app_metadata ?? {})) {
      if (key === E2E_ACCOUNT_MARKER_KEY) continue;
      if (!isDeepStrictEqual(verified.app_metadata?.[key], value)) {
        throw new Error(`Signup marker update did not preserve existing app metadata: ${key}`);
      }
    }
    verifiedAccounts.add(account);
    return verified;
  };

  const provisionPrepared = async (account) => {
    requirePreparedAccount(account);
    await verifyDeletionSchemaContract();
    const user = await adminCreateUser({
      id: account.userId,
      email: account.email,
      password: account.password,
      email_confirm: true,
      app_metadata: { [E2E_ACCOUNT_MARKER_KEY]: E2E_ACCOUNT_MARKER_VALUE },
    });
    if (user?.id !== account.userId) {
      throw new Error('Supabase admin provisioning returned an unexpected user id');
    }
    assertE2EAccountMarker(user);
    verifiedAccounts.add(account);
    return account;
  };

  const provision = (runId) => provisionPrepared(prepare(runId));

  const signIn = async (account) => {
    validateAccountHandle(account);
    const result = await signInWithPassword(account.email, account.password);
    if (result?.error)
      throw new Error(`Provisioned account sign-in failed: ${errorMessage(result.error)}`);
    if (!result?.session) throw new Error('Provisioned account sign-in returned no session');
    return result.session;
  };

  const finalize = async (account, deleteAccount) => {
    validateAccountHandle(account);
    if (typeof deleteAccount !== 'function') {
      throw new Error('finalize requires the product account-deletion action');
    }
    const artifacts = await captureArtifacts(account.userId);
    await verifyDeletionSchemaContract();
    await deleteAccount(account);
    return verifyDeleted(account, artifacts);
  };

  const deleteMarkedAccount = async (userId, { onInventory } = {}) => {
    await getMarkedUser(userId);
    const artifacts = await captureArtifacts(userId);
    await verifyDeletionSchemaContract();
    const stateBefore = await inspectAccountState(userId);
    if (onInventory) await onInventory(stateBefore);
    const existingArtifacts = [];
    for (const artifact of artifacts) {
      const object = await headObject(artifact.key);
      if (object.exists) existingArtifacts.push({ key: artifact.key, size: object.size });
    }
    await cleanupPredeleteRows(userId);

    // Prove the complete user prefix is empty before deleting the marker-bearing
    // auth user, so ambiguous R2 state remains retryable.
    for (const artifact of artifacts) await deleteObject(artifact.key);
    await verifyObjectsAbsent(userId, artifacts);
    await adminDeleteUser(userId);
    const postAuthState = await inspectAccountState(userId);
    const cleanup = await cleanupAuthAbsentPrefixes({
      userId,
      initialState: postAuthState,
      initialInventoryReported: false,
      onInventory,
      removedObjects: new Map(existingArtifacts.map((object) => [object.key, object])),
    });
    return Object.freeze({
      outcome: 'recovered-residue',
      authority: 'app-metadata',
      userId,
      removedAccount: true,
      removedObjects: cleanup.removedObjects,
      stateBefore,
      stateAfter: cleanup.stateAfter,
      proof: cleanup.proof,
    });
  };

  const cleanupPreparedAccount = async (account, { onInventory } = {}) => {
    requirePreparedAccount(account);
    if (onInventory !== undefined && typeof onInventory !== 'function') {
      throw new Error('onInventory must be a function');
    }

    let state = await inspectAccountState(account.userId);
    if (state.auth.exists) {
      if (!state.auth.marked) {
        if (onInventory) await onInventory(state);
        throw new Error(UNMARKED_ACCOUNT_ERROR);
      }
      return deleteMarkedAccount(account.userId, { onInventory });
    }

    if (onInventory) await onInventory(state);
    if (!verifiedAccounts.has(account)) {
      if (stateHasDatabaseRows(state) || state.objects.length > 0) {
        throw new Error('Refusing auth-absent cleanup without a verified provisioning receipt');
      }
      return Object.freeze({
        outcome: 'already-clean',
        authority: 'prepared-handle',
        userId: account.userId,
        removedAccount: false,
        removedObjects: [],
        stateBefore: state,
        stateAfter: state,
      });
    }

    const stateBefore = state;
    const cleanup = await cleanupAuthAbsentPrefixes({
      userId: account.userId,
      initialState: state,
      initialInventoryReported: true,
      onInventory,
    });
    return Object.freeze({
      outcome: cleanup.removedObjects.length > 0 ? 'recovered-residue' : 'already-clean',
      authority: 'runtime-provisioning-receipt',
      userId: account.userId,
      removedAccount: false,
      removedObjects: cleanup.removedObjects,
      stateBefore,
      stateAfter: cleanup.stateAfter,
      proof: cleanup.proof,
    });
  };

  const reapStale = async ({ olderThanMs }) => {
    if (!Number.isSafeInteger(olderThanMs) || olderThanMs < 0) {
      throw new Error('olderThanMs must be a non-negative safe integer');
    }

    const users = await listUsers();
    const marked = users.filter(hasE2EAccountMarker);
    const eligible = marked.filter((user) => now() - userCreatedAt(user) >= olderThanMs);
    const reaped = [];
    const failures = [];

    for (const user of eligible) {
      try {
        reaped.push(await deleteMarkedAccount(user.id));
      } catch (error) {
        failures.push({ userId: user.id, error: errorMessage(error) });
      }
    }

    return Object.freeze({
      scanned: users.length,
      marked: marked.length,
      eligible: eligible.length,
      skippedYoung: marked.length - eligible.length,
      reaped,
      failures,
    });
  };

  return Object.freeze({
    prepare,
    prepareSignup,
    adoptSignupAccount,
    stampSignupAccount,
    provisionPrepared,
    provision,
    signIn,
    captureArtifacts,
    inspectAccountState,
    finalize,
    verifyDeleted,
    deleteMarkedAccount,
    cleanupPreparedAccount,
    reapStale,
  });
}
