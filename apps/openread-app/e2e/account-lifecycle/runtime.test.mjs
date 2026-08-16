import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  finalizeProductAccountDeletion,
  listAllAdminUsers,
  listUserObjects,
  readAccountLifecycleEnvironment,
} from './runtime.mjs';

const completeEnvironment = () => ({
  NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.test',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key',
  SUPABASE_SERVICE_ROLE_KEY: 'server-only-service-role',
  R2_ACCOUNT_ID: 'r2-account',
  R2_ACCESS_KEY_ID: 'r2-access',
  R2_SECRET_ACCESS_KEY: 'r2-secret',
  R2_BUCKET_NAME: 'r2-bucket',
});

describe('R2 user-prefix inventory', () => {
  it('collects every page across both exact user-owned prefixes', async () => {
    const inputs = [];
    const objects = await listUserObjects({
      userId: 'marked-user',
      bucket: 'test-bucket',
      send: async (command) => {
        inputs.push(command.input);
        if (command.input.Prefix === 'users/marked-user/' && !command.input.ContinuationToken) {
          return {
            Contents: [{ Key: 'users/marked-user/books/one.epub', Size: 101 }],
            IsTruncated: true,
            NextContinuationToken: 'page-2',
          };
        }
        if (command.input.Prefix === 'users/marked-user/') {
          return {
            Contents: [{ Key: 'users/marked-user/books/two.epub', Size: 202 }],
            IsTruncated: false,
          };
        }
        if (!command.input.ContinuationToken) {
          return {
            Contents: [{ Key: 'marked-user/Openread/Books/hash/legacy-one.epub', Size: 303 }],
            IsTruncated: true,
            NextContinuationToken: 'legacy-page-2',
          };
        }
        return {
          Contents: [{ Key: 'marked-user/Openread/Books/hash/legacy-two.epub', Size: 404 }],
          IsTruncated: false,
        };
      },
    });

    assert.deepEqual(objects, [
      { key: 'users/marked-user/books/one.epub', size: 101 },
      { key: 'users/marked-user/books/two.epub', size: 202 },
      { key: 'marked-user/Openread/Books/hash/legacy-one.epub', size: 303 },
      { key: 'marked-user/Openread/Books/hash/legacy-two.epub', size: 404 },
    ]);
    assert.equal(inputs[0].Prefix, 'users/marked-user/');
    assert.equal(inputs[0].ContinuationToken, undefined);
    assert.equal(inputs[1].ContinuationToken, 'page-2');
    assert.equal(inputs[2].Prefix, 'marked-user/Openread/Books/');
    assert.equal(inputs[2].ContinuationToken, undefined);
    assert.equal(inputs[3].Prefix, 'marked-user/Openread/Books/');
    assert.equal(inputs[3].ContinuationToken, 'legacy-page-2');
  });

  it('fails closed when an object has no exact byte size', async () => {
    await assert.rejects(
      listUserObjects({
        userId: 'marked-user',
        bucket: 'test-bucket',
        send: async ({ input }) =>
          input.Prefix === 'users/marked-user/'
            ? {
                Contents: [{ Key: 'users/marked-user/books/book.epub' }],
                IsTruncated: false,
              }
            : { Contents: [], IsTruncated: false },
      }),
      /invalid size/,
    );
  });

  it('fails closed when a truncated page has no continuation token', async () => {
    await assert.rejects(
      listUserObjects({
        userId: 'marked-user',
        bucket: 'test-bucket',
        send: async () => ({ IsTruncated: true }),
      }),
      /pagination returned no continuation token/,
    );
  });

  it('fails closed when pagination repeats a continuation token', async () => {
    await assert.rejects(
      listUserObjects({
        userId: 'marked-user',
        bucket: 'test-bucket',
        send: async () => ({ IsTruncated: true, NextContinuationToken: 'repeat' }),
      }),
      /pagination did not advance/,
    );
  });
});

describe('Supabase admin user inventory', () => {
  it('reconciles all pages with total and page metadata', async () => {
    const users = await listAllAdminUsers(async (page) => ({
      data: {
        users: [{ id: `user-${page}` }],
        total: 2,
        lastPage: 2,
        nextPage: page === 1 ? 2 : null,
      },
      error: null,
    }));

    assert.deepEqual(
      users.map(({ id }) => id),
      ['user-1', 'user-2'],
    );
  });

  it('fails closed on malformed or inconsistent pagination metadata', async () => {
    await assert.rejects(
      listAllAdminUsers(async () => ({
        data: { users: [], total: 1, lastPage: 1, nextPage: null },
        error: null,
      })),
      /total did not match received users/,
    );
    await assert.rejects(
      listAllAdminUsers(async () => ({
        data: { users: null, total: 0, lastPage: 0, nextPage: null },
        error: null,
      })),
      /malformed users data/,
    );
  });
});

