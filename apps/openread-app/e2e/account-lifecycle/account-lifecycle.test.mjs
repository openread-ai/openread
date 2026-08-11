import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ACCOUNT_DELETION_TARGETS,
  E2E_ACCOUNT_MARKER_KEY,
  UNMARKED_ACCOUNT_ERROR,
  createAccountLifecycle,
} from './account-lifecycle.mjs';

const createFakeRuntime = () => {
  let sequence = 0;
  let clock = Date.parse('2026-08-11T10:00:00.000Z');
  const users = new Map();
  const credentials = new Map();
  const fileRecords = new Map();
  const objects = new Set();
  const objectSizes = new Map();
  const tableCounts = new Map();
  const calls = { adminDeleteUser: [], deleteObject: [], sequence: [] };
  let schemaInventory = ACCOUNT_DELETION_TARGETS.map((target) => ({ ...target }));
  let objectInventoryError = null;
  let objectInventoryCalls = 0;
  let objectInventoryInjection = null;
  let predeleteError = null;
  let predeleteLeavesRows = false;
  let createErrorAfterCommit = null;
  let rejectedSignInError = {
    code: 'invalid_credentials',
    message: 'Invalid login credentials',
  };

  const countKey = (table, userId) => `${table}:${userId}`;

  const dependencies = {
    now: () => clock,
    randomUUID: () => `00000000-0000-4000-8000-${String(++sequence).padStart(12, '0')}`,
    makePassword: () => `Password-${sequence}-Aa1!`,
    adminCreateUser: async (attributes) => {
      const id = attributes.id;
      const user = {
        id,
        email: attributes.email,
        app_metadata: attributes.app_metadata,
        created_at: new Date(clock).toISOString(),
      };
      users.set(id, user);
      credentials.set(attributes.email, { password: attributes.password, userId: id });
      if (createErrorAfterCommit) throw createErrorAfterCommit;
      return user;
    },
    adminGetUser: async (userId) => users.get(userId) ?? null,
    adminDeleteUser: async (userId) => {
      calls.adminDeleteUser.push(userId);
      calls.sequence.push('auth-delete');
      const user = users.get(userId);
      if (user) credentials.delete(user.email);
      users.delete(userId);
      fileRecords.delete(userId);
      for (const { table } of ACCOUNT_DELETION_TARGETS) tableCounts.set(countKey(table, userId), 0);
    },
    listUsers: async () => [...users.values()],
    signInWithPassword: async (email, password) => {
      const credential = credentials.get(email);
      if (credential?.password === password && users.has(credential.userId)) {
        return { session: { access_token: `token-${credential.userId}` }, error: null };
      }
      return { session: null, error: rejectedSignInError };
    },
    queryFileRecords: async (userId) => fileRecords.get(userId) ?? [],
    listObjects: async (userId) => {
      if (objectInventoryError) throw objectInventoryError;
      objectInventoryCalls += 1;
      if (objectInventoryInjection?.call === objectInventoryCalls) {
        objects.add(objectInventoryInjection.key);
        objectSizes.set(objectInventoryInjection.key, objectInventoryInjection.size);
        objectInventoryInjection = null;
      }
      return [...objects]
        .filter(
          (key) =>
            key.startsWith(`users/${userId}/`) || key.startsWith(`${userId}/Openread/Books/`),
        )
        .map((key) => ({ key, size: objectSizes.get(key) ?? key.length }));
    },
    deleteTableRows: async ({ table }, userId) => {
      calls.sequence.push(`predelete:${table}`);
      if (predeleteError) throw predeleteError;
      if (!predeleteLeavesRows) tableCounts.set(countKey(table, userId), 0);
    },
    queryTableCount: async ({ table }, userId) => tableCounts.get(countKey(table, userId)) ?? 0,
    queryDeletionSchemaInventory: async () => schemaInventory,
    headObject: async (key) => ({
      exists: objects.has(key),
      size: objects.has(key) ? (objectSizes.get(key) ?? key.length) : null,
    }),
    deleteObject: async (key) => {
      calls.deleteObject.push(key);
      calls.sequence.push('r2-delete');
      objects.delete(key);
      objectSizes.delete(key);
    },
  };

  const lifecycle = createAccountLifecycle(dependencies);

  return {
    lifecycle,
    users,
    objects,
    calls,
    createUnmarkedUser(id = 'real-user') {
      const user = {
        id,
        email: `${id}@example.test`,
        app_metadata: {},
        created_at: new Date(clock - 86_400_000).toISOString(),
      };
      users.set(id, user);
      credentials.set(user.email, { password: 'RealPassword1!', userId: id });
      return user;
    },
    addArtifact(account, suffix = 'book.epub', size = 189_403) {
      const key = `users/${account.userId}/books/${suffix}`;
      fileRecords.set(account.userId, [
        ...(fileRecords.get(account.userId) ?? []),
        { file_key: key, file_type: 'book', file_size: size },
      ]);
      objects.add(key);
      objectSizes.set(key, size);
      return key;
    },
    addLegacyArtifact(account, suffix = 'hash/book.epub', size = 42) {
      const key = `${account.userId}/Openread/Books/${suffix}`;
      fileRecords.set(account.userId, [
        ...(fileRecords.get(account.userId) ?? []),
        { file_key: key, file_type: 'book', file_size: size },
      ]);
      objects.add(key);
      objectSizes.set(key, size);
      return key;
    },
    addTempArtifact(account, suffix = 'upload.bin', size = 17) {
      const key = `temp/${account.userId}/${suffix}`;
      fileRecords.set(account.userId, [
        ...(fileRecords.get(account.userId) ?? []),
        { file_key: key, file_type: 'temp', file_size: null },
      ]);
      objects.add(key);
      objectSizes.set(key, size);
      return key;
    },
    addRow(table, userId, count = 1) {
      tableCounts.set(countKey(table, userId), count);
    },
    rowCount(table, userId) {
      return tableCounts.get(countKey(table, userId)) ?? 0;
    },
    setCreatedAt(userId, value) {
      users.get(userId).created_at = new Date(value).toISOString();
    },
    failCreateAfterCommit(error = new Error('Supabase admin provisioning timed out')) {
      createErrorAfterCommit = error;
    },
    injectObjectOnInventoryCall(call, key, size) {
      objectInventoryInjection = { call, key, size };
    },
    failObjectInventory(error = new Error('R2 inventory failed')) {
      objectInventoryError = error;
    },
    failPredelete(error = new Error('Predelete cleanup failed')) {
      predeleteError = error;
    },
    leavePredeleteRows() {
      predeleteLeavesRows = true;
    },
    setRejectedSignInError(error) {
      rejectedSignInError = error;
    },
    setSchemaInventory(inventory) {
      schemaInventory = inventory;
    },
    async simulateProductDeletion(account, { leaveObjects = false } = {}) {
      const records = fileRecords.get(account.userId) ?? [];
      if (!leaveObjects)
        records.forEach(({ file_key }) => {
          objects.delete(file_key);
          objectSizes.delete(file_key);
        });
      const user = users.get(account.userId);
      if (user) credentials.delete(user.email);
      users.delete(account.userId);
      fileRecords.delete(account.userId);
      for (const { table } of ACCOUNT_DELETION_TARGETS)
        tableCounts.set(countKey(table, account.userId), 0);
    },
  };
};

