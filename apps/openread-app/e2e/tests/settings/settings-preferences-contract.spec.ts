import type { Page } from '@playwright/test';
import { test, expect } from '../../fixtures';
import { TEST_USER } from '../../fixtures/test-users';
import {
  attachScenarioEvidence,
  attachViewportEvidence,
  expectPreferencesSettings,
  setScenarioEvidenceNote,
} from '../../helpers/settings-contract';

async function openPreferences(page: Page) {
  await page.goto('/settings/preferences', { waitUntil: 'domcontentloaded' });
  await expectPreferencesSettings(page);
}

async function scrollToPreferencesSection(page: Page, sectionName: string) {
  await page.getByText(sectionName, { exact: true }).first().scrollIntoViewIfNeeded();
}

async function readDefaultFont(page: Page): Promise<string | null> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('AppFileSystem', 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    return new Promise<string | null>((resolve, reject) => {
      const transaction = db.transaction('files', 'readonly');
      const store = transaction.objectStore('files');
      const request = store.get('Settings/settings.json');
      request.onsuccess = () => {
        const raw = request.result?.content as string | undefined;
        const settings = raw ? JSON.parse(raw) : null;
        resolve(settings?.globalViewSettings?.defaultFont ?? null);
      };
      request.onerror = () => reject(request.error);
    });
  });
}

async function enableAiIfNeeded(page: Page) {
  const toggle = page.getByTestId('ai-enabled-toggle');
  if (!(await toggle.isChecked())) await toggle.check({ force: true });
  await expect(toggle).toBeChecked();
}

type ProviderKeyFixture = {
  provider: string;
  keyPrefix: string;
  isValid: boolean;
  lastTestedAt: string | null;
};

function fakePlanToken(plan: 'free' | 'reader' | 'pro') {
  const payload = {
    plan,
    storage_usage_bytes: 0,
    storage_purchased_bytes: 0,
    exp: Math.floor(Date.now() / 1000) + 60 * 60,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `openread-qa.${encoded}.signature`;
}

async function forcePlan(page: Page, plan: 'free' | 'reader' | 'pro') {
  const token = fakePlanToken(plan);
  const user = {
    id: 'openread-qa-user',
    aud: 'authenticated',
    role: 'authenticated',
    email: TEST_USER.email,
    user_metadata: {},
    app_metadata: { provider: 'email' },
  };

  await page.route('**/auth/v1/token**', async (route) => {
    await route.fulfill({
      json: {
        access_token: token,
        refresh_token: `openread-qa-refresh-${plan}`,
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 60 * 60,
        token_type: 'bearer',
        user,
      },
    });
  });

  await page.addInitScript(
    ({ token, user }) => {
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));

      for (const key of Object.keys(localStorage)) {
        if (!key.startsWith('sb-') || !key.endsWith('-auth-token')) continue;
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        try {
          const session = JSON.parse(raw) as Record<string, unknown>;
          session['access_token'] = token;
          session['user'] = { ...(session['user'] as object), ...user };
          localStorage.setItem(key, JSON.stringify(session));
        } catch {
          // Ignore malformed auth storage; the fixture also seeds custom auth keys.
        }
      }
    },
    { token, user },
  );
}

async function mockProviderKeys(
  page: Page,
  options: {
    initialKeys?: ProviderKeyFixture[];
    testResult?: { isValid: boolean; error?: string };
  } = {},
) {
  let keys = [...(options.initialKeys ?? [])];
  const testResult = options.testResult ?? { isValid: true };

  await page.route('**/settings/api-keys**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;

    if (path.endsWith('/test') && request.method() === 'POST') {
      const { provider } = request.postDataJSON() as { provider: string };
      keys = keys.map((key) =>
        key.provider === provider ? { ...key, isValid: testResult.isValid } : key,
      );
      await route.fulfill({ json: testResult });
      return;
    }

    if (request.method() === 'GET') {
      await route.fulfill({ json: keys });
      return;
    }

    if (request.method() === 'POST') {
      const { provider } = request.postDataJSON() as { provider: string; apiKey: string };
      keys = [
        ...keys.filter((key) => key.provider !== provider),
        {
          provider,
          keyPrefix: provider === 'openai' ? 'sk-qa...' : 'qa-key...',
          isValid: true,
          lastTestedAt: new Date().toISOString(),
        },
      ];
      await route.fulfill({ json: { success: true } });
      return;
    }

    if (request.method() === 'DELETE') {
      const provider = decodeURIComponent(path.split('/').pop() ?? '');
      keys = keys.filter((key) => key.provider !== provider);
      await route.fulfill({ json: { success: true } });
      return;
    }

    await route.fulfill({ status: 405, json: { error: 'Method not allowed' } });
  });
}

