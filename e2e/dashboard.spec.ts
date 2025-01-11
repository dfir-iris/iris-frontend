import { test, expect } from '@playwright/test';

test('test dashboard populates', async ({ page }) => {
  await page.goto('http://localhost:4173');
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Owned Cases' })).toBeVisible();
  await expect(page.locator('.p-6 > .flex').first()).toBeVisible();
  await expect(page.getByRole('link', { name: '#1 - Initial Demo' })).toBeVisible();
  await expect(page.getByRole('link', { name: '#2 - Initial Demo' })).toBeVisible();
});