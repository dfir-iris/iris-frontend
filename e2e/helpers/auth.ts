import { type Page } from '@playwright/test';

export async function loginAsTestUser(page: Page) {
  await page.goto('https://127.0.0.1/login');
  await page.getByRole('textbox', { name: 'Username' }).fill('test');
  await page.getByRole('textbox', { name: 'Password' }).fill('Test123456789!');
  await page.getByRole('button', { name: 'Log in' }).click();
  
  await page.locator('div').filter({ hasText: 'Welcome back Please login to' }).nth(2).click({
    button: 'right'
  });    
  
}
