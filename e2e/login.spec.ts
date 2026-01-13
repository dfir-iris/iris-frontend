import { test, expect } from '@playwright/test';

test.describe('Login Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('https://127.0.0.1/login');
  });

  test('login_successfull_auth_should_redirect_to_dashboard', async ({ page }) => {
    await page.getByRole('textbox', { name: 'Username' }).click();
    await page.getByRole('textbox', { name: 'Username' }).fill('test');
    await page.getByRole('textbox', { name: 'Password' }).click();
    await page.getByRole('textbox', { name: 'Password' }).fill('Test123456789!');
    await page.getByRole('button', { name: 'Log in' }).click();
    
    await page.locator('div').filter({ hasText: 'Welcome back Please login to' }).nth(2).click({
      button: 'right'
    });    
    
    expect(page.url()).toBe('https://127.0.0.1/');
  });
});

