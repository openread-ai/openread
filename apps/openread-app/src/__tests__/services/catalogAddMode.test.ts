import { describe, expect, it } from 'vitest';
import { getCatalogAddModeForPlatform } from '@/services/catalogAddMode';

function book(isCached = false) {
  return {
    id: 'catalog-1',
    title: 'Catalog Book',
    author_name: 'Author',
    language: 'en',
    format_type: 'epub',
    cover_image_key: null,
    cover_is_generated: false,
    is_cached: isCached,
    import_count: 0,
    page_count: null,
    file_size_bytes: null,
  };
}

describe('catalogAddMode', () => {
  it('uses cached mode for API-visible cached catalog rows', () => {
    expect(getCatalogAddModeForPlatform(book(true))).toBe('cached');
  });

  it('uses user_device_fetch for every API-visible uncached row on every platform', () => {
    expect(getCatalogAddModeForPlatform(book(false))).toBe('user_device_fetch');
  });
});
