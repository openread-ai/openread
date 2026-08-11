import {
  DeleteObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { createClient } from '@supabase/supabase-js';
import { getUserOwnedObjectPrefixes } from '@openread/storage';
import { randomUUID } from 'node:crypto';
import { createAccountLifecycle } from './account-lifecycle.mjs';

const DEFAULT_PRODUCT_API_BASE_URL = 'https://api.openread.ai/api';
const REMOTE_OPERATION_TIMEOUT_MS = 30_000;

const requiredEnv = (env, ...names) => {
  for (const name of names) {
    const value = env[name]?.trim();
    if (value) return value;
  }
  throw new Error(`Missing required account lifecycle environment: ${names.join(' or ')}`);
};

const isSupabaseUserNotFound = (error) =>
  error?.name === 'AuthApiError' && error?.status === 404 && error?.code === 'user_not_found';

const isR2ObjectNotFound = (error) => {
  const name = error?.name ?? error?.Code;
  return name === 'NotFound' || name === 'NoSuchKey';
};

const assertResponseOk = (response, action) => {
  if (!response.ok) throw new Error(`${action} failed (${response.status})`);
};

const withTimeout = async (promise, timeoutMs, label) => {
  let timeout;
  const timeoutPromise = new Promise((_, reject) => {
    timeout = setTimeout(() => reject(new Error(`${label} timed out`)), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timeout);
  }
};

export function readAccountLifecycleEnvironment(env = process.env) {
  return Object.freeze({
    supabaseUrl: requiredEnv(env, 'SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL'),
    supabaseAnonKey: requiredEnv(env, 'SUPABASE_ANON_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    supabaseServiceRoleKey: requiredEnv(env, 'SUPABASE_SERVICE_ROLE_KEY'),
    r2AccountId: requiredEnv(env, 'R2_ACCOUNT_ID'),
    r2AccessKeyId: requiredEnv(env, 'R2_ACCESS_KEY_ID'),
    r2SecretAccessKey: requiredEnv(env, 'R2_SECRET_ACCESS_KEY'),
    r2Bucket: requiredEnv(env, 'R2_BUCKET', 'R2_BUCKET_NAME'),
    productApiBaseUrl:
      env.OPENREAD_E2E_PRODUCT_API_BASE_URL?.replace(/\/+$/, '') ?? DEFAULT_PRODUCT_API_BASE_URL,
  });
}

export async function finalizeProductAccountDeletion({
  account,
  accessToken,
  resolveTokenUserId,
  lifecycle,
  productApiBaseUrl,
  fetchImpl = fetch,
  requestTimeoutMs = REMOTE_OPERATION_TIMEOUT_MS,
}) {
  if (typeof accessToken !== 'string' || !accessToken) {
    throw new Error('Product account deletion requires an access token');
  }
  const tokenUserId = await resolveTokenUserId(accessToken);
  if (tokenUserId !== account.userId) {
    throw new Error('Refusing product deletion with a mismatched account access token');
  }
  return lifecycle.finalize(account, async () => {
    const response = await withTimeout(
      fetchImpl(`${productApiBaseUrl}/user/delete`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` },
      }),
      requestTimeoutMs,
      'Product account deletion request',
    );
    assertResponseOk(response, 'Product account deletion');
  });
}

export async function listUserObjects({ userId, bucket, send }) {
  const objects = [];
  for (const prefix of getUserOwnedObjectPrefixes(userId)) {
    const seenTokens = new Set();
    let continuationToken;
    do {
      const requestToken = continuationToken;
      const response = await send(
        new ListObjectsV2Command({
          Bucket: bucket,
          Prefix: prefix,
          ContinuationToken: continuationToken,
          MaxKeys: 1000,
        }),
      );
      if (response.Contents !== undefined && !Array.isArray(response.Contents)) {
        throw new Error('R2 inventory returned malformed contents');
      }
      if (response.IsTruncated !== undefined && typeof response.IsTruncated !== 'boolean') {
        throw new Error('R2 inventory returned malformed truncation metadata');
      }
      for (const object of response.Contents ?? []) {
        if (typeof object.Key !== 'string' || !object.Key.startsWith(prefix)) {
          throw new Error('R2 inventory returned an empty or out-of-prefix key');
        }
        if (!Number.isSafeInteger(object.Size) || object.Size < 0) {
          throw new Error(`R2 inventory returned an invalid size for ${object.Key}`);
        }
        objects.push(Object.freeze({ key: object.Key, size: object.Size }));
      }
      if (response.IsTruncated) {
        const nextToken = response.NextContinuationToken;
        if (!nextToken) throw new Error('R2 inventory pagination returned no continuation token');
        if (nextToken === requestToken || seenTokens.has(nextToken)) {
          throw new Error('R2 inventory pagination did not advance');
        }
        seenTokens.add(nextToken);
        continuationToken = nextToken;
      } else {
        if (response.NextContinuationToken) {
          throw new Error('R2 inventory returned a continuation token without truncation');
        }
        continuationToken = undefined;
      }
    } while (continuationToken);
  }
  return objects;
}

export async function listAllAdminUsers(fetchPage, perPage = 1000) {
  const users = [];
  const seenUserIds = new Set();
  let expectedTotal;
  let expectedLastPage;
  let page = 1;

  for (;;) {
    const { data, error } = await fetchPage(page, perPage);
    if (error) throw new Error(`Supabase admin user listing failed: ${error.message}`);
    if (!data || !Array.isArray(data.users)) {
      throw new Error('Supabase admin user listing returned malformed users data');
    }
    if (!Number.isSafeInteger(data.total) || data.total < 0) {
      throw new Error('Supabase admin user listing returned an invalid total');
    }
    if (!Number.isSafeInteger(data.lastPage) || data.lastPage < 0) {
      throw new Error('Supabase admin user listing returned an invalid last page');
    }

    expectedTotal ??= data.total;
    expectedLastPage ??= data.lastPage;
    if (data.total !== expectedTotal || data.lastPage !== expectedLastPage) {
      throw new Error('Supabase admin user pagination metadata changed during listing');
    }

    const finalPage = Math.max(1, expectedLastPage);
    const expectedNextPage = page < finalPage ? page + 1 : null;
    if ((data.nextPage ?? null) !== expectedNextPage) {
      throw new Error('Supabase admin user pagination did not advance consistently');
    }

    for (const user of data.users) {
      if (!user || typeof user.id !== 'string' || seenUserIds.has(user.id)) {
        throw new Error('Supabase admin user listing returned malformed or duplicate users');
      }
      seenUserIds.add(user.id);
      users.push(user);
    }

    if (page === finalPage) break;
    page = expectedNextPage;
  }

  if (users.length !== expectedTotal) {
    throw new Error('Supabase admin user listing total did not match received users');
  }
  return users;
}

export function createLiveAccountLifecycle(env = process.env) {
  const config = readAccountLifecycleEnvironment(env);
  const admin = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const anon = createClient(config.supabaseUrl, config.supabaseAnonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const r2 = new S3Client({
    region: 'auto',
    endpoint: `https://${config.r2AccountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: config.r2AccessKeyId,
      secretAccessKey: config.r2SecretAccessKey,
    },
  });

  const adminGetUser = async (userId) => {
    const { data, error } = await withTimeout(
      admin.auth.admin.getUserById(userId),
      REMOTE_OPERATION_TIMEOUT_MS,
      'Supabase admin user lookup',
    );
    if (error) {
      if (isSupabaseUserNotFound(error)) return null;
      throw new Error(`Supabase admin user lookup failed: ${error.message}`);
    }
    if (!data.user) throw new Error('Supabase admin user lookup returned no user or error');
    return data.user;
  };

  const listUsers = () =>
    listAllAdminUsers((page, perPage) =>
      withTimeout(
        admin.auth.admin.listUsers({ page, perPage }),
        REMOTE_OPERATION_TIMEOUT_MS,
        'Supabase admin user listing',
      ),
    );

  const listObjects = (userId) =>
    listUserObjects({
      userId,
      bucket: config.r2Bucket,
      send: (command) =>
        withTimeout(r2.send(command), REMOTE_OPERATION_TIMEOUT_MS, 'R2 inventory request'),
    });

  const lifecycle = createAccountLifecycle({
    adminCreateUser: async (attributes) => {
      const { data, error } = await withTimeout(
        admin.auth.admin.createUser(attributes),
        REMOTE_OPERATION_TIMEOUT_MS,
        'Supabase admin provisioning',
      );
      if (error) throw new Error(`Supabase admin provisioning failed: ${error.message}`);
      return data.user;
    },
    adminGetUser,
    adminDeleteUser: async (userId) => {
      const { error } = await withTimeout(
        admin.auth.admin.deleteUser(userId),
        REMOTE_OPERATION_TIMEOUT_MS,
        'Supabase admin deletion',
      );
      if (error) throw new Error(`Supabase admin deletion failed: ${error.message}`);
    },
    listUsers,
    signInWithPassword: async (email, password) => {
      const { data, error } = await withTimeout(
        anon.auth.signInWithPassword({ email, password }),
        REMOTE_OPERATION_TIMEOUT_MS,
        'Supabase password sign-in',
      );
      return { session: data.session, error };
    },
    queryDeletionSchemaInventory: async () => {
      const { data, error } = await withTimeout(
        admin.rpc('account_deletion_schema_inventory'),
        REMOTE_OPERATION_TIMEOUT_MS,
        'Account deletion schema inventory',
      );
      if (error) throw new Error(`Account deletion schema inventory failed: ${error.message}`);
      if (!Array.isArray(data)) {
        throw new Error('Account deletion schema inventory returned no rows array');
      }
      return data.map((row) => ({
        table: row?.table_name,
        ownerColumn: row?.owner_column,
        deleteRule: row?.delete_rule,
        cleanupMode: row?.cleanup_mode,
      }));
    },
    queryFileRecords: async (userId) => {
      const { data, error } = await withTimeout(
        admin.from('files').select('file_key, file_type, file_size').eq('user_id', userId),
        REMOTE_OPERATION_TIMEOUT_MS,
        'File metadata query',
      );
      if (error) throw new Error(`File metadata query failed: ${error.message}`);
      if (!Array.isArray(data)) throw new Error('File metadata query returned no rows array');
      return data;
    },
    listObjects,
    deleteTableRows: async ({ table, ownerColumn }, userId) => {
      const { error } = await withTimeout(
        admin.from(table).delete().eq(ownerColumn, userId),
        REMOTE_OPERATION_TIMEOUT_MS,
        `Predelete cleanup for ${table}`,
      );
      if (error) throw new Error(`Predelete cleanup failed for ${table}: ${error.message}`);
    },
    queryTableCount: async ({ table, ownerColumn }, userId) => {
      const { count, error } = await withTimeout(
        admin
          .from(table)
          .select(ownerColumn, { count: 'exact', head: true })
          .eq(ownerColumn, userId),
        REMOTE_OPERATION_TIMEOUT_MS,
        `Deletion verification query for ${table}`,
      );
      if (error)
        throw new Error(`Deletion verification query failed for ${table}: ${error.message}`);
      if (count == null) throw new Error(`Deletion verification returned no count for ${table}`);
      return count;
    },
    headObject: async (key) => {
      try {
        const result = await withTimeout(
          r2.send(new HeadObjectCommand({ Bucket: config.r2Bucket, Key: key })),
          REMOTE_OPERATION_TIMEOUT_MS,
          'R2 object verification',
        );
        if (!Number.isSafeInteger(result.ContentLength) || result.ContentLength < 0) {
          throw new Error(`R2 HEAD returned an invalid size for ${key}`);
        }
        return { exists: true, size: result.ContentLength };
      } catch (error) {
        if (isR2ObjectNotFound(error)) return { exists: false, size: null };
        throw new Error(
          `R2 verification failed: ${error instanceof Error ? error.message : error}`,
        );
      }
    },
    deleteObject: async (key) => {
      await withTimeout(
        r2.send(new DeleteObjectCommand({ Bucket: config.r2Bucket, Key: key })),
        REMOTE_OPERATION_TIMEOUT_MS,
        'R2 object deletion',
      );
    },
  });

  const finalizeThroughProductApi = (account, accessToken) =>
    finalizeProductAccountDeletion({
      account,
      accessToken,
      resolveTokenUserId: async (token) => {
        const { data, error } = await withTimeout(
          anon.auth.getUser(token),
          REMOTE_OPERATION_TIMEOUT_MS,
          'Product account access-token verification',
        );
        if (error) throw new Error('Product account access token could not be verified');
        return data.user?.id;
      },
      lifecycle,
      productApiBaseUrl: config.productApiBaseUrl,
    });

  const seedSentinelArtifact = async (account) => {
    await lifecycle.captureArtifacts(account.userId);
    const token = randomUUID();
    const key = `users/${account.userId}/books/e2e-${token}.epub`;
    const body = Buffer.from('OpenRead E2E lifecycle deletion sentinel\n', 'utf8');

    await withTimeout(
      r2.send(
        new PutObjectCommand({
          Bucket: config.r2Bucket,
          Key: key,
          Body: body,
          ContentType: 'application/epub+zip',
        }),
      ),
      REMOTE_OPERATION_TIMEOUT_MS,
      'Sentinel object upload',
    );

    const { error } = await withTimeout(
      admin.from('files').insert({
        user_id: account.userId,
        book_hash: null,
        file_key: key,
        file_size: body.byteLength,
        file_type: 'book',
        status: 'active',
        deleted_at: null,
      }),
      REMOTE_OPERATION_TIMEOUT_MS,
      'Sentinel file metadata insert',
    );
    if (error) {
      await withTimeout(
        r2.send(new DeleteObjectCommand({ Bucket: config.r2Bucket, Key: key })),
        REMOTE_OPERATION_TIMEOUT_MS,
        'Failed-sentinel object cleanup',
      );
      throw new Error(`Sentinel file metadata insert failed: ${error.message}`);
    }
    return key;
  };

  return Object.freeze({
    lifecycle,
    finalizeThroughProductApi,
    seedSentinelArtifact,
  });
}
