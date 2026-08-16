import { describe, expect, it } from 'vitest';

import { testSyncableBookRef } from '../../utils/bookIdentityFixtures';
import {
  migrateBookConfigTombstones,
  migrateBookTombstones,
  migrateSystemSettingsTombstones,
  migrateViewSettingsTombstones,
} from '@/services/compatibility/tombstones';
import type { SystemSettings } from '@/types/settings';
import type { ViewSettings } from '@/types/book';

const canonicalViewSettings = {
  marginTopPx: 44,
  marginBottomPx: 44,
  marginLeftPx: 16,
  marginRightPx: 16,
  compactMarginTopPx: 16,
  compactMarginBottomPx: 16,
  compactMarginLeftPx: 16,
  compactMarginRightPx: 16,
} as Partial<ViewSettings>;

describe('tombstone compatibility migrations', () => {
  it('migrates legacy book group and timestamp fields once at the boundary', () => {
    const result = migrateBookTombstones({
      hash: 'sha256:book',
      title: 'Legacy Book',
      author: 'Author',
      group: 'Manual Shelf',
      lastUpdated: 1_700_000_000,
    });

    expect(result.changed).toBe(true);
    expect(result.value.groupId).toBe('Manual Shelf');
    expect(result.value.groupName).toBe('Manual Shelf');
    expect(result.value.updatedAt).toBe(1_700_000_000);
    expect(result.value).not.toHaveProperty('group');
    expect(result.value).not.toHaveProperty('lastUpdated');
  });

  it('does not overwrite existing canonical book fields while deleting tombstones', () => {
    const result = migrateBookTombstones({
      hash: 'sha256:book',
      title: 'Canonical Book',
      author: 'Author',
      group: 'Old Shelf',
      groupId: 'canonical-id',
      groupName: 'Canonical Shelf',
      updatedAt: 1_800_000_000,
      lastUpdated: 1_700_000_000,
    });

    expect(result.value.groupId).toBe('canonical-id');
    expect(result.value.groupName).toBe('Canonical Shelf');
    expect(result.value.updatedAt).toBe(1_800_000_000);
    expect(result.value).not.toHaveProperty('group');
    expect(result.value).not.toHaveProperty('lastUpdated');
  });

  it('migrates legacy layout margins into directional fields', () => {
    const result = migrateViewSettingsTombstones({
      ...canonicalViewSettings,
      marginPx: 72,
      compactMarginPx: 24,
    } as Partial<ViewSettings> & { marginPx: number; compactMarginPx: number });

    expect(result.changed).toBe(true);
    expect(result.value.marginTopPx).toBe(72);
    expect(result.value.marginBottomPx).toBe(72);
    expect(result.value.marginLeftPx).toBe(72);
    expect(result.value.marginRightPx).toBe(72);
    expect(result.value.compactMarginTopPx).toBe(24);
    expect(result.value.compactMarginBottomPx).toBe(24);
    expect(result.value.compactMarginLeftPx).toBe(24);
    expect(result.value.compactMarginRightPx).toBe(24);
    expect(result.value).not.toHaveProperty('marginPx');
    expect(result.value).not.toHaveProperty('compactMarginPx');
  });

  it('removes retired translation provider persistence without selecting a fallback', () => {
    const viewResult = migrateViewSettingsTombstones({
      ...canonicalViewSettings,
      translationProvider: 'deepl',
    } as Partial<ViewSettings> & { translationProvider: string });
    const settingsResult = migrateSystemSettingsTombstones({
      globalViewSettings: {
        ...canonicalViewSettings,
        translationProvider: 'deepl',
      },
      globalReadSettings: {
        translationProvider: 'deepl',
      },
    } as unknown as SystemSettings);

    expect(viewResult.changed).toBe(true);
    expect(viewResult.value).not.toHaveProperty('translationProvider');
    expect(settingsResult.changed).toBe(true);
    expect(settingsResult.value.globalViewSettings).not.toHaveProperty('translationProvider');
    expect(settingsResult.value.globalReadSettings).not.toHaveProperty('translationProvider');
  });

  it('migrates nested book config view settings', () => {
    const result = migrateBookConfigTombstones({
      bookHash: testSyncableBookRef('book-config-tombstone'),
      updatedAt: 1,
      viewSettings: {
        marginPx: 80,
        compactMarginPx: 20,
      } as Partial<ViewSettings> & { marginPx: number; compactMarginPx: number },
    });

    expect(result.value.viewSettings?.marginTopPx).toBe(80);
    expect(result.value.viewSettings?.compactMarginTopPx).toBe(20);
    expect(result.value.viewSettings).not.toHaveProperty('marginPx');
    expect(result.value.viewSettings).not.toHaveProperty('compactMarginPx');
  });

  it('migrates system global view settings', () => {
    const result = migrateSystemSettingsTombstones({
      globalViewSettings: {
        ...canonicalViewSettings,
        marginPx: 64,
        compactMarginPx: 18,
      },
    } as SystemSettings & {
      globalViewSettings: Partial<ViewSettings> & { marginPx: number; compactMarginPx: number };
    });

    expect(result.value.globalViewSettings.marginTopPx).toBe(64);
    expect(result.value.globalViewSettings.compactMarginTopPx).toBe(18);
    expect(result.value.globalViewSettings).not.toHaveProperty('marginPx');
    expect(result.value.globalViewSettings).not.toHaveProperty('compactMarginPx');
  });
});
