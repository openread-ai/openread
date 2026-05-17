import type { Page } from '@playwright/test';
import { expect, test } from '../../fixtures';
import { TEST_USER } from '../../fixtures/test-users';
import {
  attachScenarioEvidence,
  attachViewportEvidence,
  setScenarioEvidenceNote,
} from '../../helpers/settings-contract';

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
          // Ignore malformed auth storage.
        }
      }
    },
    { token, user },
  );
}

async function mockBilling(page: Page) {
  await page.route('**/stripe/plans', async (route) => {
    await route.fulfill({
      json: [
        {
          plan: 'reader',
          productId: 'price_reader_monthly_qa',
          price: 999,
          currency: 'USD',
          interval: 'month',
          type: 'subscription',
        },
        {
          plan: 'pro',
          productId: 'price_pro_monthly_qa',
          price: 1999,
          currency: 'USD',
          interval: 'month',
          type: 'subscription',
        },
      ],
    });
  });

  await page.route('**/stripe/invoices', async (route) => {
    await route.fulfill({ json: [] });
  });

  await page.route('**/stripe/checkout', async (route) => {
    await route.fulfill({ json: { url: 'https://checkout.stripe.com/openread-qa/billing-plan' } });
  });

  await page.route('https://checkout.stripe.com/**', async (route) => {
    await route.fulfill({
      contentType: 'text/html',
      body: '<main aria-label="Mock Stripe Checkout"><h1>Mock Stripe Checkout</h1><p>OpenRead paid plan checkout handoff</p></main>',
    });
  });

  await page.route('**/stripe/portal', async (route) => {
    await route.fulfill({ json: { url: 'https://billing.stripe.com/openread-qa/portal' } });
  });

  await page.route('https://billing.stripe.com/**', async (route) => {
    await route.fulfill({
      contentType: 'text/html',
      body: '<main aria-label="Mock Stripe Billing Portal"><h1>Mock Stripe Billing Portal</h1><p>OpenRead manage-plan portal handoff</p></main>',
    });
  });

  await page.route('**/stripe/cancel-subscription', async (route) => {
    await route.fulfill({ json: { success: true } });
  });

  await page.route('**/subscription/cancel-survey', async (route) => {
    await route.fulfill({ json: { success: true } });
  });
}

async function openBilling(page: Page) {
  await mockBilling(page);
  await page.goto('/settings/billing', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/\/settings\/billing\/?$/);
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  await expect(page.getByText('Available Plans')).toBeVisible({ timeout: 20_000 });
}

