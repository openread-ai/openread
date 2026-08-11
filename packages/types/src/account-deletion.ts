export const ACCOUNT_DELETION_CLEANUP_MODES = {
  CASCADE: 'cascade',
  PREDELETE: 'predelete',
} as const;

export type AccountDeletionCleanupMode =
  (typeof ACCOUNT_DELETION_CLEANUP_MODES)[keyof typeof ACCOUNT_DELETION_CLEANUP_MODES];

export const ACCOUNT_DELETION_DELETE_RULES = {
  CASCADE: 'CASCADE',
  NO_ACTION: 'NO ACTION',
  RESTRICT: 'RESTRICT',
  SET_NULL: 'SET NULL',
  SET_DEFAULT: 'SET DEFAULT',
  NONE: 'NONE',
  AMBIGUOUS: 'AMBIGUOUS',
} as const;

export type AccountDeletionDeleteRule =
  (typeof ACCOUNT_DELETION_DELETE_RULES)[keyof typeof ACCOUNT_DELETION_DELETE_RULES];

const cascadeTarget = <Table extends string, OwnerColumn extends string>(
  table: Table,
  ownerColumn: OwnerColumn,
) =>
  Object.freeze({
    table,
    ownerColumn,
    deleteRule: ACCOUNT_DELETION_DELETE_RULES.CASCADE,
    cleanupMode: ACCOUNT_DELETION_CLEANUP_MODES.CASCADE,
  });

const predeleteTarget = <Table extends string, OwnerColumn extends string>(
  table: Table,
  ownerColumn: OwnerColumn,
) =>
  Object.freeze({
    table,
    ownerColumn,
    deleteRule: ACCOUNT_DELETION_DELETE_RULES.NONE,
    cleanupMode: ACCOUNT_DELETION_CLEANUP_MODES.PREDELETE,
  });

// Current public relations whose rows must be absent after account deletion.
// The live pg_catalog-backed inventory is compared with this contract before
// provisioning or destructive cleanup, so schema/rule drift fails closed.
export const ACCOUNT_DELETION_TARGETS = Object.freeze([
  cascadeTarget('books', 'user_id'),
  cascadeTarget('book_configs', 'user_id'),
  cascadeTarget('book_notes', 'user_id'),
  cascadeTarget('files', 'user_id'),
  cascadeTarget('user_book_refs', 'user_id'),
  cascadeTarget('mcp_platform_tokens', 'user_id'),
  cascadeTarget('usage_logs', 'user_id'),
  cascadeTarget('user_provider_keys', 'user_id'),
  cascadeTarget('ai_conversations', 'user_id'),
  cascadeTarget('ai_messages', 'user_id'),
  cascadeTarget('storage_addons', 'user_id'),
  cascadeTarget('boost_purchases', 'user_id'),
  cascadeTarget('cancel_surveys', 'user_id'),
  cascadeTarget('catalog_add_request', 'user_id'),
  cascadeTarget('sync_processed_mutations', 'user_id'),
  predeleteTarget('user_catalog_wishlist', 'user_id'),
  cascadeTarget('user_collections', 'user_id'),
  cascadeTarget('user_settings', 'user_id'),
  cascadeTarget('plans', 'id'),
  cascadeTarget('subscriptions', 'user_id'),
  cascadeTarget('apple_iap_subscriptions', 'user_id'),
  cascadeTarget('google_iap_subscriptions', 'user_id'),
  cascadeTarget('customers', 'user_id'),
  cascadeTarget('payments', 'user_id'),
  cascadeTarget('processed_requests', 'user_id'),
] as const);

export type AccountDeletionTarget = (typeof ACCOUNT_DELETION_TARGETS)[number];

export type AccountDeletionSchemaInventoryRow = {
  table: string;
  ownerColumn: string;
  deleteRule: AccountDeletionDeleteRule;
  cleanupMode: AccountDeletionCleanupMode;
};

const inventoryKey = ({ table, ownerColumn }: Pick<AccountDeletionSchemaInventoryRow, 'table' | 'ownerColumn'>) =>
  `${table}\u0000${ownerColumn}`;

export function assertAccountDeletionSchemaInventory(
  inventory: readonly AccountDeletionSchemaInventoryRow[],
): void {
  if (!Array.isArray(inventory)) {
    throw new Error('Account deletion schema inventory is unavailable');
  }

  const expected = new Map(ACCOUNT_DELETION_TARGETS.map((target) => [inventoryKey(target), target]));
  const actual = new Map<string, AccountDeletionSchemaInventoryRow>();

  for (const row of inventory) {
    if (
      !row ||
      typeof row.table !== 'string' ||
      typeof row.ownerColumn !== 'string' ||
      !Object.values(ACCOUNT_DELETION_DELETE_RULES).includes(row.deleteRule) ||
      !Object.values(ACCOUNT_DELETION_CLEANUP_MODES).includes(row.cleanupMode)
    ) {
      throw new Error('Account deletion schema inventory is malformed');
    }
    const key = inventoryKey(row);
    if (actual.has(key)) throw new Error('Account deletion schema inventory contains duplicates');
    actual.set(key, row);
  }

  if (actual.size !== expected.size) {
    throw new Error('Account deletion schema inventory does not match the cleanup contract');
  }

  for (const [key, target] of expected) {
    const row = actual.get(key);
    if (row?.deleteRule !== target.deleteRule || row.cleanupMode !== target.cleanupMode) {
      throw new Error('Account deletion schema inventory does not match the cleanup contract');
    }
  }
}
