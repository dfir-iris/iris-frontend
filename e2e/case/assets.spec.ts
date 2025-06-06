import { test, expect } from '@playwright/test';
import { loginAsTestUser } from '../helpers/auth';

test.describe('Asset Tests (Authenticated)', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsTestUser(page);
  });

  test('nonexistent asset should show an error', async ({ page }) => {
    await page.goto(`/case/1/assets/13848`);
    await expect(page.getByText('Asset Not Found')).toBeVisible();
    await expect(page.locator('body')).toContainText('The asset with ID #13848 could not be found or loaded.');
  });

  test('pc2 asset', async ({ page }) => {
    await page.goto(`/case/1/assets/13846`);
    await expect(page.getByRole('heading', { name: 'pc2' })).toBeVisible();
    await expect(page.getByText('Details Alerts Graph IOCs')).toBeVisible();
    await expect(page.getByText('bb2cb49d-896c-4123-bb41-')).toBeVisible();
    await expect(page.getByRole('tabpanel').getByText('Windows - Computer')).toBeVisible();
    await expect(page.getByText('Standard Windows Computer')).toBeVisible();
    await expect(page.getByText('pc2.org.internal', { exact: true })).toBeVisible();
    await expect(page.getByText('N/A')).toBeVisible();
    await page.getByRole('button', { name: 'privileged' }).click();
    await expect(page.getByRole('button', { name: 'Edit' })).toBeVisible();
  })
});