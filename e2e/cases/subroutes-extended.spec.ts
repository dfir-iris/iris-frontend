import { test, expect } from '../helpers/fixtures';
import { login } from '../helpers/auth';
import { adminApi, seed, cleanup } from '../helpers/api';

// Covers sub-routes that are NOT in cases/detail.spec.ts:
// /case/[id]/activity, /case/[id]/graph, and individual object detail pages.

test.describe('Case · extended sub-routes', () => {
	test('activity feed loads', async ({ page }) => {
		const api = await adminApi();
		const caseId = await seed.case(api, { case_name: 'e2e activity' });

		try {
			await login(page);
			await page.goto(`/case/${caseId}/activity`);
			await expect(page).toHaveURL(new RegExp(`/case/${caseId}/activity`));
			await expect(page.getByRole('main')).toBeVisible({ timeout: 10_000 });
		} finally {
			await cleanup.case(api, caseId);
			await api.dispose();
		}
	});

	test('graph view loads', async ({ page }) => {
		const api = await adminApi();
		const caseId = await seed.case(api, { case_name: 'e2e graph' });

		try {
			await login(page);
			await page.goto(`/case/${caseId}/graph`);
			await expect(page).toHaveURL(new RegExp(`/case/${caseId}/graph`));
			await expect(page.getByRole('main')).toBeVisible({ timeout: 10_000 });
		} finally {
			await cleanup.case(api, caseId);
			await api.dispose();
		}
	});

	test('asset detail page loads for a seeded asset', async ({ page }) => {
		const api = await adminApi();
		const caseId = await seed.case(api, { case_name: 'e2e asset detail' });
		const assetId = await seed.asset(api, caseId, { asset_name: 'detail-host' });

		try {
			await login(page);
			await page.goto(`/case/${caseId}/assets/${assetId}`);
			await expect(page.getByRole('main')).toBeVisible({ timeout: 10_000 });
		} finally {
			await cleanup.case(api, caseId);
			await api.dispose();
		}
	});

	test('IOC detail page loads for a seeded IOC', async ({ page }) => {
		const api = await adminApi();
		const caseId = await seed.case(api, { case_name: 'e2e ioc detail' });
		const iocId = await seed.ioc(api, caseId, { ioc_value: 'detail.ioc.example.com' });

		try {
			await login(page);
			await page.goto(`/case/${caseId}/iocs/${iocId}`);
			await expect(page.getByRole('main')).toBeVisible({ timeout: 10_000 });
		} finally {
			await cleanup.case(api, caseId);
			await api.dispose();
		}
	});

	test('evidence detail page loads for a seeded evidence', async ({ page }) => {
		const api = await adminApi();
		const caseId = await seed.case(api, { case_name: 'e2e evidence detail' });
		const evidenceId = await seed.evidence(api, caseId, { filename: 'detail.img' });

		try {
			await login(page);
			await page.goto(`/case/${caseId}/evidence/${evidenceId}`);
			await expect(page.getByRole('main')).toBeVisible({ timeout: 10_000 });
		} finally {
			await cleanup.case(api, caseId);
			await api.dispose();
		}
	});

	test('note detail page loads for a seeded note', async ({ page }) => {
		const api = await adminApi();
		const caseId = await seed.case(api, { case_name: 'e2e note detail' });
		const noteId = await seed.note(api, caseId, { note_title: 'Detail note' });

		try {
			await login(page);
			await page.goto(`/case/${caseId}/notes/${noteId}`);
			await expect(page.getByRole('main')).toBeVisible({ timeout: 10_000 });
		} finally {
			await cleanup.case(api, caseId);
			await api.dispose();
		}
	});

	test('task detail page loads for a seeded task', async ({ page }) => {
		const api = await adminApi();
		const caseId = await seed.case(api, { case_name: 'e2e task detail' });
		const taskId = await seed.task(api, caseId, { task_title: 'Detail task' });

		try {
			await login(page);
			await page.goto(`/case/${caseId}/tasks/${taskId}`);
			await expect(page.getByRole('main')).toBeVisible({ timeout: 10_000 });
		} finally {
			await cleanup.case(api, caseId);
			await api.dispose();
		}
	});
});
