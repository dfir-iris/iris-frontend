import { test, expect } from '../helpers/fixtures';
import { login } from '../helpers/auth';
import { expectToast } from '../helpers/ui';
import { adminApi, seed, cleanup, apiJson } from '../helpers/api';

// War-room task fan-out (one linked case task per attached case) and
// SitRep auto-draft (body generated from the live war-room state).

const rand = (p: string) => `${p}-${Math.random().toString(36).slice(2, 8)}`;

type FanOutLink = {
	case_id: number;
	accessible: boolean;
	case_task_id?: number | null;
	task_title?: string | null;
};

type SitRep = { sitrep_id: number; title: string; body_md?: string; published: boolean };

test.describe('War room · task fan-out and SitRep auto-draft', () => {
	test('fan out a war-room task to an attached case creates the case task', async ({ page }) => {
		const api = await adminApi();
		const wrId = await seed.warRoom(api);
		const caseId = await seed.case(api, { case_name: rand('e2e wr fan-out') });

		try {
			const attach = await api.post(`/api/v2/war-rooms/${wrId}/cases`, {
				data: { case_id: caseId }
			});
			expect(attach.ok(), await attach.text()).toBeTruthy();

			const title = rand('Disable legacy auth');
			const created = await api.post(`/api/v2/war-rooms/${wrId}/tasks`, {
				data: { title, description: 'Created by e2e' }
			});
			expect(created.ok(), await created.text()).toBeTruthy();
			const task = await apiJson<{ task_id: number }>(created);

			await login(page);
			await page.goto(`/war-rooms/${wrId}/tasks`);
			await expect(page.getByText(title).first()).toBeVisible({ timeout: 10_000 });

			await page.getByRole('button', { name: 'Fan out to cases' }).first().click();
			const dialog = page.getByRole('dialog', { name: 'Fan out to cases' });
			await expect(dialog).toBeVisible();

			// Every attached, not-yet-linked case is pre-selected.
			const checkbox = dialog.locator(`#fan-out-case-${caseId}`);
			await expect(checkbox).toBeVisible({ timeout: 10_000 });
			await expect(checkbox).toHaveAttribute('data-state', 'checked');

			await dialog.getByRole('button', { name: /Fan out to 1 case/ }).click();
			const results = dialog.getByRole('list', { name: 'Fan-out results' });
			await expect(results).toBeVisible({ timeout: 10_000 });
			await expect(results.getByText('Created')).toBeVisible();
			await dialog.getByRole('button', { name: 'Close' }).first().click();
			await expect(dialog).toBeHidden();

			// Roll-up pill + per-case list on the row.
			await expect(page.getByText(/0\/1 cases done/)).toBeVisible({ timeout: 10_000 });
			await expect(
				page.getByRole('link', { name: `Open the task in case #${caseId}` })
			).toBeVisible();

			// The link is reported by the API...
			const statusRes = await api.get(`/api/v2/war-rooms/${wrId}/tasks/${task.task_id}/fan-out`);
			expect(statusRes.ok(), await statusRes.text()).toBeTruthy();
			const links = await apiJson<FanOutLink[]>(statusRes);
			const link = links.find((l) => l.case_id === caseId);
			expect(link?.accessible).toBe(true);
			expect(link?.case_task_id).toBeTruthy();

			// ...and the task exists in the case itself.
			const caseTask = await api.get(`/api/v2/cases/${caseId}/tasks/${link!.case_task_id}`);
			expect(caseTask.ok(), await caseTask.text()).toBeTruthy();
			expect(await caseTask.text()).toContain(title);

			// Fanning out again to the same case is idempotent.
			const again = await api.post(`/api/v2/war-rooms/${wrId}/tasks/${task.task_id}/fan-out`, {
				data: { case_ids: [caseId] }
			});
			expect(again.ok(), await again.text()).toBeTruthy();
			const againBody = await apiJson<{ results: { case_id: number; status: string }[] }>(again);
			expect(againBody.results.find((r) => r.case_id === caseId)?.status).toBe('exists');
		} finally {
			await cleanup.warRoom(api, wrId);
			await cleanup.case(api, caseId);
			await api.dispose();
		}
	});

	test('auto-draft creates a SitRep draft naming the attached case', async ({ page }) => {
		const api = await adminApi();
		const wrId = await seed.warRoom(api);
		const caseName = rand('e2e wr sitrep');
		const caseId = await seed.case(api, { case_name: caseName });

		try {
			const attach = await api.post(`/api/v2/war-rooms/${wrId}/cases`, {
				data: { case_id: caseId }
			});
			expect(attach.ok(), await attach.text()).toBeTruthy();

			await login(page);
			await page.goto(`/war-rooms/${wrId}/sitreps`);
			await expect(page.getByRole('main')).toBeVisible({ timeout: 10_000 });

			await page.getByRole('button', { name: 'Auto-draft a SitRep from the war room' }).click();
			await expectToast(page, /Draft generated/);

			const listRes = await api.get(`/api/v2/war-rooms/${wrId}/sitreps`);
			expect(listRes.ok(), await listRes.text()).toBeTruthy();
			const list = await apiJson<SitRep[]>(listRes);
			expect(list.length).toBe(1);
			expect(list[0].published).toBe(false);

			const detailRes = await api.get(`/api/v2/war-rooms/${wrId}/sitreps/${list[0].sitrep_id}`);
			expect(detailRes.ok(), await detailRes.text()).toBeTruthy();
			const detail = await apiJson<SitRep>(detailRes);
			// The case name may be markdown-escaped; the random suffix is
			// plain alphanumerics so it survives escaping.
			expect(detail.body_md ?? '').toContain(caseName.split('-').pop()!);

			// The new draft is listed in the sidebar.
			await expect(page.getByText(detail.title).first()).toBeVisible();
		} finally {
			await cleanup.warRoom(api, wrId);
			await cleanup.case(api, caseId);
			await api.dispose();
		}
	});
});
