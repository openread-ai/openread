import type { Page } from '@playwright/test';
import { expect, test } from '../../fixtures';
import {
  attachScenarioEvidence,
  attachScenarioEvidenceArtifact,
  expectAccountSettings,
  setScenarioEvidenceNote,
} from '../../helpers/settings-contract';

type StorageQuotaFixture = {
  plan: string;
  base_gb: number;
  addon_gb: number;
  total_bytes: number;
  used_bytes: number;
  available_bytes: number;
  percent_used: number;
  is_over_limit: boolean;
  active_addons: Array<{
    id: string;
    gb_amount: number;
    price_cents: number;
    source: string;
    created_at: string;
  }>;
  available_addons: Array<{
    gb: number;
    price_cents: number;
    mobile_price_cents: number;
  }>;
};

const GB = 1024 * 1024 * 1024;

function quotaFixture(overrides: Partial<StorageQuotaFixture> = {}): StorageQuotaFixture {
  const base: StorageQuotaFixture = {
    plan: 'reader',
    base_gb: 10,
    addon_gb: 0,
    total_bytes: 10 * GB,
    used_bytes: 2 * GB,
    available_bytes: 8 * GB,
    percent_used: 20,
    is_over_limit: false,
    active_addons: [],
    available_addons: [],
  };

  return { ...base, ...overrides };
}

async function mockStorageQuota(page: Page, quota: StorageQuotaFixture) {
  await page.route('**/storage/quota', async (route) => {
    await route.fulfill({ json: quota });
  });
}

async function openAccount(page: Page) {
  await page.goto('/settings/account', { waitUntil: 'domcontentloaded' });
  await expectAccountSettings(page);
}

async function expectStableStorageQuota(page: Page, expectedText: Array<string | RegExp>) {
  for (const text of expectedText) {
    await expect(page.getByText(text).first()).toBeVisible();
  }
  await expect(page.locator('.animate-pulse')).toHaveCount(0);
  await page.waitForTimeout(750);
  for (const text of expectedText) {
    await expect(page.getByText(text).first()).toBeVisible();
  }
  await expect(page.locator('.animate-pulse')).toHaveCount(0);
}

