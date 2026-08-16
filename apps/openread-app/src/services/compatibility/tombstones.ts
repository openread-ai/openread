import type { Book, BookConfig, ViewSettings } from '@/types/book';
import type { SystemSettings } from '@/types/settings';

export const TOMBSTONE_COMPATIBILITY_DELETION_CRITERIA =
  'Delete this migration boundary after one release train where all persisted library, settings, and book-config JSON has been saved without legacy tombstone fields and the compatibility guard finds no production usages.';

export interface TombstoneMigrationResult<T> {
  value: T;
  changed: boolean;
  removedFields: string[];
}

type MutableRecord = Record<string, unknown>;

const DIRECTIONAL_MARGIN_FIELDS = [
  'marginTopPx',
  'marginBottomPx',
  'marginLeftPx',
  'marginRightPx',
] as const;

const DIRECTIONAL_COMPACT_MARGIN_FIELDS = [
  'compactMarginTopPx',
  'compactMarginBottomPx',
  'compactMarginLeftPx',
  'compactMarginRightPx',
] as const;

function isRecord(value: unknown): value is MutableRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function optionalTimestamp(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function optionalFiniteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

function deleteField(record: MutableRecord, field: string, removedFields: string[]): boolean {
  if (!(field in record)) return false;
  delete record[field];
  removedFields.push(field);
  return true;
}

function migrateSingleMarginField(
  record: MutableRecord,
  legacyField: 'marginPx' | 'compactMarginPx',
  directionalFields: readonly string[],
  removedFields: string[],
): boolean {
  const legacyValue = optionalFiniteNumber(record[legacyField]);
  let changed = false;

  if (legacyValue !== undefined) {
    for (const field of directionalFields) {
      if (record[field] !== legacyValue) {
        record[field] = legacyValue;
        changed = true;
      }
    }
  }

  return deleteField(record, legacyField, removedFields) || changed;
}

export function migrateBookTombstones(input: unknown): TombstoneMigrationResult<Book> {
  const record = isRecord(input) ? { ...input } : {};
  const removedFields: string[] = [];
  let changed = false;

  const legacyGroup = optionalString(record['group']);
  if (legacyGroup) {
    if (!optionalString(record['groupId'])) {
      record['groupId'] = legacyGroup;
      changed = true;
    }
    if (!optionalString(record['groupName'])) {
      record['groupName'] = legacyGroup;
      changed = true;
    }
  }
  changed = deleteField(record, 'group', removedFields) || changed;

  const legacyUpdatedAt = optionalTimestamp(record['lastUpdated']);
  if (record['updatedAt'] === undefined && legacyUpdatedAt !== undefined) {
    record['updatedAt'] = legacyUpdatedAt;
    changed = true;
  }
  changed = deleteField(record, 'lastUpdated', removedFields) || changed;

  return {
    value: record as unknown as Book,
    changed,
    removedFields: unique(removedFields),
  };
}

export function migrateViewSettingsTombstones<T extends Partial<ViewSettings>>(
  input: T | undefined | null,
): TombstoneMigrationResult<T> {
  const record = isRecord(input) ? { ...input } : {};
  const removedFields: string[] = [];
  let changed = false;

  changed = deleteField(record, 'translationProvider', removedFields) || changed;
  changed =
    migrateSingleMarginField(record, 'marginPx', DIRECTIONAL_MARGIN_FIELDS, removedFields) ||
    changed;
  changed =
    migrateSingleMarginField(
      record,
      'compactMarginPx',
      DIRECTIONAL_COMPACT_MARGIN_FIELDS,
      removedFields,
    ) || changed;

  return {
    value: record as T,
    changed,
    removedFields: unique(removedFields),
  };
}

export function migrateBookConfigTombstones<T extends BookConfig | Partial<BookConfig>>(
  input: T,
): TombstoneMigrationResult<T> {
  const viewResult = migrateViewSettingsTombstones(input.viewSettings);
  if (!viewResult.changed) return { value: input, changed: false, removedFields: [] };

  return {
    value: {
      ...input,
      viewSettings: viewResult.value,
    },
    changed: true,
    removedFields: viewResult.removedFields,
  } as TombstoneMigrationResult<T>;
}

export function migrateSystemSettingsTombstones(
  input: SystemSettings,
): TombstoneMigrationResult<SystemSettings> {
  const viewResult = migrateViewSettingsTombstones(input.globalViewSettings);
  const globalReadSettings = isRecord(input.globalReadSettings)
    ? { ...input.globalReadSettings }
    : {};
  const readSettingsRemovedFields: string[] = [];
  const readSettingsChanged = deleteField(
    globalReadSettings,
    'translationProvider',
    readSettingsRemovedFields,
  );
  if (!viewResult.changed && !readSettingsChanged) {
    return { value: input, changed: false, removedFields: [] };
  }

  return {
    value: {
      ...input,
      globalReadSettings: globalReadSettings as unknown as SystemSettings['globalReadSettings'],
      globalViewSettings: viewResult.value as ViewSettings,
    },
    changed: true,
    removedFields: unique([...viewResult.removedFields, ...readSettingsRemovedFields]),
  };
}
