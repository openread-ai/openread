import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useBackgroundTexture } from '@/hooks/useBackgroundTexture';
import {
  DEFAULT_ANNOTATOR_CONFIG,
  DEFAULT_BOOK_FONT,
  DEFAULT_BOOK_LANGUAGE,
  DEFAULT_BOOK_LAYOUT,
  DEFAULT_BOOK_STYLE,
  DEFAULT_SCREEN_CONFIG,
  DEFAULT_TRANSLATOR_CONFIG,
  DEFAULT_TTS_CONFIG,
  DEFAULT_VIEW_CONFIG,
} from '@/services/constants';
import type { EnvConfigType } from '@/services/environment';
import type { ViewSettings } from '@/types/book';

const mocks = vi.hoisted(() => ({
  addTexture: vi.fn(),
  applyTexture: vi.fn(),
}));

vi.mock('@/store/customTextureStore', () => ({
  useCustomTextureStore: {
    getState: () => ({
      addTexture: mocks.addTexture,
      applyTexture: mocks.applyTexture,
    }),
  },
}));

vi.mock('@/store/settingsStore', () => ({
  useSettingsStore: {
    getState: () => ({ settings: { customTextures: [] } }),
  },
}));

const viewSettings = (overrides: Partial<ViewSettings> = {}): ViewSettings => ({
  ...DEFAULT_BOOK_LAYOUT,
  ...DEFAULT_BOOK_STYLE,
  ...DEFAULT_BOOK_FONT,
  ...DEFAULT_BOOK_LANGUAGE,
  ...DEFAULT_VIEW_CONFIG,
  ...DEFAULT_TTS_CONFIG,
  ...DEFAULT_SCREEN_CONFIG,
  ...DEFAULT_ANNOTATOR_CONFIG,
  ...DEFAULT_TRANSLATOR_CONFIG,
  paragraphMode: { enabled: false },
  ...overrides,
});

describe('useBackgroundTexture', () => {
  it('unmounts the current texture when the active texture resets to none', () => {
    const envConfig = {} as EnvConfigType;
    const { result } = renderHook(() => useBackgroundTexture());

    result.current.applyBackgroundTexture(envConfig, viewSettings({ backgroundTextureId: 'none' }));

    expect(mocks.applyTexture).toHaveBeenCalledWith(envConfig, 'none');
    expect(mocks.addTexture).not.toHaveBeenCalled();
  });
});