test.describe('Settings storage contract', () => {
  test('SET-011 shows storage quota loading before resolving', async ({
    authenticatedPage: page,
  }, testInfo) => {
    let resolveQuota: (() => void) | null = null;
    await page.route('**/storage/quota', async (route) => {
      await new Promise<void>((resolve) => {
        resolveQuota = resolve;
      });
      await route.fulfill({ json: quotaFixture() });
    });

    await page.goto('/settings/account', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('Cloud Storage').first()).toBeVisible();
    await expect(page.locator('.animate-pulse').first()).toBeVisible();
    await attachScenarioEvidence(page, testInfo, 'SET-011-start-storage-quota-loading');

    resolveQuota?.();
    await expect(page.getByText(/2 GB of 10 GB used/i)).toBeVisible();

    await attachScenarioEvidence(page, testInfo, 'SET-011-terminal-storage-quota-loading');
  });

  test('SET-013 surfaces storage quota error state', async ({
    authenticatedPage: page,
  }, testInfo) => {
    await page.route('**/storage/quota', async (route) => {
      await route.fulfill({ status: 500, json: { error: 'quota unavailable' } });
    });

    await page.goto('/settings/account', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/settings\/account\/?$/);
    await expect(page.getByText('Cloud Storage').first()).toBeVisible();
    await attachScenarioEvidence(page, testInfo, 'SET-013-start-storage-quota-error');
    await expect(page.getByText('Failed to load storage information')).toBeVisible();

    await attachScenarioEvidence(page, testInfo, 'SET-013-terminal-storage-quota-error');
  });

  test('SET-014 renders storage over-limit warning', async ({
    authenticatedPage: page,
  }, testInfo) => {
    await mockStorageQuota(
      page,
      quotaFixture({
        used_bytes: 12 * GB,
        available_bytes: 0,
        percent_used: 120,
        is_over_limit: true,
      }),
    );
    await openAccount(page);
    await attachScenarioEvidence(page, testInfo, 'SET-014-start-storage-over-limit-warning');

    await expect(page.getByText(/12 GB of 10 GB used/i)).toBeVisible();
    await expect(page.getByText(/Upgrade your plan or remove files/i)).toBeVisible();

    await attachScenarioEvidence(page, testInfo, 'SET-014-terminal-storage-over-limit-warning');
  });

  test('SET-015 hides paid storage add-on checkout for paid tiers', async ({
    authenticatedPage: page,
  }, testInfo) => {
    await mockStorageQuota(page, quotaFixture());
    await openAccount(page);
    await expectStableStorageQuota(page, [
      /2 GB of 10 GB used/i,
      /Up to 10 GB included with Reader plan/i,
    ]);
    await attachScenarioEvidence(
      page,
      testInfo,
      'SET-015-start-storage-tier-only-no-add-on-checkout',
    );

    await expect(page.getByRole('button', { name: 'Add Storage' })).toHaveCount(0);
    await expect(page.getByRole('dialog', { name: 'Add Storage' })).toHaveCount(0);

    const checkoutResponse = await page.request.post('/api/stripe/create-storage-checkout', {
      data: { gbAmount: 25 },
    });
    expect(checkoutResponse.status()).toBe(410);
    const checkoutBody = await checkoutResponse.json();
    expect(checkoutBody.error).toBe('STORAGE_ADDONS_DISABLED');
    await attachScenarioEvidenceArtifact(testInfo, 'SET-015-api-storage-checkout-disabled', {
      method: 'POST',
      path: '/api/stripe/create-storage-checkout',
      status: checkoutResponse.status(),
      response: checkoutBody,
    });
    await setScenarioEvidenceNote(page, 'SET-015 storage is tier-only', [
      'No Add Storage CTA or checkout dialog is rendered for paid users.',
      'Direct storage checkout API request returns 410 STORAGE_ADDONS_DISABLED.',
    ]);
    await expectStableStorageQuota(page, [
      /2 GB of 10 GB used/i,
      /Up to 10 GB included with Reader plan/i,
    ]);

    await attachScenarioEvidence(
      page,
      testInfo,
      'SET-015-terminal-storage-tier-only-no-add-on-checkout',
    );
  });

  test('SET-016 displays tier storage without add-on contribution', async ({
    authenticatedPage: page,
  }, testInfo) => {
    await mockStorageQuota(
      page,
      quotaFixture({
        plan: 'pro',
        base_gb: 50,
        total_bytes: 50 * GB,
        used_bytes: 20 * GB,
        available_bytes: 30 * GB,
        percent_used: 40,
      }),
    );
    await openAccount(page);
    await expectStableStorageQuota(page, [
      /20 GB of 50 GB used/i,
      /Up to 50 GB included with Pro plan/i,
    ]);
    await attachScenarioEvidence(page, testInfo, 'SET-016-start-tier-storage-limit-display');

    await expect(page.getByText('Active Add-ons')).toHaveCount(0);
    await expect(page.getByText(/\+25 GB/)).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Add Storage' })).toHaveCount(0);
    await expectStableStorageQuota(page, [
      /20 GB of 50 GB used/i,
      /Up to 50 GB included with Pro plan/i,
    ]);

    await attachScenarioEvidence(page, testInfo, 'SET-016-terminal-tier-storage-limit-display');
  });

  test('SET-017 disables storage add-on cancel flow', async ({
    authenticatedPage: page,
  }, testInfo) => {
    await mockStorageQuota(page, quotaFixture());
    await openAccount(page);
    await expectStableStorageQuota(page, [
      /2 GB of 10 GB used/i,
      /Up to 10 GB included with Reader plan/i,
    ]);
    await attachScenarioEvidence(page, testInfo, 'SET-017-start-storage-add-on-cancel-disabled');

    await expect(page.getByText('Active Add-ons')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Cancel' })).toHaveCount(0);

    const cancelResponse = await page.request.post('/api/stripe/cancel-storage-addon', {
      data: { addonId: 'storage-addon-qa' },
    });
    expect(cancelResponse.status()).toBe(410);
    const cancelBody = await cancelResponse.json();
    expect(cancelBody.error).toBe('STORAGE_ADDONS_DISABLED');
    await attachScenarioEvidenceArtifact(testInfo, 'SET-017-api-storage-cancel-disabled', {
      method: 'POST',
      path: '/api/stripe/cancel-storage-addon',
      status: cancelResponse.status(),
      response: cancelBody,
    });
    await setScenarioEvidenceNote(page, 'SET-017 storage add-on cancellation disabled', [
      'No active add-on rows or cancel controls are rendered.',
      'Direct storage cancellation API request returns 410 STORAGE_ADDONS_DISABLED.',
    ]);
    await expectStableStorageQuota(page, [
      /2 GB of 10 GB used/i,
      /Up to 10 GB included with Reader plan/i,
    ]);

    await attachScenarioEvidence(page, testInfo, 'SET-017-terminal-storage-add-on-cancel-disabled');
  });
});
