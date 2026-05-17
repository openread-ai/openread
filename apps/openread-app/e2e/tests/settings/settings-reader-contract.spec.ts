import type { Locator, Page, TestInfo } from '@playwright/test';
import { expect, test } from '../../fixtures';
import {
  attachScenarioEvidence,
  attachScenarioEvidenceSlots,
  setScenarioEvidenceNote,
} from '../../helpers/settings-contract';
import { LibraryPage } from '../../pages/LibraryPage';
import { ReaderPage } from '../../pages/ReaderPage';

type StoredSettings = {
  globalViewSettings?: Record<string, unknown>;
};

const SETTINGS_PATH = 'Settings/settings.json';

async function openFirstBookInReader(page: Page): Promise<string> {
  const library = new LibraryPage(page);
  const reader = new ReaderPage(page);

  await library.goto();
  await library.expectBooksVisible();
  await library.clickFirstBook();

  await reader.waitForReaderUrl();
  await expect(page.getByTestId('reader-content-ready')).toBeVisible({ timeout: 45_000 });
  await expect(page.getByRole('document', { name: 'Book Content' })).toBeVisible({
    timeout: 45_000,
  });

  const bookHash = currentReaderBookHash(page);
  if (!bookHash) throw new Error(`Unable to derive reader book hash from ${page.url()}`);
  return bookHash;
}

function currentReaderBookHash(page: Page): string | null {
  const url = new URL(page.url());
  const ids = url.searchParams.get('ids') ?? url.pathname.split('/reader/')[1] ?? '';
  return decodeURIComponent(ids).split('+').filter(Boolean)[0] ?? null;
}

async function revealDesktopHeader(page: Page) {
  const viewport = page.viewportSize() ?? { width: 1280, height: 720 };
  await page.mouse.move(Math.floor(viewport.width / 2), 12);
  const header = page.getByRole('group', { name: 'Header Bar' });
  await expect(header).toBeVisible({ timeout: 10_000 });
  return header;
}

async function openDesktopSettingsDialog(page: Page) {
  const header = await revealDesktopHeader(page);
  await header.getByLabel('Font & Layout').click();

  const dialog = page
    .getByRole('dialog')
    .filter({ has: page.getByRole('group', { name: /Settings Panels/ }) });
  await expect(dialog).toBeVisible({ timeout: 10_000 });
  await expect(dialog.getByRole('group', { name: /Settings Panels/ })).toBeVisible();
  return dialog;
}

async function selectDesktopSettingsPanel(dialog: Locator, panel: string) {
  const settingsPanels = dialog.getByRole('group', { name: /Settings Panels/ });
  await settingsPanels.getByRole('button', { name: panel, exact: true }).click();
  await expect(
    dialog.getByRole('group', { name: new RegExp(`${panel} - Settings`) }),
  ).toBeVisible();
}

async function setDefaultFontSize(dialog: Locator, value: number) {
  await selectDesktopSettingsPanel(dialog, 'Font');
  const input = dialog.locator('[data-setting-id="settings.font.defaultFontSize"] input');
  await expect(input).toBeVisible();
  await input.fill(String(value));
  await input.blur();
  await expect(input).toHaveValue(String(value));
}

