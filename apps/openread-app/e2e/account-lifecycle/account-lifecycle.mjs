import { randomBytes, randomUUID } from 'node:crypto';
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

const validateAccountHandle = (account) => {
  if (
    !account ||
    typeof account.userId !== 'string' ||
    typeof account.email !== 'string' ||
    typeof account.password !== 'string'
  ) {
    throw new Error('A provisioned account handle with userId, email, and password is required');
  }
};

export const hasE2EAccountMarker = (user) =>
  user?.app_metadata?.[E2E_ACCOUNT_MARKER_KEY] === E2E_ACCOUNT_MARKER_VALUE;

export const assertE2EAccountMarker = (user) => {
  if (!hasE2EAccountMarker(user)) throw new Error(UNMARKED_ACCOUNT_ERROR);
};

const normalizeUserOwnedKeys = (keys, userId) => {
  if (!Array.isArray(keys)) throw new Error('R2 inventory returned a non-array result');
  return keys.map((key) => {
    assertUserOwnedObjectKey(key, userId);
    return Object.freeze({ key, type: 'user-prefix' });
  });
};

const normalizeFileRecords = (records, userId) => {
  if (!Array.isArray(records)) throw new Error('File metadata query returned a non-array result');

  return records.map((record) => {
    const key = record?.file_key;
    const type = record?.file_type;
    if (typeof key !== 'string' || !key) {
      throw new Error('File metadata contains an empty object key');
    }
    if (!['book', 'cover', 'temp'].includes(type)) {
      throw new Error(`File metadata contains unsupported type: ${String(type)}`);
    }
    if (type !== 'temp') assertUserOwnedObjectKey(key, userId);
    if (
      type === 'temp' &&
      (!/^temp\/[^/]+\//.test(key) || key.includes('..') || key.includes('\\'))
    ) {
      throw new Error('Temporary object key is outside the canonical temp namespace');
    }
    return Object.freeze({ key, type });
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
  const adminDeleteUser = requiredFunction(dependencies, 'adminDeleteUser');
  const listUsers = requiredFunction(dependencies, 'listUsers');
  const signInWithPassword = requiredFunction(dependencies, 'signInWithPassword');
  const queryFileRecords = requiredFunction(dependencies, 'queryFileRecords');
  const listObjectKeys = requiredFunction(dependencies, 'listObjectKeys');
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
    const [fileRecords, prefixKeys] = await Promise.all([
      queryFileRecords(userId),
      listObjectKeys(userId),
    ]);
    const artifacts = [
      ...normalizeFileRecords(fileRecords, userId),
      ...normalizeUserOwnedKeys(prefixKeys, userId),
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

  const verifyDatabaseRowsAbsent = async (userId) => {
    const results = [];
    for (const target of ACCOUNT_DELETION_TARGETS) {
      const count = await queryTableCount(target, userId);
      if (!Number.isSafeInteger(count) || count < 0) {
        throw new Error(`Deletion verification for ${target.table} returned an invalid count`);
      }
      results.push({ ...target, count });
    }

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

  const verifyObjectsAbsent = async (userId, artifacts) => {
    const remaining = [];
    for (const artifact of artifacts) {
      if (await headObject(artifact.key)) remaining.push(artifact.key);
    }
    const prefixKeys = normalizeUserOwnedKeys(await listObjectKeys(userId), userId).map(
      ({ key }) => key,
    );
    const remainingKeys = [...new Set([...remaining, ...prefixKeys])];
    if (remainingKeys.length > 0) {
      throw new Error(`Account deletion left ${remainingKeys.length} R2 object(s)`);
    }
    return artifacts.map(({ key }) => key);
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

  const verifyCleanup = async (userId, artifacts) => {
    await verifyAdminUserAbsent(userId);
    const database = await verifyDatabaseRowsAbsent(userId);
    const objects = await verifyObjectsAbsent(userId, artifacts);
    return Object.freeze({ userId, database, objects, r2PrefixEmpty: true });
  };

  const provision = async (runId) => {
    const safeRunId = validateRunId(runId);
    await verifyDeletionSchemaContract();
    const token = uuid();
    const email = `e2e-${safeRunId}-${token}@qa.openread.invalid`;
    const password = makePassword();
    const user = await adminCreateUser({
      email,
      password,
      email_confirm: true,
      app_metadata: { [E2E_ACCOUNT_MARKER_KEY]: E2E_ACCOUNT_MARKER_VALUE },
    });
    if (!user?.id) throw new Error('Supabase admin provisioning returned no user id');
    assertE2EAccountMarker(user);

    return Object.freeze({
      userId: user.id,
      email,
      password,
      createdAt: user.created_at ?? new Date(now()).toISOString(),
    });
  };

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

  const deleteMarkedAccount = async (userId) => {
    await getMarkedUser(userId);
    const artifacts = await captureArtifacts(userId);
    await verifyDeletionSchemaContract();
    await cleanupPredeleteRows(userId);

    // Prove the complete user prefix is empty before deleting the marker-bearing
    // auth user, so ambiguous R2 state remains retryable.
    for (const artifact of artifacts) await deleteObject(artifact.key);
    await verifyObjectsAbsent(userId, artifacts);
    await adminDeleteUser(userId);
    return verifyCleanup(userId, artifacts);
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
        await deleteMarkedAccount(user.id);
        reaped.push(user.id);
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
    provision,
    signIn,
    captureArtifacts,
    finalize,
    verifyDeleted,
    deleteMarkedAccount,
    reapStale,
  });
}
