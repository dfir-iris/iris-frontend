import { test, expect } from '../helpers/fixtures';
import { login } from '../helpers/auth';
import { adminApi, seed, cleanup, apiJson } from '../helpers/api';

// War-room decision register + board: a decision whose target date & time
// is already past shows as overdue on the Decisions tab and lands in the
// Board's "Needs attention" list.

const rand = (p: string) => `${p}-${Math.random().toString(36).slice(2, 8)}`;

// Naive UTC, the shape the backend stores (no offset).
const naiveUtc = (ms: number) => new Date(ms).toISOString().slice(0, 19);

type Decision = {
	decision_id: number;
	ref: string;
	status: string;
	is_overdue: boolean;
	case_ids: number[];
};

test.describe('War room · decisions', () => {
	test('overdue decision shows on Decisions and Board attention', async ({ page }) => {
		const api = await adminApi();
		const wrId = await seed.warRoom(api);
		const caseId = await seed.case(api, { case_name: rand('e2e wr decision') });

		try {
			const attach = await api.post(`/api/v2/war-rooms/${wrId}/cases`, {
				data: { case_id: caseId }
			});
			expect(attach.ok(), await attach.text()).toBeTruthy();

			const title = rand('Keep site offline');
			const create = await api.post(`/api/v2/war-rooms/${wrId}/decisions`, {
				data: {
					title,
					rationale: 'Created by e2e',
					target_at: naiveUtc(Date.now() - 2 * 60 * 60 * 1000),
					case_ids: [caseId]
				}
			});
			expect(create.status(), await create.text()).toBe(201);
			const decision = await apiJson<Decision>(create);
			expect(decision.ref).toMatch(/^D-\d+$/);
			expect(decision.status).toBe('proposed');
			expect(decision.is_overdue).toBe(true);
			expect(decision.case_ids).toContain(caseId);

			// Board API flags it.
			const boardRes = await api.get(`/api/v2/war-rooms/${wrId}/board`);
			expect(boardRes.ok(), await boardRes.text()).toBeTruthy();
			const board = await apiJson<{
				kpis: { decisions_overdue: number };
				attention: { type: string; decision_id?: number | null }[];
			}>(boardRes);
			expect(board.kpis.decisions_overdue).toBeGreaterThanOrEqual(1);
			expect(
				board.attention.some(
					(a) => a.type === 'decision_overdue' && a.decision_id === decision.decision_id
				)
			).toBeTruthy();

			await login(page);

			// Decisions tab: row carries the ref, title and an Overdue badge.
			await page.goto(`/war-rooms/${wrId}/decisions?d=${decision.decision_id}`);
			const row = page.locator(`#decision-${decision.decision_id}`);
			await expect(row).toBeVisible({ timeout: 10_000 });
			await expect(row).toContainText(decision.ref);
			await expect(row).toContainText(title);
			await expect(row).toContainText('Overdue');
			await expect(row).toContainText(/overdue by/);
			await expect(page.getByTestId('decision-title')).toHaveText(title);
			await expect(page.getByTestId('decision-target-relative')).toContainText(/overdue by/);

			// Board: the attention list links back to the decision.
			await page.goto(`/war-rooms/${wrId}/board`);
			const attention = page.getByTestId('board-attention');
			await expect(attention).toBeVisible({ timeout: 10_000 });
			const link = attention.locator(
				`a[href="/war-rooms/${wrId}/decisions?d=${decision.decision_id}"]`
			);
			await expect(link.first()).toBeVisible();
			await expect(page.getByTestId('board-kpis')).toContainText(/overdue/);

			await link.first().click();
			await expect(page).toHaveURL(
				new RegExp(`/war-rooms/${wrId}/decisions\\?d=${decision.decision_id}`)
			);
			await expect(page.getByTestId('decision-title')).toHaveText(title);
		} finally {
			await cleanup.warRoom(api, wrId);
			await cleanup.case(api, caseId);
			await api.dispose();
		}
	});

	test('pending decision without a target shows on the Board, the room landing page', async ({
		page
	}) => {
		const api = await adminApi();
		const wrId = await seed.warRoom(api);

		try {
			const title = rand('Pending decision');
			const create = await api.post(`/api/v2/war-rooms/${wrId}/decisions`, {
				data: { title }
			});
			expect(create.status(), await create.text()).toBe(201);
			const decision = await apiJson<Decision>(create);

			await login(page);
			await page.goto(`/war-rooms/${wrId}`);
			await expect(page).toHaveURL(new RegExp(`/war-rooms/${wrId}/board`));

			const item = page
				.getByTestId('board-decisions')
				.locator(`a[href="/war-rooms/${wrId}/decisions?d=${decision.decision_id}"]`);
			await expect(item).toBeVisible({ timeout: 10_000 });
			await expect(item).toContainText(title);
			await expect(
				page
					.getByTestId('board-attention')
					.locator(`a[href="/war-rooms/${wrId}/decisions?d=${decision.decision_id}"]`)
					.first()
			).toBeVisible();

			// KPI cards jump to their section.
			await page
				.getByTestId('board-kpi')
				.filter({ hasText: /open decisions/i })
				.click();
			await expect(page).toHaveURL(new RegExp(`/war-rooms/${wrId}/decisions$`));
		} finally {
			await cleanup.warRoom(api, wrId);
			await api.dispose();
		}
	});

	test('propose a decision from the UI', async ({ page }) => {
		const api = await adminApi();
		const wrId = await seed.warRoom(api);

		try {
			await login(page);
			await page.goto(`/war-rooms/${wrId}/decisions`);
			await page.getByRole('button', { name: 'Propose' }).first().click();

			const dialog = page.getByRole('dialog');
			await expect(dialog).toBeVisible();
			const title = rand('UI decision');
			await dialog.getByLabel('Decision', { exact: true }).fill(title);
			await dialog.getByLabel('Target date & time').fill('2030-01-01T09:00');
			await dialog.getByRole('button', { name: 'Propose' }).click();

			await expect(page.getByTestId('decision-title')).toHaveText(title, { timeout: 10_000 });
			await expect(page.getByTestId('decision-target-relative')).toContainText(/^in /);

			const list = await api.get(`/api/v2/war-rooms/${wrId}/decisions`);
			expect(list.ok()).toBeTruthy();
			expect(await list.text()).toContain(title);
		} finally {
			await cleanup.warRoom(api, wrId);
			await api.dispose();
		}
	});
});