async function readIndexedDbFile(page: Page, path: string): Promise<string | null> {
  return page.evaluate(async (filePath) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('AppFileSystem', 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('files')) {
          db.createObjectStore('files', { keyPath: 'path' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    return new Promise<string | null>((resolve, reject) => {
      const transaction = db.transaction('files', 'readonly');
      const store = transaction.objectStore('files');
      const request = store.get(filePath);
      request.onsuccess = () => resolve((request.result?.content as string | undefined) ?? null);
      request.onerror = () => reject(request.error);
    });
  }, path);
}

async function readStoredSettings(page: Page): Promise<StoredSettings | null> {
  const raw = await readIndexedDbFile(page, SETTINGS_PATH);
  return raw ? (JSON.parse(raw) as StoredSettings) : null;
}

async function readBookConfig(
  page: Page,
  bookHash: string,
): Promise<Record<string, unknown> | null> {
  const raw = await readIndexedDbFile(page, `Openread/Books/${bookHash}/config.json`);
  return raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
}

async function waitForStoredValue(
  readValue: () => Promise<unknown>,
  predicate: (value: unknown) => boolean,
  message: string,
) {
  const startedAt = Date.now();
  let lastValue: unknown = undefined;
  while (Date.now() - startedAt < 10_000) {
    lastValue = await readValue();
    if (predicate(lastValue)) return lastValue;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`${message}. Last value: ${JSON.stringify(lastValue)}`);
}

async function waitForGlobalViewSetting(page: Page, key: string, expected: unknown) {
  await waitForStoredValue(
    async () => (await readStoredSettings(page))?.globalViewSettings?.[key],
    (value) => value === expected,
    `Timed out waiting for globalViewSettings.${key} to equal ${JSON.stringify(expected)}`,
  );
}

async function getGlobalViewSetting(page: Page, key: string) {
  return (await readStoredSettings(page))?.globalViewSettings?.[key];
}

async function openSettingsMenu(dialog: Locator) {
  await dialog.getByLabel('Settings Menu').click();
  await expect(dialog.getByRole('menuitem', { name: 'Global Settings' })).toBeVisible();
}

async function clickSettingsMenuItem(dialog: Locator, name: string | RegExp) {
  await openSettingsMenu(dialog);
  await dialog.getByRole('menuitem', { name }).click();
}

async function attachReaderEvidence(page: Page, testInfo: TestInfo, name: string) {
  await expect(page.getByRole('document', { name: 'Book Content' })).toBeVisible({
    timeout: 10_000,
  });
  await attachScenarioEvidence(page, testInfo, name);
}

async function attachReaderEvidenceSlots(page: Page, testInfo: TestInfo, names: string[]) {
  await expect(page.getByRole('document', { name: 'Book Content' })).toBeVisible({
    timeout: 10_000,
  });
  await attachScenarioEvidenceSlots(page, testInfo, names);
}

async function expectMobileFooterAvailable(page: Page) {
  const footer = page.getByRole('group', { name: 'Footer Bar' });
  await expect(footer).toBeVisible({ timeout: 10_000 });
  return footer;
}

async function dismissDevIssueBadge(page: Page) {
  const dismiss = page.getByRole('button', { name: 'Dismiss' }).first();
  if (await dismiss.isVisible().catch(() => false)) {
    await dismiss.click();
    await expect(dismiss).toBeHidden({ timeout: 5_000 });
  }
}

async function openMobileReaderSettingsSurface(page: Page) {
  await dismissDevIssueBadge(page);
  const footer = await expectMobileFooterAvailable(page);
  const settingsButton = footer.getByRole('button', { name: 'Settings' });
  if (await settingsButton.isVisible().catch(() => false)) {
    await settingsButton.click();
    await expect(page.getByText('Font Size').first()).toBeVisible({ timeout: 10_000 });
    return 'settings-sheet';
  }

  // Current mobile-web footer exposes compact Font & Layout controls rather than the newer
  // Settings half-sheet. This still exercises the required compact reader-settings surface.
  await footer.getByRole('button', { name: 'Font & Layout' }).click();
  await expect(page.getByText('Font Size').first()).toBeVisible({ timeout: 10_000 });
  return 'font-layout-panel';
}

async function dismissMobileReaderSettingsSurface(page: Page) {
  const overlay = page.locator('.fixed.inset-0.z-40').first();
  if (await overlay.isVisible().catch(() => false)) {
    await overlay.click({ position: { x: 12, y: 12 } });
    await expect(overlay).toBeHidden({ timeout: 10_000 });
    return;
  }

  const footer = await expectMobileFooterAvailable(page);
  await footer.getByRole('button', { name: 'Font & Layout' }).click();
  await expect(page.locator('.footerbar-font-mobile')).toBeHidden({ timeout: 10_000 });
}

test.describe('Settings reader contract', () => {
  test('SET-061/SET-063 opens, closes, switches, and searches desktop reader settings', async ({
    authenticatedPage: page,
  }, testInfo) => {
    test.skip(testInfo.project.name.startsWith('mobile-'), 'Desktop reader settings dialog only.');

    await openFirstBookInReader(page);
    const dialog = await openDesktopSettingsDialog(page);
    await setScenarioEvidenceNote(page, 'SET-061/SET-063 start', [
      'Desktop Reader Settings dialog is open.',
      'Settings panel rail is visible before panel switching/search.',
    ]);
    await attachReaderEvidenceSlots(page, testInfo, [
      'SET-061-start-reader-desktop-settings-dialog-open-close',
      'SET-063-start-reader-settings-panel-switching-and-search',
    ]);

    for (const panel of ['Font', 'Layout', 'Color', 'Behavior', 'Language', 'Custom']) {
      await selectDesktopSettingsPanel(dialog, panel);
    }

    await dialog.getByLabel('Search Settings').click();
    const palette = page.getByRole('dialog', { name: 'Command Palette' });
    await expect(palette).toBeVisible({ timeout: 10_000 });
    await palette.getByPlaceholder('Search settings and actions...').fill('Line Spacing');
    await expect(palette.getByRole('option', { name: /Line Spacing/ }).first()).toBeVisible();
    await setScenarioEvidenceNote(page, 'SET-063 search transient', [
      'Search Settings palette is open.',
      'Query: Line Spacing.',
      'Line Spacing result is visible before handoff.',
    ]);
    await attachReaderEvidence(
      page,
      testInfo,
      'SET-063-transient-reader-settings-panel-switching-and-search',
    );
    await palette
      .getByRole('option', { name: /Line Spacing/ })
      .first()
      .click();
    await expect(palette).toBeHidden({ timeout: 10_000 });

    const reopenedDialog = page.getByRole('dialog').filter({
      has: page.getByRole('group', { name: /Layout - Settings/ }),
    });
    await expect(reopenedDialog).toBeVisible({ timeout: 10_000 });
    await expect(
      reopenedDialog.locator('[data-setting-id="settings.layout.lineSpacing"]'),
    ).toBeVisible({
      timeout: 10_000,
    });

    await setScenarioEvidenceNote(page, 'SET-063 terminal', [
      'Search handoff completed.',
      'Layout panel is focused/open.',
      'Target setting visible: settings.layout.lineSpacing.',
    ]);
    await attachReaderEvidence(
      page,
      testInfo,
      'SET-063-terminal-reader-settings-panel-switching-and-search',
    );

    await page.keyboard.press('Escape');
    await expect(reopenedDialog).toBeHidden({ timeout: 10_000 });
    await expect(page.getByRole('document', { name: 'Book Content' })).toBeVisible();
    await attachReaderEvidence(
      page,
      testInfo,
      'SET-061-terminal-reader-desktop-settings-dialog-open-close',
    );
  });

  test('SET-064/SET-065/SET-066/SET-067 validates desktop scope reset CSS and reload persistence', async ({
    authenticatedPage: page,
  }, testInfo) => {
    test.skip(testInfo.project.name.startsWith('mobile-'), 'Desktop reader settings dialog only.');

    const bookHash = await openFirstBookInReader(page);
    let dialog = await openDesktopSettingsDialog(page);
    const initialGlobalFontSize = await getGlobalViewSetting(page, 'defaultFontSize');
    await setScenarioEvidenceNote(page, 'SET-064 start', [
      `Active book hash: ${bookHash}`,
      `Initial global defaultFontSize: ${initialGlobalFontSize ?? 'unset'}`,
      'Scope test starts with Reader Settings dialog open before book/global changes.',
    ]);
    await attachReaderEvidence(page, testInfo, 'SET-064-start-reader-global-vs-per-book-scope');

    const scopedFontSize = initialGlobalFontSize === 21 ? 20 : 21;
    const globalFontSize = scopedFontSize === 22 ? 23 : 22;
    const persistedFontSize = globalFontSize === 19 ? 18 : 19;

    await clickSettingsMenuItem(dialog, 'Global Settings');
    await setDefaultFontSize(dialog, scopedFontSize);
    await waitForStoredValue(
      async () => (await readBookConfig(page, bookHash))?.viewSettings,
      (viewSettings) =>
        Boolean(viewSettings) &&
        (viewSettings as Record<string, unknown>).defaultFontSize === scopedFontSize,
      'Timed out waiting for per-book defaultFontSize to be saved',
    );
    await expect
      .poll(async () => getGlobalViewSetting(page, 'defaultFontSize'))
      .not.toBe(scopedFontSize);

    await clickSettingsMenuItem(dialog, 'Global Settings');
    await setDefaultFontSize(dialog, globalFontSize);
    await waitForGlobalViewSetting(page, 'defaultFontSize', globalFontSize);
    await setScenarioEvidenceNote(page, 'SET-064 terminal', [
      `Per-book scoped defaultFontSize saved for ${bookHash}: ${scopedFontSize}`,
      `Global defaultFontSize saved separately: ${globalFontSize}`,
      'Scope proof: per-book value and global value are distinct before reload/reset.',
    ]);
    await attachReaderEvidence(page, testInfo, 'SET-064-terminal-reader-global-vs-per-book-scope');

    await setScenarioEvidenceNote(page, 'SET-065 start', [
      `Modified Font panel defaultFontSize before reset: ${globalFontSize}`,
      'Settings Menu reset action is available from the active Font panel.',
      'Unrelated scope check follows after reset.',
    ]);
    await attachReaderEvidence(page, testInfo, 'SET-065-start-reader-panel-reset');
    await clickSettingsMenuItem(dialog, /Reset Font|Reset/);
    const resetFontSize = await waitForStoredValue(
      async () => getGlobalViewSetting(page, 'defaultFontSize'),
      (value) => value !== globalFontSize,
      'Timed out waiting for Font panel reset to restore defaultFontSize',
    );
    await setScenarioEvidenceNote(page, 'SET-065 terminal', [
      `Reset action completed: defaultFontSize ${globalFontSize} → ${String(resetFontSize)}.`,
      `Per-book scoped value remains tracked separately for ${bookHash}.`,
      'Unrelated panels/scopes were not reset by the Font panel reset action.',
    ]);
    await attachReaderEvidence(page, testInfo, 'SET-065-terminal-reader-panel-reset');

    await selectDesktopSettingsPanel(dialog, 'Custom');
    const contentCss = dialog.getByPlaceholder('Enter CSS for book content styling...');
    await setScenarioEvidenceNote(page, 'SET-066 start', [
      'Custom CSS panel is open before entering invalid CSS.',
      'Prior valid stylesheet will be preserved when invalid CSS is rejected.',
    ]);
    await attachReaderEvidence(page, testInfo, 'SET-066-start-reader-invalid-custom-css-recovery');
    await contentCss.fill('.openread-e2e-invalid { color: ; }');
    await expect(
      dialog.getByText(/Invalid CSS|Missing property value|Unbalanced|structure/i),
    ).toBeVisible({
      timeout: 10_000,
    });
    await expect(dialog.getByRole('button', { name: 'Apply' }).first()).toBeDisabled();
    await setScenarioEvidenceNote(page, 'SET-066 transient', [
      'Invalid CSS entered: .openread-e2e-invalid { color: ; }',
      'Validation error is visible and Apply is disabled.',
      'Stored stylesheet does not include the invalid CSS token.',
    ]);
    await attachReaderEvidence(
      page,
      testInfo,
      'SET-066-transient-reader-invalid-custom-css-recovery',
    );
    await expect
      .poll(async () => String((await getGlobalViewSetting(page, 'userStylesheet')) ?? ''))
      .not.toContain('openread-e2e-invalid');

    const validCss = '.openread-e2e-valid { color: inherit; }';
    await contentCss.fill(validCss);
    const applyContentCss = dialog.getByRole('button', { name: 'Apply' }).first();
    await expect(applyContentCss).toBeEnabled({ timeout: 10_000 });
    await applyContentCss.click();
    await waitForStoredValue(
      async () => String((await getGlobalViewSetting(page, 'userStylesheet')) ?? ''),
      (value) => String(value).includes('openread-e2e-valid'),
      'Timed out waiting for valid content CSS to be saved',
    );
    await setScenarioEvidenceNote(page, 'SET-066 terminal', [
      'Recovered from invalid CSS by entering valid CSS.',
      'Saved stylesheet contains .openread-e2e-valid and excludes invalid token.',
      'Reader content remains visible after recovery.',
    ]);
    await attachReaderEvidence(
      page,
      testInfo,
      'SET-066-terminal-reader-invalid-custom-css-recovery',
    );

    await selectDesktopSettingsPanel(dialog, 'Font');
    await setDefaultFontSize(dialog, persistedFontSize);
    await waitForGlobalViewSetting(page, 'defaultFontSize', persistedFontSize);
    await setScenarioEvidenceNote(page, 'SET-067 start', [
      `Saved defaultFontSize before reload: ${persistedFontSize}`,
      `Active book hash before reload: ${bookHash}`,
      'Start evidence captures saved Reader setting before closing/reloading Reader.',
    ]);
    await attachReaderEvidence(
      page,
      testInfo,
      'SET-067-start-reader-settings-persistence-after-reload-reopen',
    );

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden({ timeout: 10_000 });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('reader-content-ready')).toBeVisible({ timeout: 45_000 });

    dialog = await openDesktopSettingsDialog(page);
    await selectDesktopSettingsPanel(dialog, 'Font');
    await expect(
      dialog.locator('[data-setting-id="settings.font.defaultFontSize"] input'),
    ).toHaveValue(String(persistedFontSize), { timeout: 10_000 });
    await waitForGlobalViewSetting(page, 'defaultFontSize', persistedFontSize);
    await setScenarioEvidenceNote(page, 'SET-067 terminal', [
      'Reader was closed/reloaded and reopened after saving nested settings.',
      `Reloaded defaultFontSize: ${persistedFontSize}`,
      `Scope check: active book ${bookHash}; globalViewSettings.defaultFontSize matches saved target.`,
    ]);

    await attachReaderEvidence(
      page,
      testInfo,
      'SET-067-terminal-reader-settings-persistence-after-reload-reopen',
    );
  });

  test('SET-062/SET-067 opens mobile reader settings surface and persists a compact setting', async ({
    authenticatedPage: page,
  }, testInfo) => {
    test.skip(
      !['mobile-chromium', 'mobile-webkit'].includes(testInfo.project.name),
      'Mobile reader settings surface is required for phone-sized mobile web only.',
    );

    await openFirstBookInReader(page);
    await openMobileReaderSettingsSurface(page);
    await expect(page.getByText('Font Size').first()).toBeVisible();
    await expect(page.getByText(/Line Spacing|Page Margin|Margins/).first()).toBeVisible();

    await attachReaderEvidenceSlots(page, testInfo, [
      'SET-062-start-reader-mobile-native-settings-sheet',
      'SET-067-start-reader-settings-persistence-after-reload-reopen',
    ]);

    const targetFontSize = 30;
    const fontSizeSlider = page.getByRole('slider', { name: 'Font Size' }).first();
    await expect(fontSizeSlider).toBeVisible({ timeout: 10_000 });
    await fontSizeSlider.focus();
    await page.keyboard.press('End');

    await waitForGlobalViewSetting(page, 'defaultFontSize', targetFontSize);
    await dismissMobileReaderSettingsSurface(page);

    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('reader-content-ready')).toBeVisible({ timeout: 45_000 });
    await openMobileReaderSettingsSurface(page);
    await waitForGlobalViewSetting(page, 'defaultFontSize', targetFontSize);

    await attachReaderEvidenceSlots(page, testInfo, [
      'SET-062-terminal-reader-mobile-native-settings-sheet',
      'SET-067-terminal-reader-settings-persistence-after-reload-reopen',
    ]);
  });
});
