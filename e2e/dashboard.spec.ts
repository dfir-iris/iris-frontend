import { test, expect } from '@playwright/test';

test('test dashboard populates', async ({ page }) => {
  await page.goto('http://localhost:4173');
  await expect(page.getByRole('banner')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();

  // default to seeing owned cases
  await expect(page.getByRole('heading', { name: 'Owned Cases' })).toBeVisible();
  await expect(page).toHaveURL(/#cases/);
  await expect(page.locator('.p-6 > .flex').first()).toBeVisible();
  await expect(page.locator('div').filter({ hasText: 'Owned Cases' }).nth(4)).toBeVisible();

  // hide the owned cases by clicking
  await page.getByText('2 Click to hide').click();
  await expect(page).toHaveURL(/#/);
  await expect(page.locator('div').filter({ hasText: 'Owned Cases' }).nth(4)).not.toBeVisible();

  // show owned cases by clicking again
  await page.locator('.p-6').first().click();
  await expect(page).toHaveURL(/#cases/);
  await expect(page.getByRole('heading', { name: 'Owned Cases' })).toBeVisible();
  await expect(page.getByRole('link', { name: '#1 - Initial Demo' })).toBeVisible();
  await expect(page.getByRole('link', { name: '#2 - Initial Demo' })).toBeVisible();
});