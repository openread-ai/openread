import { describe, expect, it } from 'vitest';
import { deserializeConfig, serializeConfig } from '@/utils/serializer';

describe('book view setting override provenance', () => {
  const searchConfig = {} as never;

  it('keeps a book-scoped value explicitly chosen equal to global after the global changes', () => {
    const persisted = serializeConfig(
      {
        updatedAt: 1,
        viewSettings: { defaultFontSize: 16 },
        viewSettingsOverrideKeys: ['defaultFontSize'],
      } as never,
      { defaultFontSize: 16 } as never,
      searchConfig,
    );

    expect(JSON.parse(persisted).viewSettings).toEqual({ defaultFontSize: 16 });

    const restored = deserializeConfig(persisted, { defaultFontSize: 24 } as never, searchConfig);

    expect(restored.viewSettings?.defaultFontSize).toBe(16);
  });

  it('treats existing stored delta keys as overrides without inferring omitted intent', () => {
    const restored = deserializeConfig(
      JSON.stringify({
        updatedAt: 1,
        viewSettings: { defaultFontSize: 16 },
      }),
      { defaultFontSize: 24, lineHeight: 2 } as never,
      searchConfig,
    );

    expect(restored.viewSettings?.defaultFontSize).toBe(16);
    expect(restored.viewSettings?.lineHeight).toBe(2);
    expect(restored.viewSettingsOverrideKeys).toEqual(['defaultFontSize']);
  });

  it('keeps an inherited field following a later global change', () => {
    const persisted = serializeConfig(
      {
        updatedAt: 1,
        viewSettings: {},
        viewSettingsOverrideKeys: [],
      } as never,
      { defaultFontSize: 16 } as never,
      searchConfig,
    );

    const restored = deserializeConfig(persisted, { defaultFontSize: 24 } as never, searchConfig);

    expect(restored.viewSettings?.defaultFontSize).toBe(24);
  });
});