describe('OpenRead E2E account lifecycle', () => {
  it('provisions an admin-marked confirmed account and signs in with its credentials', async () => {
    const runtime = createFakeRuntime();
    const account = await runtime.lifecycle.provision('reader-run');

    assert.equal(runtime.users.get(account.userId).app_metadata[E2E_ACCOUNT_MARKER_KEY], true);
    assert.match(account.email, /^e2e-reader-run-/);
    assert.deepEqual(await runtime.lifecycle.signIn(account), {
      access_token: `token-${account.userId}`,
    });
  });

  it('keeps an in-memory account handle across an ambiguous create response', async () => {
    const runtime = createFakeRuntime();
    const account = runtime.lifecycle.prepare('ambiguous-create-run');
    runtime.failCreateAfterCommit();

    await assert.rejects(runtime.lifecycle.provisionPrepared(account), /provisioning timed out/);
    assert.equal(runtime.users.get(account.userId).app_metadata[E2E_ACCOUNT_MARKER_KEY], true);

    const report = await runtime.lifecycle.cleanupPreparedAccount(account, {
      onInventory: async () => runtime.calls.sequence.push('verdict-inventory'),
    });

    assert.equal(report.outcome, 'recovered-residue');
    assert.equal(report.authority, 'app-metadata');
    assert.equal(report.removedAccount, true);
    assert.equal(runtime.users.has(account.userId), false);
    assert.deepEqual(runtime.calls.sequence, [
      'verdict-inventory',
      'predelete:user_catalog_wishlist',
      'auth-delete',
      'verdict-inventory',
      'verdict-inventory',
    ]);
  });

  it('recovers auth-absent prefix residue only with the same runtime provisioning receipt', async () => {
    const runtime = createFakeRuntime();
    const account = await runtime.lifecycle.provision('receipt-run');
    const objectKey = runtime.addArtifact(account, 'late.epub', 321);
    await runtime.simulateProductDeletion(account, { leaveObjects: true });
    const sequence = [];

    const report = await runtime.lifecycle.cleanupPreparedAccount(account, {
      onInventory: async (state) => {
        sequence.push(`inventory:${state.objects.length}`);
        runtime.calls.sequence.push('verdict-inventory');
      },
    });

    assert.equal(report.outcome, 'recovered-residue');
    assert.equal(report.authority, 'runtime-provisioning-receipt');
    assert.deepEqual(report.removedObjects, [{ key: objectKey, size: 321 }]);
    assert.deepEqual(sequence, ['inventory:1', 'inventory:0', 'inventory:0']);
    assert.deepEqual(runtime.calls.sequence, [
      'verdict-inventory',
      'r2-delete',
      'verdict-inventory',
      'verdict-inventory',
    ]);
    assert.equal(runtime.objects.has(objectKey), false);

    const reconstructed = { ...account };
    await assert.rejects(
      runtime.lifecycle.cleanupPreparedAccount(reconstructed),
      /runtime's prepared account handle/,
    );
  });

  it('reports a late prefix write before deleting it', async () => {
    const runtime = createFakeRuntime();
    const account = await runtime.lifecycle.provision('late-write-run');
    await runtime.simulateProductDeletion(account);
    const lateKey = `users/${account.userId}/books/late.epub`;
    const inventories = [];

    const report = await runtime.lifecycle.cleanupPreparedAccount(account, {
      onInventory: async (state) => {
        inventories.push(state.objects.map(({ key }) => key));
        runtime.calls.sequence.push('verdict-inventory');
        if (inventories.length === 1) runtime.objects.add(lateKey);
      },
    });

    assert.equal(report.outcome, 'recovered-residue');
    assert.deepEqual(report.removedObjects, [{ key: lateKey, size: lateKey.length }]);
    assert.deepEqual(inventories.slice(0, 2), [[], [lateKey]]);
    assert.equal(
      runtime.calls.sequence.indexOf('verdict-inventory') <
        runtime.calls.sequence.indexOf('r2-delete'),
      true,
    );
  });

  it('reclassifies and removes residue discovered by the post-proof final inventory', async () => {
    const runtime = createFakeRuntime();
    const account = await runtime.lifecycle.provision('post-proof-race-run');
    await runtime.simulateProductDeletion(account);
    const lateKey = `users/${account.userId}/books/post-proof.epub`;
    runtime.injectObjectOnInventoryCall(3, lateKey, 777);
    const inventories = [];

    const report = await runtime.lifecycle.cleanupPreparedAccount(account, {
      onInventory: async (state) => {
        inventories.push(state.objects.map(({ key, size }) => ({ key, size })));
        runtime.calls.sequence.push(`verdict-inventory:${state.objects.length}`);
      },
    });

    assert.equal(report.outcome, 'recovered-residue');
    assert.deepEqual(report.removedObjects, [{ key: lateKey, size: 777 }]);
    assert.deepEqual(inventories.slice(0, 3), [[], [], [{ key: lateKey, size: 777 }]]);
    assert.equal(
      runtime.calls.sequence.indexOf('verdict-inventory:1') <
        runtime.calls.sequence.indexOf('r2-delete'),
      true,
    );
    assert.deepEqual(report.stateAfter.objects, []);
  });

  it('reports an already-clean product deletion without cleanup mutation', async () => {
    const runtime = createFakeRuntime();
    const account = await runtime.lifecycle.provision('already-clean-run');
    await runtime.simulateProductDeletion(account);

    const report = await runtime.lifecycle.cleanupPreparedAccount(account);

    assert.equal(report.outcome, 'already-clean');
    assert.deepEqual(report.removedObjects, []);
    assert.deepEqual(runtime.calls.deleteObject, []);
    assert.deepEqual(runtime.calls.adminDeleteUser, []);
  });

  it('fails closed on schema inventory or delete-rule drift before mutation', async () => {
    const runtime = createFakeRuntime();
    const account = await runtime.lifecycle.provision('schema-guard-run');
    const objectKey = runtime.addArtifact(account);

    runtime.setSchemaInventory([
      ...ACCOUNT_DELETION_TARGETS.map((target) => ({ ...target })),
      {
        table: 'new_user_table',
        ownerColumn: 'user_id',
        deleteRule: 'CASCADE',
        cleanupMode: 'cascade',
      },
    ]);
    await assert.rejects(
      runtime.lifecycle.deleteMarkedAccount(account.userId),
      /does not match the cleanup contract/,
    );
    assert.deepEqual(runtime.calls.adminDeleteUser, []);
    assert.deepEqual(runtime.calls.deleteObject, []);
    assert.equal(runtime.objects.has(objectKey), true);

    runtime.setSchemaInventory(
      ACCOUNT_DELETION_TARGETS.map((target, index) => ({
        ...target,
        cleanupMode: index === 0 ? 'predelete' : target.cleanupMode,
      })),
    );
    await assert.rejects(
      runtime.lifecycle.finalize(account, () => runtime.simulateProductDeletion(account)),
      /does not match the cleanup contract/,
    );
    assert.equal(runtime.users.has(account.userId), true);
  });

  it('hard-errors before every destructive call for an unmarked account', async () => {
    const runtime = createFakeRuntime();
    const user = runtime.createUnmarkedUser();
    runtime.objects.add(`users/${user.id}/books/real.epub`);

    await assert.rejects(
      runtime.lifecycle.deleteMarkedAccount(user.id),
      new RegExp(UNMARKED_ACCOUNT_ERROR),
    );
    assert.deepEqual(runtime.calls.adminDeleteUser, []);
    assert.deepEqual(runtime.calls.deleteObject, []);
    assert.equal(runtime.users.has(user.id), true);
  });

  it('does not let a prepared handle authorize cleanup of a live unmarked user', async () => {
    const runtime = createFakeRuntime();
    const account = runtime.lifecycle.prepare('unmarked-collision-run');
    runtime.users.set(account.userId, {
      id: account.userId,
      email: 'real@example.test',
      app_metadata: {},
      created_at: '2026-08-11T00:00:00.000Z',
    });
    const objectKey = `users/${account.userId}/books/real.epub`;
    runtime.objects.add(objectKey);

    await assert.rejects(
      runtime.lifecycle.cleanupPreparedAccount(account),
      new RegExp(UNMARKED_ACCOUNT_ERROR),
    );
    assert.deepEqual(runtime.calls.deleteObject, []);
    assert.deepEqual(runtime.calls.adminDeleteUser, []);
    assert.equal(runtime.objects.has(objectKey), true);
  });

  it('finalizes a marked account and independently proves auth, DB, and R2 removal', async () => {
    const runtime = createFakeRuntime();
    const account = await runtime.lifecycle.provision('accept-run');
    const objectKey = runtime.addArtifact(account);
    runtime.addRow('books', account.userId);
    await runtime.lifecycle.signIn(account);

    const proof = await runtime.lifecycle.finalize(account, () =>
      runtime.simulateProductDeletion(account),
    );

    assert.equal(proof.signInRejected, true);
    assert.equal(proof.r2PrefixEmpty, true);
    assert.equal(
      proof.database.every(({ count }) => count === 0),
      true,
    );
    assert.deepEqual(proof.objects, [{ key: objectKey, size: 189_403 }]);
    assert.equal(runtime.users.has(account.userId), false);
    assert.equal(runtime.objects.has(objectKey), false);
  });

  it('does not treat an ambiguous sign-in error as deleted-account proof', async () => {
    const runtime = createFakeRuntime();
    const account = await runtime.lifecycle.provision('auth-proof-run');
    runtime.setRejectedSignInError({ code: 'network_error', message: 'unavailable' });

    await assert.rejects(
      runtime.lifecycle.finalize(account, () => runtime.simulateProductDeletion(account)),
      /expected invalid-credentials code/,
    );
  });

  it('rejects a nominally successful deletion when an R2 object remains', async () => {
    const runtime = createFakeRuntime();
    const account = await runtime.lifecycle.provision('r2-proof-run');
    const objectKey = runtime.addArtifact(account);

    await assert.rejects(
      runtime.lifecycle.finalize(account, () =>
        runtime.simulateProductDeletion(account, { leaveObjects: true }),
      ),
      /left 1 R2 object/,
    );
    assert.equal(runtime.objects.has(objectKey), true);
  });

  it('janitor reaps stale marked users and rowless prefix artifacts through one guard', async () => {
    const runtime = createFakeRuntime();
    const oldMarked = await runtime.lifecycle.provision('old-run');
    const youngMarked = await runtime.lifecycle.provision('young-run');
    const unmarked = runtime.createUnmarkedUser('unmarked-old-user');
    const oldObject = runtime.addArtifact(oldMarked, 'old.epub');
    const legacyObject = runtime.addLegacyArtifact(oldMarked);
    const tempObject = runtime.addTempArtifact(oldMarked);
    const rowlessObject = `users/${oldMarked.userId}/books/rowless.epub`;
    const rowlessLegacyObject = `${oldMarked.userId}/Openread/Books/hash/rowless.epub`;
    runtime.objects.add(rowlessObject);
    runtime.objects.add(rowlessLegacyObject);
    runtime.addRow('books', oldMarked.userId);
    runtime.addRow('user_catalog_wishlist', oldMarked.userId);
    runtime.setCreatedAt(oldMarked.userId, Date.parse('2026-08-11T00:00:00.000Z'));
    runtime.setCreatedAt(youngMarked.userId, Date.parse('2026-08-11T09:59:00.000Z'));

    const report = await runtime.lifecycle.reapStale({ olderThanMs: 60 * 60 * 1000 });

    assert.deepEqual(
      report.reaped.map(({ userId }) => userId),
      [oldMarked.userId],
    );
    assert.deepEqual(report.reaped[0].removedObjects, [
      { key: oldObject, size: 189_403 },
      { key: legacyObject, size: 42 },
      { key: tempObject, size: 17 },
      { key: rowlessObject, size: rowlessObject.length },
      { key: rowlessLegacyObject, size: rowlessLegacyObject.length },
    ]);
    assert.deepEqual(report.failures, []);
    assert.equal(report.marked, 2);
    assert.equal(report.eligible, 1);
    assert.equal(runtime.users.has(oldMarked.userId), false);
    assert.equal(runtime.objects.has(oldObject), false);
    assert.equal(runtime.objects.has(legacyObject), false);
    assert.equal(runtime.objects.has(tempObject), false);
    assert.equal(runtime.objects.has(rowlessObject), false);
    assert.equal(runtime.objects.has(rowlessLegacyObject), false);
    assert.equal(runtime.users.has(youngMarked.userId), true);
    assert.equal(runtime.users.has(unmarked.id), true);
    assert.equal(runtime.rowCount('user_catalog_wishlist', oldMarked.userId), 0);
    assert.deepEqual(runtime.calls.adminDeleteUser, [oldMarked.userId]);
    assert.deepEqual(runtime.calls.sequence, [
      'predelete:user_catalog_wishlist',
      'r2-delete',
      'r2-delete',
      'r2-delete',
      'r2-delete',
      'r2-delete',
      'auth-delete',
    ]);
  });

  it('does not report janitor success until a post-auth final-inventory write is removed', async () => {
    const runtime = createFakeRuntime();
    const account = await runtime.lifecycle.provision('janitor-final-race-run');
    runtime.setCreatedAt(account.userId, Date.parse('2026-08-11T00:00:00.000Z'));
    const lateKey = `users/${account.userId}/books/janitor-post-proof.epub`;
    runtime.injectObjectOnInventoryCall(6, lateKey, 888);

    const report = await runtime.lifecycle.reapStale({ olderThanMs: 60 * 60 * 1000 });

    assert.equal(report.failures.length, 0);
    assert.deepEqual(report.reaped[0].removedObjects, [{ key: lateKey, size: 888 }]);
    assert.deepEqual(report.reaped[0].stateAfter.objects, []);
    assert.equal(runtime.objects.has(lateKey), false);
  });

  it('reports janitor predelete failure without reaching R2 or auth deletion', async () => {
    const runtime = createFakeRuntime();
    const account = await runtime.lifecycle.provision('predelete-failure-run');
    const objectKey = runtime.addArtifact(account);
    runtime.addRow('user_catalog_wishlist', account.userId);
    runtime.setCreatedAt(account.userId, Date.parse('2026-08-11T00:00:00.000Z'));
    runtime.failPredelete();

    const report = await runtime.lifecycle.reapStale({ olderThanMs: 60 * 60 * 1000 });

    assert.deepEqual(report.reaped, []);
    assert.equal(report.failures.length, 1);
    assert.equal(report.failures[0].userId, account.userId);
    assert.equal(runtime.users.has(account.userId), true);
    assert.equal(runtime.objects.has(objectKey), true);
    assert.equal(runtime.rowCount('user_catalog_wishlist', account.userId), 1);
    assert.deepEqual(runtime.calls.deleteObject, []);
    assert.deepEqual(runtime.calls.adminDeleteUser, []);
    assert.deepEqual(runtime.calls.sequence, ['predelete:user_catalog_wishlist']);
  });

  it('reports surviving predelete rows without reaching R2 or auth deletion', async () => {
    const runtime = createFakeRuntime();
    const account = await runtime.lifecycle.provision('predelete-survivor-run');
    const objectKey = runtime.addArtifact(account);
    runtime.addRow('user_catalog_wishlist', account.userId);
    runtime.setCreatedAt(account.userId, Date.parse('2026-08-11T00:00:00.000Z'));
    runtime.leavePredeleteRows();

    const report = await runtime.lifecycle.reapStale({ olderThanMs: 60 * 60 * 1000 });

    assert.deepEqual(report.reaped, []);
    assert.equal(report.failures.length, 1);
    assert.match(report.failures[0].error, /could not prove zero rows/);
    assert.equal(runtime.users.has(account.userId), true);
    assert.equal(runtime.objects.has(objectKey), true);
    assert.equal(runtime.rowCount('user_catalog_wishlist', account.userId), 1);
    assert.deepEqual(runtime.calls.deleteObject, []);
    assert.deepEqual(runtime.calls.adminDeleteUser, []);
    assert.deepEqual(runtime.calls.sequence, ['predelete:user_catalog_wishlist']);
  });

  it('keeps the marked auth user when full R2 inventory is ambiguous', async () => {
    const runtime = createFakeRuntime();
    const account = await runtime.lifecycle.provision('inventory-failure-run');
    runtime.setCreatedAt(account.userId, Date.parse('2026-08-11T00:00:00.000Z'));
    runtime.failObjectInventory();

    const report = await runtime.lifecycle.reapStale({ olderThanMs: 60 * 60 * 1000 });

    assert.deepEqual(report.reaped, []);
    assert.equal(report.failures.length, 1);
    assert.equal(runtime.users.has(account.userId), true);
    assert.deepEqual(runtime.calls.adminDeleteUser, []);
  });
});
