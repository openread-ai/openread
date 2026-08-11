import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  finalizeProductAccountDeletion,
  listAllAdminUsers,
  listUserObjectKeys,
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
  it('collects every page for the exact user prefix', async () => {
    const inputs = [];
    const keys = await listUserObjectKeys({
      userId: 'marked-user',
      bucket: 'test-bucket',
      send: async (command) => {
        inputs.push(command.input);
        if (inputs.length === 1) {
          return {
            Contents: [{ Key: 'users/marked-user/books/one.epub' }],
            IsTruncated: true,
            NextContinuationToken: 'page-2',
          };
        }
        return {
          Contents: [{ Key: 'users/marked-user/books/two.epub' }],
          IsTruncated: false,
        };
      },
    });

    assert.deepEqual(keys, [
      'users/marked-user/books/one.epub',
      'users/marked-user/books/two.epub',
    ]);
    assert.equal(inputs[0].Prefix, 'users/marked-user/');
    assert.equal(inputs[0].ContinuationToken, undefined);
    assert.equal(inputs[1].ContinuationToken, 'page-2');
  });

  it('fails closed when a truncated page has no continuation token', async () => {
    await assert.rejects(
      listUserObjectKeys({
        userId: 'marked-user',
        bucket: 'test-bucket',
        send: async () => ({ IsTruncated: true }),
      }),
      /pagination returned no continuation token/,
    );
  });

  it('fails closed when pagination repeats a continuation token', async () => {
    await assert.rejects(
      listUserObjectKeys({
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
  it('accepts the existing server-only Supabase and R2 environment', () => {
    const config = readAccountLifecycleEnvironment(completeEnvironment());

    assert.equal(config.supabaseServiceRoleKey, 'server-only-service-role');
    assert.equal(config.r2Bucket, 'r2-bucket');
  });

  it('refuses a missing service-role key even when a NEXT_PUBLIC variant exists', () => {
    const env = completeEnvironment();
    delete env.SUPABASE_SERVICE_ROLE_KEY;
    env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY = 'must-not-be-accepted';

    assert.throws(
      () => readAccountLifecycleEnvironment(env),
      /Missing required account lifecycle environment: SUPABASE_SERVICE_ROLE_KEY/,
    );
  });
});
