import { beforeEach, describe, expect, it, vi } from 'vitest';

function book(
  overrides: { id?: string; is_cached?: boolean; browser_device_fetch_executable?: boolean } = {},
) {
  return {
    id: 'catalog-1',
    title: 'Catalog Book',
    author_name: 'Author',
    language: 'en',
    format_type: 'epub',
    cover_image_key: null,
    cover_is_generated: false,
    is_cached: false,
    import_count: 0,
    page_count: null,
    file_size_bytes: null,
    ...overrides,
  };
}

async function importWithPlatform(options: { tauri: boolean; mobile: boolean }) {
  vi.resetModules();
  vi.doMock('@/services/environment', () => ({
    isTauriAppPlatform: () => options.tauri,
    isMobilePlatform: () => options.mobile,
  }));
  return import('@/services/catalogAddMode');
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

describe('catalogAddMode', () => {
  it('uses cached mode for cached catalog rows on every platform', async () => {
    const { getCatalogAddModeForPlatform } = await importWithPlatform({
      tauri: false,
      mobile: false,
    });

    expect(getCatalogAddModeForPlatform(book({ is_cached: true }))).toBe('cached');
  });

  it('hides non-cached rows on web unless the API explicitly marks browser execution safe', async () => {
    const { getCatalogAddModeForPlatform } = await importWithPlatform({
      tauri: false,
      mobile: false,
    });

    expect(getCatalogAddModeForPlatform(book())).toBeNull();
    expect(getCatalogAddModeForPlatform(book({ browser_device_fetch_executable: true }))).toBe(
      'user_device_fetch',
    );
  });

  it('enables user-device fetch on Tauri desktop for non-cached executable source rows', async () => {
    const { getCatalogAddModeForPlatform } = await importWithPlatform({
      tauri: true,
      mobile: false,
    });

    expect(getCatalogAddModeForPlatform(book())).toBe('user_device_fetch');
  });

  it('hides non-cached rows on native mobile until a browser/device executable opt-in exists', async () => {
    const { getCatalogAddModeForPlatform } = await importWithPlatform({
      tauri: true,
      mobile: true,
    });

    expect(getCatalogAddModeForPlatform(book())).toBeNull();
  });

  it('filters out rows that cannot execute Add on the current platform', async () => {
    const { filterExecutableCatalogBooks } = await importWithPlatform({
      tauri: false,
      mobile: false,
    });
    const cached = book({ id: 'cached', is_cached: true });
    const browserSafe = book({ id: 'browser-safe', browser_device_fetch_executable: true });
    const hidden = book({ id: 'hidden' });

    expect(
      filterExecutableCatalogBooks([cached, browserSafe, hidden]).map((row) => row.id),
    ).toEqual(['cached', 'browser-safe']);
  });
});