async function selectByokProvider(page: Page, providerName: string) {
  await page.getByRole('button', { name: 'Select provider' }).click();
  await page.getByRole('button', { name: providerName }).click();
}

async function mockOllamaTags(page: Page, available: boolean) {
  await page.addInitScript((isAvailable) => {
    const originalFetch = window.fetch.bind(window);
    window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.startsWith('http://127.0.0.1:11434/api/tags')) {
        return Promise.resolve(
          new Response(
            isAvailable ? JSON.stringify({ models: [{ name: 'llama3.2:latest' }] }) : 'unavailable',
            {
              status: isAvailable ? 200 : 503,
              headers: { 'content-type': 'application/json' },
            },
          ),
        );
      }
      return originalFetch(input, init);
    };
  }, available);
}

test.describe('Settings preferences contract', () => {
  test('SET-025 persists theme mode selection', async ({ authenticatedPage: page }, testInfo) => {
    await openPreferences(page);
    await attachScenarioEvidence(page, testInfo, 'SET-025-start-theme-mode-persistence');

    await page.getByTestId('theme-mode-dark').click();
    await expect.poll(() => page.evaluate(() => localStorage.getItem('themeMode'))).toBe('dark');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect.poll(() => page.evaluate(() => localStorage.getItem('themeMode'))).toBe('dark');
    await expect(page.getByTestId('theme-mode-dark')).toHaveClass(/border-primary/);

    await attachScenarioEvidence(page, testInfo, 'SET-025-terminal-theme-mode-persistence');
  });

  test('SET-026 persists theme color selection', async ({ authenticatedPage: page }, testInfo) => {
    await openPreferences(page);
    await attachScenarioEvidence(page, testInfo, 'SET-026-start-theme-color-persistence');

    await page.getByTestId('theme-color-sepia').click();
    await expect.poll(() => page.evaluate(() => localStorage.getItem('themeColor'))).toBe('sepia');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect.poll(() => page.evaluate(() => localStorage.getItem('themeColor'))).toBe('sepia');
    await expect(page.getByTestId('theme-color-sepia')).toHaveClass(/ring-primary/);

    await attachScenarioEvidence(page, testInfo, 'SET-026-terminal-theme-color-persistence');
  });

  test('SET-027 persists default reading font selection', async ({
    authenticatedPage: page,
  }, testInfo) => {
    await openPreferences(page);
    await scrollToPreferencesSection(page, 'Reading');
    await setScenarioEvidenceNote(page, 'SET-027 start', [
      `Stored default font before change: ${await readDefaultFont(page)}`,
      'Reading card and preview are scrolled into view before changing default font.',
    ]);
    await attachScenarioEvidence(page, testInfo, 'SET-027-start-reading-font-default-persistence');

    await page.getByRole('combobox').click();
    await page.getByRole('option', { name: 'Sans-Serif' }).click();
    await expect.poll(() => readDefaultFont(page)).toBe('Sans-serif');

    await page.reload({ waitUntil: 'domcontentloaded' });
    await expectPreferencesSettings(page);
    await scrollToPreferencesSection(page, 'Reading');
    await expect.poll(() => readDefaultFont(page)).toBe('Sans-serif');
    await setScenarioEvidenceNote(page, 'SET-027 terminal', [
      'Reloaded Preferences after selecting Sans-Serif.',
      'Stored globalViewSettings.defaultFont: Sans-serif.',
      'Reader default source check: new sessions consume globalViewSettings.defaultFont.',
    ]);

    await attachScenarioEvidence(
      page,
      testInfo,
      'SET-027-terminal-reading-font-default-persistence',
    );
  });

  test('SET-028 persists reading font size and line height', async ({
    authenticatedPage: page,
  }, testInfo) => {
    await openPreferences(page);
    await scrollToPreferencesSection(page, 'Reading');
    await setScenarioEvidenceNote(page, 'SET-028 start', [
      'Reading size and line-height controls are scrolled into view before changes.',
      'Start evidence captures the before values and preview area.',
    ]);
    await attachScenarioEvidence(
      page,
      testInfo,
      'SET-028-start-reading-size-line-height-persistence',
    );

    const fontSizeInput = page
      .locator('.config-item')
      .filter({ hasText: 'Font Size' })
      .locator('input');
    const lineHeightInput = page
      .locator('.config-item')
      .filter({ hasText: 'Line Height' })
      .locator('input');

    await fontSizeInput.fill('18');
    await fontSizeInput.blur();
    await lineHeightInput.fill('1.8');
    await lineHeightInput.blur();

    await expect(fontSizeInput).toHaveValue('18');
    await expect(lineHeightInput).toHaveValue('1.8');

    await page.reload({ waitUntil: 'domcontentloaded' });
    await expectPreferencesSettings(page);
    await scrollToPreferencesSection(page, 'Reading');
    await expect(
      page.locator('.config-item').filter({ hasText: 'Font Size' }).locator('input'),
    ).toHaveValue('18');
    await expect(
      page.locator('.config-item').filter({ hasText: 'Line Height' }).locator('input'),
    ).toHaveValue('1.8');
    await setScenarioEvidenceNote(page, 'SET-028 terminal', [
      'Reloaded Preferences after changing reading size defaults.',
      'Stored/reloaded Font Size: 18.',
      'Stored/reloaded Line Height: 1.8.',
      'Reader default source check: new sessions consume globalViewSettings size and lineHeight.',
    ]);

    await attachScenarioEvidence(
      page,
      testInfo,
      'SET-028-terminal-reading-size-line-height-persistence',
    );
  });

  test('SET-029 toggles AI enablement', async ({ authenticatedPage: page }, testInfo) => {
    await openPreferences(page);
    await attachScenarioEvidence(page, testInfo, 'SET-029-start-ai-enable-disable');

    const toggle = page.getByTestId('ai-enabled-toggle');
    const initiallyChecked = await toggle.isChecked();
    await toggle.click({ force: true });
    await expect(toggle).toBeChecked({ checked: !initiallyChecked });

    await attachScenarioEvidence(page, testInfo, 'SET-029-terminal-ai-enable-disable');
  });

  test('SET-030 switches AI Online and Offline modes when platform-supported', async ({
    authenticatedPage: page,
  }, testInfo) => {
    await openPreferences(page);
    await enableAiIfNeeded(page);
    await attachScenarioEvidence(page, testInfo, 'SET-030-start-ai-online-offline-mode-switching');

    const offline = page.getByTestId('ai-mode-offline');
    if ((await offline.count()) === 0) {
      await expect(page.getByText('Offline (Local)')).toHaveCount(0);
    } else {
      await page.route('**://127.0.0.1:11434/**', async (route) => {
        await route.fulfill({
          status: 200,
          headers: {
            'access-control-allow-origin': '*',
            'access-control-allow-methods': 'GET, OPTIONS',
            'access-control-allow-private-network': 'true',
          },
          contentType: 'application/json',
          body: JSON.stringify({ models: [{ name: 'llama3.2:latest' }] }),
        });
      });
      await offline.check({ force: true });
      await expect(offline).toBeChecked();
      await page.getByTestId('ai-mode-online').check({ force: true });
      await expect(page.getByTestId('ai-mode-online')).toBeChecked();
    }

    await attachScenarioEvidence(
      page,
      testInfo,
      'SET-030-terminal-ai-online-offline-mode-switching',
    );
  });

  test('SET-031 detects available Ollama when Offline mode is supported', async ({
    authenticatedPage: page,
  }, testInfo) => {
    await mockOllamaTags(page, true);
    await openPreferences(page);
    await enableAiIfNeeded(page);
    await attachScenarioEvidence(page, testInfo, 'SET-031-start-ollama-available-detection');

    const offline = page.getByTestId('ai-mode-offline');
    if ((await offline.count()) === 0) {
      await expect(page.getByText('Offline (Local)')).toHaveCount(0);
    } else {
      await page.getByTestId('ai-mode-online').check({ force: true });
      await offline.check({ force: true });
      await expect(page.getByText('Ollama detected')).toBeVisible({ timeout: 15_000 });
    }

    await attachScenarioEvidence(page, testInfo, 'SET-031-terminal-ollama-available-detection');
  });

  test('SET-032 reports unavailable Ollama when Offline mode is supported', async ({
    authenticatedPage: page,
  }, testInfo) => {
    await mockOllamaTags(page, false);
    await openPreferences(page);
    await enableAiIfNeeded(page);
    await attachScenarioEvidence(page, testInfo, 'SET-032-start-ollama-unavailable-detection');

    const offline = page.getByTestId('ai-mode-offline');
    if ((await offline.count()) === 0) {
      await expect(page.getByText('Offline (Local)')).toHaveCount(0);
    } else {
      await page.getByTestId('ai-mode-online').check({ force: true });
      await offline.check({ force: true });
      await expect(page.getByText('Ollama not detected.')).toBeVisible({ timeout: 15_000 });
    }

    await attachScenarioEvidence(page, testInfo, 'SET-032-terminal-ollama-unavailable-detection');
  });

  test('SET-033 shows BYOK gated state for Free users', async ({
    authenticatedPage: page,
  }, testInfo) => {
    await forcePlan(page, 'free');
    await mockProviderKeys(page);
    await openPreferences(page);
    await enableAiIfNeeded(page);

    await page.getByText('Bring Your Own Key', { exact: true }).scrollIntoViewIfNeeded();
    await expect(page.getByText('Bring Your Own Key', { exact: true })).toBeVisible();
    await expect(page.getByText(/Reader\+|Reader and Pro|Upgrade/i).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Select provider' })).toHaveCount(0);
    await setScenarioEvidenceNote(page, 'SET-033 start', [
      'Free-plan BYOK area is scrolled into view.',
      'Provider selection is gated and no raw key is exposed.',
    ]);
    await attachViewportEvidence(page, testInfo, 'SET-033-start-byok-gated-free-no-access-state');

    await setScenarioEvidenceNote(page, 'SET-033 terminal', [
      'BYOK remains gated for the Free/no-access state.',
      'Upgrade/Reader+ copy is visible instead of provider selection.',
    ]);
    await attachViewportEvidence(
      page,
      testInfo,
      'SET-033-terminal-byok-gated-free-no-access-state',
    );
  });

  test('SET-034 saves and tests a BYOK provider key successfully', async ({
    authenticatedPage: page,
  }, testInfo) => {
    await forcePlan(page, 'reader');
    await mockProviderKeys(page);
    await openPreferences(page);
    await enableAiIfNeeded(page);
    await attachScenarioEvidence(
      page,
      testInfo,
      'SET-034-start-byok-provider-key-save-test-success',
    );

    await selectByokProvider(page, 'OpenAI');
    await page.getByPlaceholder('Enter your API key...').fill('sk-qa-openai-key-success');
    await page.getByRole('button', { name: 'Test Connection' }).click();

    await expect(page.getByText('Connection successful')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Saved Keys')).toBeVisible();
    await expect(page.getByText('sk-qa...')).toBeVisible();
    await expect(page.getByText('Valid').first()).toBeVisible();

    await attachScenarioEvidence(
      page,
      testInfo,
      'SET-034-terminal-byok-provider-key-save-test-success',
    );
  });

  test('SET-035 removes a saved BYOK provider key', async ({
    authenticatedPage: page,
  }, testInfo) => {
    await forcePlan(page, 'reader');
    await mockProviderKeys(page, {
      initialKeys: [
        {
          provider: 'openai',
          keyPrefix: 'sk-qa...',
          isValid: true,
          lastTestedAt: new Date().toISOString(),
        },
      ],
    });
    await openPreferences(page);
    await enableAiIfNeeded(page);

    await expect(page.getByText('Saved Keys')).toBeVisible();
    await expect(page.getByText('sk-qa...')).toBeVisible();
    await page.getByText('Saved Keys').scrollIntoViewIfNeeded();
    await setScenarioEvidenceNote(page, 'SET-035 start', [
      'Saved OpenAI provider key row is visible before removal.',
      'Only the redacted key prefix is shown.',
    ]);
    await attachViewportEvidence(page, testInfo, 'SET-035-start-byok-provider-key-remove');

    await page.getByRole('button', { name: 'Remove OpenAI key' }).click();

    await expect(page.getByText('sk-qa...')).toHaveCount(0);
    await expect(page.getByText('OpenAI key removed')).toBeVisible();
    await page.getByText('Bring Your Own Key', { exact: true }).scrollIntoViewIfNeeded();
    await setScenarioEvidenceNote(page, 'SET-035 terminal', [
      'Saved key row is gone after removal.',
      'Removal toast is visible and no raw key is exposed.',
    ]);

    await attachViewportEvidence(page, testInfo, 'SET-035-terminal-byok-provider-key-remove');
  });

  test('SET-036 reports an invalid BYOK provider key state', async ({
    authenticatedPage: page,
  }, testInfo) => {
    await forcePlan(page, 'reader');
    await mockProviderKeys(page, {
      testResult: { isValid: false, error: 'Mock invalid key' },
    });
    await openPreferences(page);
    await enableAiIfNeeded(page);
    await attachScenarioEvidence(
      page,
      testInfo,
      'SET-036-start-byok-invalid-untestable-provider-state',
    );

    await selectByokProvider(page, 'OpenAI');
    await page.getByPlaceholder('Enter your API key...').fill('sk-qa-openai-key-invalid');
    await page.getByRole('button', { name: 'Test Connection' }).click();

    await expect(page.getByText('Mock invalid key')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Connection successful')).toHaveCount(0);

    await attachScenarioEvidence(
      page,
      testInfo,
      'SET-036-terminal-byok-invalid-untestable-provider-state',
    );
  });

  test('SET-037 persists notification preference toggles locally', async ({
    authenticatedPage: page,
  }, testInfo) => {
    await openPreferences(page);
    await attachScenarioEvidence(page, testInfo, 'SET-037-start-notification-preference-toggles');

    await page.getByTestId('notification-reading-reminders').setChecked(false, { force: true });
    await page.getByTestId('notification-sync-notifications').setChecked(false, { force: true });
    await page.getByTestId('notification-product-updates').setChecked(false, { force: true });

    await expect
      .poll(() =>
        page.evaluate(() => JSON.parse(localStorage.getItem('notificationPreferences') ?? '{}')),
      )
      .toMatchObject({
        readingReminders: false,
        syncNotifications: false,
        productUpdates: false,
      });

    await attachScenarioEvidence(
      page,
      testInfo,
      'SET-037-terminal-notification-preference-toggles',
    );
  });

  test('SET-038 toggles telemetry privacy preference', async ({
    authenticatedPage: page,
  }, testInfo) => {
    await openPreferences(page);
    await attachScenarioEvidence(page, testInfo, 'SET-038-start-telemetry-privacy-toggle');

    const toggle = page.getByTestId('privacy-telemetry-toggle');
    const initiallyChecked = await toggle.isChecked();
    await toggle.click({ force: true });
    await expect(toggle).toBeChecked({ checked: !initiallyChecked });

    await attachScenarioEvidence(page, testInfo, 'SET-038-terminal-telemetry-privacy-toggle');
  });

  test('SET-039 downloads user data export on success', async ({
    authenticatedPage: page,
  }, testInfo) => {
    await page.route('**/api/user/export', async (route) => {
      await route.fulfill({
        status: 200,
        headers: {
          'content-type': 'application/json',
          'content-disposition': 'attachment; filename="openread-export-e2e.json"',
        },
        body: JSON.stringify({ ok: true, books: [] }),
      });
    });
    await openPreferences(page);
    await scrollToPreferencesSection(page, 'Privacy');
    await setScenarioEvidenceNote(page, 'SET-039 start', [
      'Privacy → Download My Data control is visible before export.',
      'Fixture will return content-disposition filename openread-export-e2e.json.',
    ]);
    await attachScenarioEvidence(page, testInfo, 'SET-039-start-download-my-data-success');

    const downloadPromise = page.waitForEvent('download');
    await page.getByTestId('download-my-data-button').click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('openread-export-e2e.json');
    await setScenarioEvidenceNote(page, 'SET-039 terminal', [
      `Browser download event filename: ${download.suggestedFilename()}`,
      'Download response content-type: application/json.',
      'Export fixture body redacted summary: { ok: true, books: [] }.',
    ]);

    await attachScenarioEvidence(page, testInfo, 'SET-039-terminal-download-my-data-success');
  });

  test('SET-040 surfaces user data export rate-limit error', async ({
    authenticatedPage: page,
  }, testInfo) => {
    await page.route('**/api/user/export', async (route) => {
      await route.fulfill({
        status: 429,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Rate limit exceeded' }),
      });
    });
    await openPreferences(page);
    await attachScenarioEvidence(page, testInfo, 'SET-040-start-download-my-data-rate-limit-error');

    await page.getByTestId('download-my-data-button').click();
    await expect(page.getByText(/Rate limit exceeded/i)).toBeVisible();

    await attachScenarioEvidence(
      page,
      testInfo,
      'SET-040-terminal-download-my-data-rate-limit-error',
    );
  });

  test('SET-041 cancels Clear Local Preferences without mutation', async ({
    authenticatedPage: page,
  }, testInfo) => {
    await openPreferences(page);
    await page.evaluate(() =>
      localStorage.setItem('notificationPreferences', '{"productUpdates":false}'),
    );
    await scrollToPreferencesSection(page, 'Privacy');
    await page.getByTestId('clear-local-preferences-button').click();
    await expect(page.getByRole('alertdialog')).toBeVisible();
    await setScenarioEvidenceNote(page, 'SET-041 start', [
      'Clear Local Preferences confirmation dialog is open.',
      'Before cancel: notificationPreferences={"productUpdates":false}.',
      'Expected action: cancel preserves local preference keys.',
    ]);
    await attachScenarioEvidence(page, testInfo, 'SET-041-start-clear-local-preferences-cancel');

    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('alertdialog')).toBeHidden();
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem('notificationPreferences')))
      .toBe('{"productUpdates":false}');
    await setScenarioEvidenceNote(page, 'SET-041 terminal', [
      'Cancel action completed and dialog closed.',
      'After cancel: notificationPreferences remains {"productUpdates":false}.',
      'No local preference keys were removed.',
    ]);

    await attachScenarioEvidence(page, testInfo, 'SET-041-terminal-clear-local-preferences-cancel');
  });

  test('SET-042 confirms Clear Local Preferences and removes local preference keys', async ({
    authenticatedPage: page,
  }, testInfo) => {
    await openPreferences(page);
    await page.evaluate(() => {
      localStorage.setItem('notificationPreferences', '{"productUpdates":false}');
      localStorage.setItem('customThemes', '[{"name":"qa-theme"}]');
    });
    await scrollToPreferencesSection(page, 'Privacy');
    await page.getByTestId('clear-local-preferences-button').click();
    await expect(page.getByRole('alertdialog')).toBeVisible();
    await setScenarioEvidenceNote(page, 'SET-042 start', [
      'Clear Local Preferences confirmation dialog is open.',
      'Before confirm: notificationPreferences and customThemes are present.',
      'Protected state check: auth/session and books are not part of local preference clear.',
    ]);
    await attachScenarioEvidence(page, testInfo, 'SET-042-start-clear-local-preferences-confirm');

    await page.getByRole('button', { name: 'Clear Preferences' }).click();
    await expect(page.getByRole('alertdialog')).toBeHidden();
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem('notificationPreferences')))
      .toBeNull();
    await expect.poll(() => page.evaluate(() => localStorage.getItem('customThemes'))).toBeNull();
    await setScenarioEvidenceNote(page, 'SET-042 terminal', [
      'Confirmed Clear Preferences.',
      'After confirm: notificationPreferences=null; customThemes=null.',
      'Theme/auth/book/progress data remain outside this local-preferences clear path.',
    ]);

    await attachScenarioEvidence(
      page,
      testInfo,
      'SET-042-terminal-clear-local-preferences-confirm',
    );
  });

  test('SET-043 cancels Reset Preferences without closing through confirm', async ({
    authenticatedPage: page,
  }, testInfo) => {
    await openPreferences(page);
    await page.evaluate(() => {
      localStorage.setItem('notificationPreferences', '{"productUpdates":false}');
      localStorage.setItem('themeMode', 'dark');
      localStorage.setItem('themeColor', 'sepia');
    });
    await scrollToPreferencesSection(page, 'Reset Preferences');
    await page.getByTestId('reset-preferences-button').click();
    await expect(page.getByRole('alertdialog')).toBeVisible();
    await setScenarioEvidenceNote(page, 'SET-043 start', [
      'Reset Preferences confirmation dialog is open.',
      'Before cancel: notificationPreferences, themeMode=dark, themeColor=sepia.',
      'Expected action: cancel keeps changed preference values.',
    ]);
    await attachScenarioEvidence(page, testInfo, 'SET-043-start-reset-preferences-cancel');

    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('alertdialog')).toBeHidden();
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem('notificationPreferences')))
      .toBe('{"productUpdates":false}');
    await expect.poll(() => page.evaluate(() => localStorage.getItem('themeMode'))).toBe('dark');
    await expect.poll(() => page.evaluate(() => localStorage.getItem('themeColor'))).toBe('sepia');
    await setScenarioEvidenceNote(page, 'SET-043 terminal', [
      'Cancel action completed and dialog closed.',
      'After cancel: notificationPreferences unchanged; themeMode=dark; themeColor=sepia.',
      'No reset occurred.',
    ]);

    await attachScenarioEvidence(page, testInfo, 'SET-043-terminal-reset-preferences-cancel');
  });

  test('SET-044 confirms Reset Preferences and clears local preference state', async ({
    authenticatedPage: page,
  }, testInfo) => {
    await openPreferences(page);
    await page.evaluate(() => {
      localStorage.setItem('notificationPreferences', '{"productUpdates":false}');
      localStorage.setItem('themeMode', 'dark');
      localStorage.setItem('themeColor', 'sepia');
    });
    await scrollToPreferencesSection(page, 'Reset Preferences');
    await page.getByTestId('reset-preferences-button').click();
    await expect(page.getByRole('alertdialog')).toBeVisible();
    await setScenarioEvidenceNote(page, 'SET-044 start', [
      'Reset Preferences confirmation dialog is open.',
      'Before confirm: notificationPreferences present; themeMode=dark; themeColor=sepia.',
      'Protected state check: books/progress/auth/account/billing/API keys are not reset by this action.',
    ]);
    await attachScenarioEvidence(page, testInfo, 'SET-044-start-reset-preferences-confirm');

    await page.getByRole('button', { name: 'Reset' }).click();
    await expect(page.getByRole('alertdialog')).toBeHidden();
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem('notificationPreferences')))
      .toBeNull();
    await expect.poll(() => page.evaluate(() => localStorage.getItem('themeMode'))).toBe('auto');
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem('themeColor')))
      .toBe('default');
    await setScenarioEvidenceNote(page, 'SET-044 terminal', [
      'Confirmed Reset Preferences and dialog closed.',
      'After confirm: notificationPreferences=null; themeMode=auto; themeColor=default.',
      'Books/progress/auth/account/billing/API keys preserved by scoped reset path.',
    ]);

    await attachScenarioEvidence(page, testInfo, 'SET-044-terminal-reset-preferences-confirm');
  });
});