test.describe('Settings billing contract', () => {
  test('SET-055 renders Free billing view and upgrade path', async ({
    authenticatedPage: page,
  }, testInfo) => {
    await forcePlan(page, 'free');
    await openBilling(page);
    await attachScenarioEvidence(
      page,
      testInfo,
      'SET-055-start-free-billing-view-and-upgrade-path',
    );

    await expect(page.getByText("You're on the Free plan")).toBeVisible();
    await expect(page.getByRole('link', { name: /Upgrade/i })).toBeVisible();
    await expect(page.getByText('Available Plans')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Switch Plan' }).first()).toBeVisible();

    await page.getByRole('link', { name: /Upgrade/i }).click();
    await expect(page.locator('#plans')).toBeVisible();

    await attachScenarioEvidence(
      page,
      testInfo,
      'SET-055-terminal-free-billing-view-and-upgrade-path',
    );
  });

  test('SET-056/SET-060 renders paid billing view and invoice/payment empty states', async ({
    authenticatedPage: page,
  }, testInfo) => {
    await forcePlan(page, 'reader');
    await openBilling(page);

    await expect(page.getByText('Current Plan').first()).toBeVisible();
    await expect(page.getByText('Reader Plan')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Manage Plan' })).toBeVisible();
    await setScenarioEvidenceNote(page, 'SET-056 start', [
      'Paid Reader billing view is loaded.',
      'Current Plan and Manage Plan controls are visible.',
    ]);
    await attachViewportEvidence(page, testInfo, 'SET-056-start-paid-billing-view');
    await attachViewportEvidence(page, testInfo, 'SET-056-detail-current-plan-and-manage');

    await expect(page.getByText('Payment Method').first()).toBeVisible();
    await expect(page.getByText('No payment method on file')).toBeVisible();
    await expect(page.getByText('Invoices').first()).toBeVisible();
    await expect(page.getByText('No invoices yet')).toBeVisible();
    await page.getByText('Payment Method').first().scrollIntoViewIfNeeded();
    await setScenarioEvidenceNote(page, 'SET-060 payment/invoice states', [
      'Payment Method empty state is visible.',
      'Invoices empty state is visible with no undefined/broken data.',
    ]);
    await attachViewportEvidence(
      page,
      testInfo,
      'SET-060-start-billing-invoice-payment-empty-states',
    );
    await attachViewportEvidence(page, testInfo, 'SET-056-detail-payment-method-and-invoices');
    await attachViewportEvidence(
      page,
      testInfo,
      'SET-060-terminal-billing-invoice-payment-empty-states',
    );

    await page.getByText('Available Plans').first().scrollIntoViewIfNeeded();
    await expect(page.getByText('Available Plans').first()).toBeVisible();
    await setScenarioEvidenceNote(page, 'SET-056 terminal', [
      'Paid billing page also exposes plan-comparison surfaces.',
      'Payment/invoice empty states are captured in the SET-056 detail screenshot.',
    ]);
    await attachViewportEvidence(page, testInfo, 'SET-056-detail-plan-comparison');
    await attachViewportEvidence(page, testInfo, 'SET-056-terminal-paid-billing-view');
  });

  test('SET-057 starts Stripe checkout from a paid plan CTA', async ({
    authenticatedPage: page,
  }, testInfo) => {
    await forcePlan(page, 'reader');
    await openBilling(page);
    await attachScenarioEvidence(page, testInfo, 'SET-057-start-stripe-checkout-handoff');

    await page.getByRole('button', { name: 'Switch Plan' }).first().click();
    await expect(page).toHaveURL(/checkout\.stripe\.com\/openread-qa\/billing-plan/, {
      timeout: 15_000,
    });
    await expect(page.getByRole('main', { name: 'Mock Stripe Checkout' })).toBeVisible();
    await setScenarioEvidenceNote(page, 'SET-057 Stripe checkout handoff', [
      'Checkout URL: https://checkout.stripe.com/openread-qa/billing-plan',
      'Fixture-backed Stripe checkout page loaded instead of generic app 404.',
      'Plan CTA: Switch Plan from Billing.',
    ]);

    await attachScenarioEvidence(page, testInfo, 'SET-057-terminal-stripe-checkout-handoff');
  });

  test('SET-058 opens the billing portal from Manage Plan', async ({
    authenticatedPage: page,
  }, testInfo) => {
    await forcePlan(page, 'reader');
    await openBilling(page);
    await attachScenarioEvidence(
      page,
      testInfo,
      'SET-058-start-billing-portal-manage-plan-handoff',
    );

    await page.getByRole('button', { name: 'Manage Plan' }).click();
    await expect(page).toHaveURL(/billing\.stripe\.com\/openread-qa\/portal/, {
      timeout: 15_000,
    });
    await expect(page.getByRole('main', { name: 'Mock Stripe Billing Portal' })).toBeVisible();
    await setScenarioEvidenceNote(page, 'SET-058 billing portal handoff', [
      'Portal URL: https://billing.stripe.com/openread-qa/portal',
      'Fixture-backed Stripe Billing Portal page loaded instead of generic app 404.',
      'CTA: Manage Plan from current subscription card.',
    ]);

    await attachScenarioEvidence(
      page,
      testInfo,
      'SET-058-terminal-billing-portal-manage-plan-handoff',
    );
  });

  test('SET-059 walks through the subscription cancellation flow to survey handoff', async ({
    authenticatedPage: page,
  }, testInfo) => {
    await forcePlan(page, 'reader');
    await openBilling(page);
    await attachScenarioEvidence(page, testInfo, 'SET-059-start-subscription-cancellation-flow');

    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('dialog', { name: 'Before you go...' })).toBeVisible();
    await page.getByRole('button', { name: 'Continue canceling' }).click();
    await expect(page.getByRole('dialog', { name: 'Help us improve' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Skip & Cancel' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Submit & Cancel' })).toBeDisabled();

    await attachScenarioEvidence(page, testInfo, 'SET-059-terminal-subscription-cancellation-flow');
  });
});
