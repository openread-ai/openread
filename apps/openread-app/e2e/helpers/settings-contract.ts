import { writeFile } from 'node:fs/promises';
import type { Page, TestInfo } from '@playwright/test';
import { expect } from '@playwright/test';

export async function attachScenarioEvidence(page: Page, testInfo: TestInfo, name: string) {
  const screenshotPath = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: true });
  await testInfo.attach(`evidence:${name}`, {
    path: screenshotPath,
    contentType: 'image/png',
  });
}

export async function attachScenarioEvidenceArtifact(
  testInfo: TestInfo,
  name: string,
  body: unknown,
) {
  const artifactPath = testInfo.outputPath(`${name}.json`);
  await writeFile(artifactPath, `${JSON.stringify(body, null, 2)}\n`);
  await testInfo.attach(`evidence:${name}`, {
    path: artifactPath,
    contentType: 'application/json',
  });
}

export async function attachScenarioEvidenceSlots(page: Page, testInfo: TestInfo, names: string[]) {
  if (!names.length) return;
  const screenshotPath = testInfo.outputPath(`${names[0]}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: true });
  for (const name of names) {
    await testInfo.attach(`evidence:${name}`, {
      path: screenshotPath,
      contentType: 'image/png',
    });
  }
}

export async function attachViewportEvidence(page: Page, testInfo: TestInfo, name: string) {
  const screenshotPath = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: false });
  await testInfo.attach(`evidence:${name}`, {
    path: screenshotPath,
    contentType: 'image/png',
  });
}

export async function setScenarioEvidenceNote(page: Page, title: string, details: string[]) {
  await page.evaluate(
    ({ title, details }) => {
      document.getElementById('openread-qa-evidence-note')?.remove();
      const note = document.createElement('aside');
      note.id = 'openread-qa-evidence-note';
      note.setAttribute('aria-label', 'QA evidence note');
      note.style.position = 'fixed';
      note.style.right = '12px';
      note.style.top = '12px';
      note.style.zIndex = '2147483647';
      note.style.maxWidth = '430px';
      note.style.padding = '12px';
      note.style.border = '2px solid #111827';
      note.style.borderRadius = '8px';
      note.style.background = 'rgba(255,255,255,0.96)';
      note.style.color = '#111827';
      note.style.font = '12px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace';
      note.style.boxShadow = '0 10px 25px rgba(0,0,0,0.25)';
      const heading = document.createElement('strong');
      heading.textContent = title;
      heading.style.display = 'block';
      heading.style.marginBottom = '6px';
      note.append(heading);
      for (const detail of details) {
        const item = document.createElement('div');
        item.textContent = detail;
        item.style.marginTop = '3px';
        note.append(item);
      }
      document.body.append(note);
    },
    { title, details },
  );
}

export async function clearScenarioEvidenceNote(page: Page) {
  await page.evaluate(() => document.getElementById('openread-qa-evidence-note')?.remove());
}

export async function expectSettingsShell(page: Page) {
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Account' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Billing' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Preferences' })).toBeVisible();
}

export async function expectAccountSettings(page: Page) {
  await expect(page).toHaveURL(/\/settings\/account\/?$/);
  await expectSettingsShell(page);
  await expect(page.getByText('Profile').first()).toBeVisible();
  await expect(page.getByText('Cloud Storage').first()).toBeVisible();
  await expect(page.getByText('Sync').first()).toBeVisible();
  await expect(page.getByText('Danger Zone').first()).toBeVisible();
}

export async function expectPreferencesSettings(page: Page) {
  await expect(page).toHaveURL(/\/settings\/preferences\/?$/);
  await expectSettingsShell(page);
  await expect(page.getByText('Appearance').first()).toBeVisible();
  await expect(page.getByText('Reading').first()).toBeVisible();
  await expect(page.getByText('AI Settings').first()).toBeVisible();
  await expect(page.getByText('Notifications').first()).toBeVisible();
  await expect(page.getByText('Privacy').first()).toBeVisible();
  await expect(page.getByText('Reset Preferences').first()).toBeVisible();
}
