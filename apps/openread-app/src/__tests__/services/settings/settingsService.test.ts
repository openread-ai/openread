import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  LOCAL_ONLY_SETTINGS_KEYS,
  SYNCABLE_SETTINGS_KEYS,
  getSettingDefinition,
  getSettingsKeysByScope,
} from '@openread/settings';
import {
  applySyncableSettings,
  extractSyncableSettings,
} from '@/services/settings/settingsSyncAdapter';
import type { SystemSettings } from '@/types/settings';

describe('canonical settings registry', () => {
  it('classifies roaming settings without device-local fields', () => {
    expect(getSettingsKeysByScope('syncable')).toEqual([...SYNCABLE_SETTINGS_KEYS]);
    expect(getSettingDefinition('globalReadSettings')?.scope).toBe('syncable');
    expect(getSettingDefinition('aiSettings')?.scope).toBe('syncable');
    expect(getSettingDefinition('themeMode')?.scope).toBe('local-only');
    expect(getSettingDefinition('kosync')?.scope).toBe('local-only');
    expect(getSettingDefinition('lastSyncedAtSettings')?.scope).toBe('local-only');
    expect(LOCAL_ONLY_SETTINGS_KEYS).toContain('customFonts');
    expect(LOCAL_ONLY_SETTINGS_KEYS).toContain('customTextures');
  });
});

describe('settings sync adapter', () => {
  it('extracts only syncable settings and preserves local-only values on apply', () => {
    const local = {
      keepLogin: false,
      autoUpload: false,
      telemetryEnabled: false,
      libraryViewMode: 'grid',
      librarySortBy: 'updatedAt',
      libraryGroupBy: 'none',
      librarySortAscending: false,
      libraryCoverFit: 'cover',
      libraryAutoColumns: true,
      libraryColumns: 5,
      localBooksDir: '/local/books',
      themeMode: 'dark',
      kosync: { enabled: false },
      lastSyncedAtSettings: 123,
      customFonts: [{ name: 'Local Font' }],
      globalReadSettings: { theme: 'light' },
      globalViewSettings: { scrolled: true },
      aiSettings: { provider: 'groq' },
    } as unknown as SystemSettings;

    const payload = extractSyncableSettings(local);
    expect(payload.keepLogin).toBe(false);
    expect(payload.globalReadSettings).toEqual({ theme: 'light' });
    expect(payload.localBooksDir).toBeUndefined();
    expect(payload.themeMode).toBeUndefined();
    expect(payload.kosync).toBeUndefined();
    expect(payload.customFonts).toBeUndefined();

    const merged = applySyncableSettings(local, {
      keepLogin: true,
      localBooksDir: '/remote/books',
      themeMode: 'light',
      customFonts: [],
      globalReadSettings: { theme: 'dark' },
    });

    expect(merged.keepLogin).toBe(true);
    expect(merged.globalReadSettings).toEqual({ theme: 'dark' });
    expect(merged.localBooksDir).toBe('/local/books');
    expect((merged as unknown as { themeMode: string }).themeMode).toBe('dark');
    expect(merged.customFonts).toEqual([{ name: 'Local Font' }]);
  });
});

describe('settings write guardrail', () => {
  it('keeps direct settings persistence writes behind the canonical service/adapters', () => {
    const srcRoot = path.resolve(process.cwd(), 'src');
    const allowedDirectPersistence = [
      path.join(srcRoot, 'services/settings'),
      path.join(srcRoot, 'services/appService.ts'),
      path.join(srcRoot, 'services/webAppService.ts'),
      path.join(srcRoot, 'services/nativeAppService.ts'),
    ];
    const patterns = [
      /(?:window\.)?localStorage\.(setItem|getItem)\(['"]theme(?:Mode|Color)['"]/,
      /appService\.saveSettings\(/,
      /globalViewSettings\s*\[[^\]]+\]\s*=(?!=)/,
      /globalReadSettings\s*\[[^\]]+\]\s*=(?!=)/,
      /globalViewSettings\.\w+\s*=(?!=)/,
      /globalReadSettings\.\w+\s*=(?!=)/,
      /\bsettings\s*\[[^\]]+\]\s*=(?!=)/,
      /\bsettings\.\w+\s*=(?!=)/,
    ];
    const failures: string[] = [];

    const visit = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const filePath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === '__tests__') continue;
          visit(filePath);
          continue;
        }
        if (!/\.(ts|tsx)$/.test(entry.name)) continue;
        if (
          allowedDirectPersistence.some(
            (allowedPath) =>
              filePath === allowedPath || filePath.startsWith(`${allowedPath}${path.sep}`),
          )
        )
          continue;
        const lines = fs.readFileSync(filePath, 'utf8').split('\n');
        lines.forEach((line, index) => {
          if (patterns.some((pattern) => pattern.test(line))) {
            failures.push(`${path.relative(srcRoot, filePath)}:${index + 1}: ${line.trim()}`);
          }
        });
      }
    };

    visit(srcRoot);
    expect(failures).toEqual([]);
  });
});
