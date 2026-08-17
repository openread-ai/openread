import { createClient } from '@supabase/supabase-js';
import { assertAccountDeletionSchemaInventory } from '@openread/types';
import test from 'node:test';

const requiredEnv = (...names) => {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  throw new Error(`Missing account deletion schema test environment: ${names.join(' or ')}`);
};

const withTimeout = async (promise, timeoutMs) => {
  let timeout;
  const timeoutPromise = new Promise((_, reject) => {
    timeout = setTimeout(
      () => reject(new Error('Account deletion schema query timed out')),
      timeoutMs,
    );
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timeout);
  }
};

test('queries the database schema at runtime and matches the deletion contract', async () => {
  const supabase = createClient(
    requiredEnv('SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL'),
    requiredEnv('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { data, error } = await withTimeout(
    supabase.rpc('account_deletion_schema_inventory'),
    30_000,
  );
  if (error) throw new Error(`Account deletion schema query failed: ${error.message}`);
  if (!Array.isArray(data)) throw new Error('Account deletion schema query returned no rows');

  assertAccountDeletionSchemaInventory(
    data.map((row) => ({
      table: row?.table_name,
      ownerColumn: row?.owner_column,
      deleteRule: row?.delete_rule,
      cleanupMode: row?.cleanup_mode,
    })),
  );
});
