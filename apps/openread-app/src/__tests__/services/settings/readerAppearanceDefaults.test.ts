import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ViewSettings } from '@/types/book';
import {
  READER_COLOR_APPEARANCE_DEFAULT_KEYS,
  READER_FONT_APPEARANCE_DEFAULT_KEYS,
  READER_LAYOUT_APPEARANCE_DEFAULT_KEYS,
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
    writingMode: 'vertical-rl',
    vertical: true,
    progressStyle: 'percentage',
    screenOrientation: 'landscape',
    overrideColor: true,
    invertImgColorInDark: true,
    backgroundTextureId: 'paper',
    readingRulerEnabled: true,
    readingRulerColor: 'yellow',
    ttsHighlightOptions: { style: 'underline', color: '#ff0000' },
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
      writingMode: 'auto',
      vertical: false,
      progressStyle: 'fraction',
      screenOrientation: 'auto',
      overrideColor: false,
      invertImgColorInDark: false,
      backgroundTextureId: 'none',
      readingRulerEnabled: false,
      readingRulerColor: 'transparent',
      ttsHighlightOptions: { style: 'highlight', color: '#808080' },
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
        writingMode: 'auto',
        vertical: false,
        progressStyle: 'fraction',
        screenOrientation: 'auto',
        overrideColor: false,
        invertImgColorInDark: false,
        backgroundTextureId: 'none',
        readingRulerEnabled: false,
        readingRulerColor: 'transparent',
        ttsHighlightOptions: { style: 'highlight', color: '#808080' },
      }),
    );
    expect(restored.uiLanguage).toBe('fr');
    expect(restored.translationEnabled).toBe(true);
    expect(restored.userStylesheet).toBe('body { color: red; }');
    expect(restored.disableClick).toBe(true);
    expect(restored.proofreadRules).toEqual([{ id: 'rule-1' }]);
  });

  it('keeps the canonical category registry in sync with settings panel save keys', () => {
    const extractPanelSaveKeys = (fileName: string) => {
      const source = fs.readFileSync(
        path.join(process.cwd(), 'src/components/settings', fileName),
        'utf8',
      );
      return new Set(
        Array.from(
          source.matchAll(/saveViewSettings\(\s*envConfig\s*,\s*bookKey\s*,\s*['"]([^'"]+)['"]/g),
          (match) => match[1],
        ),
      );
    };
    const expectPanelKeysCovered = (
      panelFile: string,
      registry: readonly (keyof ViewSettings)[],
    ) => {
      const panelKeys = extractPanelSaveKeys(panelFile);
      const registryKeys = new Set(registry as readonly string[]);
      const missing = Array.from(panelKeys).filter((key) => !registryKeys.has(key));
      expect(missing).toEqual([]);
    };

    expectPanelKeysCovered('FontPanel.tsx', READER_FONT_APPEARANCE_DEFAULT_KEYS);
    expectPanelKeysCovered('LayoutPanel.tsx', READER_LAYOUT_APPEARANCE_DEFAULT_KEYS);
    expectPanelKeysCovered('ColorPanel.tsx', READER_COLOR_APPEARANCE_DEFAULT_KEYS);
    expect(READER_LAYOUT_APPEARANCE_DEFAULT_KEYS).toContain('vertical');
  });
});
