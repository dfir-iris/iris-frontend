import { test, expect } from '@playwright/test';

test('basic home test', async ({ page }) => {
  await page.goto('');
  const title = await page.title();
  expect(title).toBe('Dashboard | DFIR-IRIS');
});