describe('product account deletion binding', () => {
  const account = { userId: 'marked-user', email: 'e2e@example.test', password: 'Password1!' };

  it('rejects a mismatched token before product fetch or guarded finalization', async () => {
    let finalized = false;
    let fetched = false;

    await assert.rejects(
      finalizeProductAccountDeletion({
        account,
        accessToken: 'other-user-token',
        resolveTokenUserId: async () => 'other-user',
        lifecycle: {
          finalize: async () => {
            finalized = true;
          },
        },
        productApiBaseUrl: 'https://api.example.test/api',
        fetchImpl: async () => {
          fetched = true;
          return { ok: true, status: 200 };
        },
      }),
      /mismatched account access token/,
    );

    assert.equal(finalized, false);
    assert.equal(fetched, false);
  });

  it('rejects an unverifiable token before product fetch or guarded finalization', async () => {
    let finalized = false;
    let fetched = false;

    await assert.rejects(
      finalizeProductAccountDeletion({
        account,
        accessToken: 'invalid-token',
        resolveTokenUserId: async () => {
          throw new Error('verification failed');
        },
        lifecycle: {
          finalize: async () => {
            finalized = true;
          },
        },
        productApiBaseUrl: 'https://api.example.test/api',
        fetchImpl: async () => {
          fetched = true;
          return { ok: true, status: 200 };
        },
      }),
      /verification failed/,
    );

    assert.equal(finalized, false);
    assert.equal(fetched, false);
  });

  it('rejects a network timeout or non-2xx product response as incomplete', async () => {
    const lifecycle = {
      finalize: async (_account, action) => action(),
    };
    const shared = {
      account,
      accessToken: 'marked-user-token',
      resolveTokenUserId: async () => account.userId,
      lifecycle,
      productApiBaseUrl: 'https://api.example.test/api',
    };

    await assert.rejects(
      finalizeProductAccountDeletion({
        ...shared,
        requestTimeoutMs: 1,
        fetchImpl: async () => new Promise(() => {}),
      }),
      /request timed out/,
    );
    await assert.rejects(
      finalizeProductAccountDeletion({
        ...shared,
        fetchImpl: async () => ({ ok: false, status: 503 }),
      }),
      /failed \(503\)/,
    );
  });

  it('lets a matching token reach guarded finalization and the product endpoint', async () => {
    const calls = [];
    const result = await finalizeProductAccountDeletion({
      account,
      accessToken: 'marked-user-token',
      resolveTokenUserId: async () => account.userId,
      lifecycle: {
        finalize: async (receivedAccount, action) => {
          calls.push(['finalize', receivedAccount.userId]);
          await action();
          return { ok: true };
        },
      },
      productApiBaseUrl: 'https://api.example.test/api',
      fetchImpl: async (url, init) => {
        calls.push(['fetch', url, init.method, init.headers.Authorization]);
        return { ok: true, status: 200 };
      },
    });

    assert.deepEqual(result, { ok: true });
    assert.deepEqual(calls, [
      ['finalize', account.userId],
      ['fetch', 'https://api.example.test/api/user/delete', 'DELETE', 'Bearer marked-user-token'],
    ]);
  });
});

describe('account lifecycle environment boundary', () => {
  it('accepts the canonical server-only Supabase service-role key', () => {
    const config = readAccountLifecycleEnvironment(completeEnvironment());

    assert.equal(config.supabaseServiceRoleKey, 'server-only-service-role');
    assert.equal(config.r2Bucket, 'r2-bucket');
  });

  it('accepts the canonical R2 bucket name', () => {
    const env = completeEnvironment();
    delete env.R2_BUCKET_NAME;
    const config = readAccountLifecycleEnvironment({ ...env, R2_BUCKET: 'canonical-bucket' });

    assert.equal(config.r2Bucket, 'canonical-bucket');
  });

  it('prefers the canonical R2 bucket name when both names are set', () => {
    const config = readAccountLifecycleEnvironment({
      ...completeEnvironment(),
      R2_BUCKET: 'canonical-bucket',
    });

    assert.equal(config.r2Bucket, 'canonical-bucket');
  });

  it('fails closed when neither R2 bucket name is set', () => {
    const env = completeEnvironment();
    delete env.R2_BUCKET_NAME;

    assert.throws(
      () => readAccountLifecycleEnvironment(env),
      /Missing required account lifecycle environment: R2_BUCKET or R2_BUCKET_NAME/,
    );
  });

  it('accepts the legacy Supabase admin-key name during the alias window', () => {
    const env = completeEnvironment();
    delete env.SUPABASE_SERVICE_ROLE_KEY;
    env.SUPABASE_ADMIN_KEY = 'legacy-service-role';

    assert.equal(
      readAccountLifecycleEnvironment(env).supabaseServiceRoleKey,
      'legacy-service-role',
    );
  });

  it('prefers the canonical Supabase service-role key when both names are set', () => {
    const env = { ...completeEnvironment(), SUPABASE_ADMIN_KEY: 'legacy-service-role' };

    assert.equal(
      readAccountLifecycleEnvironment(env).supabaseServiceRoleKey,
      'server-only-service-role',
    );
  });

  it('refuses both absent names even when a NEXT_PUBLIC variant exists', () => {
    const env = completeEnvironment();
    delete env.SUPABASE_SERVICE_ROLE_KEY;
    env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY = 'must-not-be-accepted';

    assert.throws(
      () => readAccountLifecycleEnvironment(env),
      /Missing required account lifecycle environment: SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ADMIN_KEY/,
    );
  });
});
