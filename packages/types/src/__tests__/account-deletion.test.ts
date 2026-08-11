import { describe, expect, it } from 'vitest';
import {
  ACCOUNT_DELETION_TARGETS,
  assertAccountDeletionSchemaInventory,
  type AccountDeletionSchemaInventoryRow,
} from '../account-deletion.js';

const currentInventory = (): AccountDeletionSchemaInventoryRow[] =>
  ACCOUNT_DELETION_TARGETS.map((target) => ({ ...target }));

describe('account deletion schema contract', () => {
  it('accepts an independently supplied exact schema inventory', () => {
    expect(() => assertAccountDeletionSchemaInventory(currentInventory())).not.toThrow();
  });

  it('rejects missing, additional, duplicate, malformed, or reclassified targets', () => {
    const exact = currentInventory();

    expect(() => assertAccountDeletionSchemaInventory(exact.slice(1))).toThrow(
      /does not match the cleanup contract/,
    );
    expect(() =>
      assertAccountDeletionSchemaInventory([
        ...exact,
        {
          table: 'new_user_table',
          ownerColumn: 'user_id',
          deleteRule: 'CASCADE',
          cleanupMode: 'cascade',
        },
      ]),
    ).toThrow(/does not match the cleanup contract/);
    expect(() => assertAccountDeletionSchemaInventory([...exact, exact[0]!])).toThrow(/duplicates/);
    expect(() =>
      assertAccountDeletionSchemaInventory([
        { ...exact[0]!, cleanupMode: 'predelete' },
        ...exact.slice(1),
      ]),
    ).toThrow(/does not match the cleanup contract/);
    expect(() =>
      assertAccountDeletionSchemaInventory([
        { ...exact[0]!, deleteRule: 'NO ACTION' },
        ...exact.slice(1),
      ]),
    ).toThrow(/does not match the cleanup contract/);
    expect(() =>
      assertAccountDeletionSchemaInventory([
        ...exact.slice(0, -1),
        { ...exact.at(-1)!, cleanupMode: 'unknown' as 'cascade' },
      ]),
    ).toThrow(/malformed/);
  });
});
