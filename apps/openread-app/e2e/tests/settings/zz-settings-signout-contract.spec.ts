import { expect, test } from '../../fixtures';
import { TEST_USER } from '../../fixtures/test-users';
import { attachScenarioEvidence, expectAccountSettings } from '../../helpers/settings-contract';

test.describe('Settings sign out contract', () => {
  test('SET-021 signs out from Settings and returns to a signed-out surface', async ({
    authenticatedPage: page,
  }, testInfo) => {
    await page.goto('/settings/account');
    await expectAccountSettings(page);
    await attachScenarioEvidence(page, testInfo, 'SET-021-start-danger-zone-sign-out');

    await page.getByRole('button', { name: 'Sign Out' }).click();
    await expect(page).toHaveURL(/\/(library|auth|login|sign-in)(\/|$|\?)/, { timeout: 15_000 });
    await expect(page.getByText(TEST_USER.email)).toHaveCount(0);

    await attachScenarioEvidence(page, testInfo, 'SET-021-terminal-danger-zone-sign-out');
  });
});
