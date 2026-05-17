import { test, expect } from '../../fixtures';
import { attachScenarioEvidence, setScenarioEvidenceNote } from '../../helpers/settings-contract';

test.describe('Chromium settings and billing', () => {
  test('billing page renders generic plan and upgrade surfaces', async ({
    authenticatedPage: page,
  }, testInfo) => {
    await page.goto('/settings/billing', { waitUntil: 'domcontentloaded' });
    await attachScenarioEvidence(page, testInfo, 'SET-054-start-billing-loading-and-error-states');

    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Billing' })).toBeVisible();
    await expect(
      page.getByText(/Free plan|Available Plans|Current Plan|AI Usage|Storage/i).first(),
    ).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Available Plans')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('body')).not.toContainText(/\bAI Boosts?\b|Boost balance|Buy Boost/i);

    const upgradeLink = page.getByRole('link', { name: /Upgrade/ }).first();
    if (await upgradeLink.isVisible()) {
      await upgradeLink.click();
      await expect(page.getByText('Available Plans')).toBeVisible();
    }

    await attachScenarioEvidence(
      page,
      testInfo,
      'SET-054-terminal-billing-loading-and-error-states',
    );
  });

  test('settings tab navigation reaches billing and API key surfaces', async ({
    authenticatedPage: page,
  }, testInfo) => {
    await page.route('**/api/api-keys**', async (route) => {
      await route.fulfill({ json: { keys: [] } });
    });
    await page.goto('/settings/billing', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('Available Plans')).toBeVisible({ timeout: 30_000 });
    await attachScenarioEvidence(page, testInfo, 'SET-004-start-switch-settings-tabs-by-pointer');

    await page.getByRole('link', { name: 'API Keys' }).click();
    await expect(page).toHaveURL(/\/settings\/api-keys\/?$/);
    await expect(page.getByText('API Keys').first()).toBeVisible();

    await page.getByRole('link', { name: 'Billing' }).click();
    await expect(page).toHaveURL(/\/settings\/billing\/?$/);
    await expect(page.getByText('Available Plans')).toBeVisible({ timeout: 30_000 });

    await attachScenarioEvidence(
      page,
      testInfo,
      'SET-004-terminal-switch-settings-tabs-by-pointer',
    );
  });

  test('API keys page masks existing keys and exposes create flow without creating one', async ({
    authenticatedPage: page,
  }, testInfo) => {
    await page.route('**/api/api-keys**', async (route) => {
      await route.fulfill({ json: { keys: [] } });
    });

    await page.goto('/settings/api-keys', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
    await expect(page.getByText('API Keys').first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create API Key' })).toBeVisible();
    await expect(page.getByText('Your API Keys')).toBeVisible();
    await expect(page.locator('body')).not.toContainText(/orsk-[A-Za-z0-9_-]{12,}/);
    await setScenarioEvidenceNote(page, 'SET-045 start', [
      'API Keys page shell and key-list region are visible.',
      'No raw orsk-* key material is rendered before list resolution.',
    ]);
    await attachScenarioEvidence(
      page,
      testInfo,
      'SET-045-start-api-key-list-empty-loading-existing',
    );

    await expect(
      page.getByText('No API keys yet. Create one to connect your AI tools.'),
    ).toBeVisible();
    await setScenarioEvidenceNote(page, 'SET-045 transient', [
      'Empty state verified after GET /api/api-keys returned keys: [].',
      'Empty copy: No API keys yet. Create one to connect your AI tools.',
    ]);
    await attachScenarioEvidence(
      page,
      testInfo,
      'SET-045-transient-api-key-list-empty-loading-existing',
    );

    await page.unroute('**/api/api-keys**');
    await page.route('**/api/api-keys**', async (route) => {
      await route.fulfill({
        json: {
          keys: [
            {
              id: 'qa-key-1',
              description: 'Claude Desktop QA',
              keyPrefix: 'orsk_qa1',
              createdAt: new Date().toISOString(),
              lastUsedAt: null,
            },
          ],
        },
      });
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByText('Claude Desktop QA')).toBeVisible();
    await expect(page.locator('body')).not.toContainText(/orsk-[A-Za-z0-9_-]{12,}/);
    await expect(page.getByText(/Never used/i)).toBeVisible();
    await setScenarioEvidenceNote(page, 'SET-045 terminal', [
      'Existing API key row is visible after refresh.',
      'Masked/prefix-only display verified; raw orsk-* secret absent from page body.',
      'Existing row last-used state: Never used.',
    ]);
    await attachScenarioEvidence(
      page,
      testInfo,
      'SET-045-terminal-api-key-list-empty-loading-existing',
    );

    await page.getByRole('button', { name: 'Create API Key' }).click();
    const dialog = page.getByRole('dialog', { name: 'Create API Key' });
    await expect(dialog).toBeVisible();
    await expect(page.getByText(/description/i).first()).toBeVisible();

    const createKeyButton = dialog.getByRole('button', { name: 'Create Key' });
    await expect(createKeyButton).toBeDisabled();
    await setScenarioEvidenceNote(page, 'SET-046 start', [
      'Create API Key dialog is open with empty Description.',
      'Create Key is disabled, proving empty-submit prevention.',
      'No API key has been created.',
    ]);
    await attachScenarioEvidence(page, testInfo, 'SET-046-start-create-api-key-dialog-validation');

    await dialog.getByLabel('Description').fill('Chromium QA key - do not submit');
    await expect(createKeyButton).toBeEnabled();
    await setScenarioEvidenceNote(page, 'SET-046 transient', [
      'Description field has a valid value.',
      'Create Key button is enabled only after validation passes.',
    ]);
    await attachScenarioEvidence(
      page,
      testInfo,
      'SET-046-transient-create-api-key-dialog-validation',
    );

    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('dialog')).toBeHidden({ timeout: 10_000 });
    await expect(page.getByText('Claude Desktop QA')).toBeVisible();
    await expect(page.getByText('Chromium QA key - do not submit')).toHaveCount(0);
    await setScenarioEvidenceNote(page, 'SET-046 terminal', [
      'Cancel closed the Create API Key dialog.',
      'Post-cancel list still contains only the pre-existing Claude Desktop QA row.',
      'No Chromium QA key was created.',
    ]);
    await attachScenarioEvidence(
      page,
      testInfo,
      'SET-046-terminal-create-api-key-dialog-validation',
    );
  });
});
