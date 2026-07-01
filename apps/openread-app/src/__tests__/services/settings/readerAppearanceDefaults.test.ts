import { describe, expect, it } from 'vitest';
import type { ViewSettings } from '@/types/book';
import {
  applyInheritedReaderAppearanceDefaults,
  restoreReaderAppearanceDefaults,
} from '@/services/settings/readerAppearanceDefaults';

const viewSettings = (overrides: Partial<ViewSettings> = {}) =>
  ({
    defaultFont: 'Serif',
    defaultFontSize: 20,
    overrideFont: true,
    serifFont: 'Custom Serif',
    lineHeight: 2,
    marginTopPx: 80,
    pageZoomLevel: 175,
    overrideColor: true,
    invertImgColorInDark: true,
    backgroundTextureId: 'paper',
    readingRulerEnabled: true,
    uiLanguage: 'fr',
    translationEnabled: true,
    userStylesheet: 'body { color: red; }',
    disableClick: true,
    proofreadRules: [{ id: 'rule-1' }],
    ...overrides,
  }) as ViewSettings;

describe('reader appearance defaults', () => {
  it('restores only font, layout, and color ViewSettings defaults globally', () => {
    const current = viewSettings();
    const defaults = viewSettings({
      defaultFont: 'Sans-serif',
      defaultFontSize: 16,
      overrideFont: false,
      serifFont: 'Bitter',
      lineHeight: 1.6,
      marginTopPx: 44,
      pageZoomLevel: 100,
      overrideColor: false,
      invertImgColorInDark: false,
      backgroundTextureId: 'none',
      readingRulerEnabled: false,
      uiLanguage: 'en',
      translationEnabled: false,
      userStylesheet: '',
      disableClick: false,
      proofreadRules: [],
    });

    const restored = restoreReaderAppearanceDefaults(current, defaults);

    expect(restored).toEqual(
      expect.objectContaining({
        defaultFont: 'Sans-serif',
        defaultFontSize: 16,
        overrideFont: false,
        serifFont: 'Bitter',
        lineHeight: 1.6,
        marginTopPx: 44,
        pageZoomLevel: 100,
        overrideColor: false,
        invertImgColorInDark: false,
        backgroundTextureId: 'none',
        readingRulerEnabled: false,
      }),
    );
    expect(restored.uiLanguage).toBe('fr');
    expect(restored.translationEnabled).toBe(true);
    expect(restored.userStylesheet).toBe('body { color: red; }');
    expect(restored.disableClick).toBe(true);
    expect(restored.proofreadRules).toEqual([{ id: 'rule-1' }]);
  });

  it('applies restored global defaults to full effective configs while preserving true overrides', () => {
    const previousGlobalDefaults = viewSettings({
      defaultFontSize: 22,
      lineHeight: 2,
      overrideColor: true,
      uiLanguage: 'en',
      userStylesheet: '',
    });
    const fullEffectiveViewSettings = viewSettings({
      defaultFontSize: 22,
      lineHeight: 2.2,
      overrideColor: true,
      uiLanguage: 'de',
      userStylesheet: '.reader {}',
    });
    const globalDefaults = viewSettings({
      defaultFontSize: 16,
      lineHeight: 1.6,
      overrideColor: false,
      uiLanguage: 'en',
      userStylesheet: '',
    });

    const next = applyInheritedReaderAppearanceDefaults({
      current: fullEffectiveViewSettings,
      previousGlobalDefaults,
      globalDefaults,
    });

    expect(next.defaultFontSize).toBe(16);
    expect(next.overrideColor).toBe(false);
    expect(next.lineHeight).toBe(2.2);
    expect(next.uiLanguage).toBe('de');
    expect(next.userStylesheet).toBe('.reader {}');
  });
});
