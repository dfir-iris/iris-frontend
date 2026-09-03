import { test, expect } from '../helpers/fixtures';
import { adminApi, seed, cleanup, apiJson } from '../helpers/api';

// Comment CRUD on case-scoped objects (assets, iocs, notes, tasks, evidences).
// Comments are accessed via the standalone resource URL, e.g.
// /api/v2/assets/<id>/comments (NOT /api/v2/cases/<id>/assets/<id>/comments).

test.describe('Case object comments · API', () => {
	// ── Asset comments ─────────────────────────────────────────────────────

	test('asset: post → list → delete comment', async () => {
		const api = await adminApi();
		const caseId = await seed.case(api, { case_name: 'e2e asset comment' });
		const assetId = await seed.asset(api, caseId, { asset_name: 'comment-host' });

		try {
			const base = `/api/v2/assets/${assetId}/comments`;

			const post = await api.post(base, { data: { comment_text: 'asset note' } });
			expect(post.ok(), await post.text()).toBeTruthy();
			const comment = await apiJson<{ comment_id: number }>(post);
			expect(comment.comment_id).toBeGreaterThan(0);

			const list = await api.get(base);
			expect(list.ok()).toBeTruthy();
			const text = await list.text();
			expect(text).toContain('asset note');

			const del = await api.delete(`${base}/${comment.comment_id}`);
			expect(del.ok(), await del.text()).toBeTruthy();
		} finally {
			await cleanup.case(api, caseId);
			await api.dispose();
		}
	});

	// ── IOC comments ───────────────────────────────────────────────────────

	test('ioc: post → list → delete comment', async () => {
		const api = await adminApi();
		const caseId = await seed.case(api, { case_name: 'e2e ioc comment' });
		const iocId = await seed.ioc(api, caseId, { ioc_value: 'comment.ioc.example.com' });

		try {
			const base = `/api/v2/iocs/${iocId}/comments`;

			const post = await api.post(base, { data: { comment_text: 'ioc note' } });
			expect(post.ok(), await post.text()).toBeTruthy();
			const comment = await apiJson<{ comment_id: number }>(post);

			const list = await api.get(base);
			expect(list.ok()).toBeTruthy();
			expect(await list.text()).toContain('ioc note');

			await api.delete(`${base}/${comment.comment_id}`);
		} finally {
			await cleanup.case(api, caseId);
			await api.dispose();
		}
	});

	// ── Note comments ──────────────────────────────────────────────────────

	test('note: post → list → delete comment', async () => {
		const api = await adminApi();
		const caseId = await seed.case(api, { case_name: 'e2e note comment' });
		const noteId = await seed.note(api, caseId, { note_title: 'CommentNote' });

		try {
			const base = `/api/v2/notes/${noteId}/comments`;

			const post = await api.post(base, { data: { comment_text: 'note comment' } });
			expect(post.ok(), await post.text()).toBeTruthy();
			const comment = await apiJson<{ comment_id: number }>(post);

			const list = await api.get(base);
			expect(list.ok()).toBeTruthy();
			expect(await list.text()).toContain('note comment');

			await api.delete(`${base}/${comment.comment_id}`);
		} finally {
			await cleanup.case(api, caseId);
			await api.dispose();
		}
	});

	// ── Task comments ──────────────────────────────────────────────────────

	test('task: post → list → delete comment', async () => {
		const api = await adminApi();
		const caseId = await seed.case(api, { case_name: 'e2e task comment' });
		const taskId = await seed.task(api, caseId, { task_title: 'CommentTask' });

		try {
			const base = `/api/v2/tasks/${taskId}/comments`;

			const post = await api.post(base, { data: { comment_text: 'task comment' } });
			expect(post.ok(), await post.text()).toBeTruthy();
			const comment = await apiJson<{ comment_id: number }>(post);

			const list = await api.get(base);
			expect(list.ok()).toBeTruthy();
			expect(await list.text()).toContain('task comment');

			await api.delete(`${base}/${comment.comment_id}`);
		} finally {
			await cleanup.case(api, caseId);
			await api.dispose();
		}
	});

	// ── Evidence comments ──────────────────────────────────────────────────

	test('evidence: post → list → delete comment', async () => {
		const api = await adminApi();
		const caseId = await seed.case(api, { case_name: 'e2e evidence comment' });
		const evidenceId = await seed.evidence(api, caseId, { filename: 'comment.img' });

		try {
			const base = `/api/v2/evidences/${evidenceId}/comments`;

			const post = await api.post(base, { data: { comment_text: 'evidence note' } });
			expect(post.ok(), await post.text()).toBeTruthy();
			const comment = await apiJson<{ comment_id: number }>(post);

			const list = await api.get(base);
			expect(list.ok()).toBeTruthy();
			expect(await list.text()).toContain('evidence note');

			await api.delete(`${base}/${comment.comment_id}`);
		} finally {
			await cleanup.case(api, caseId);
			await api.dispose();
		}
	});
});

// ── Alert + cluster comments ────────────────────────────────────────────────

test.describe('Alert / cluster comments · API', () => {
	test('alert: post → list → delete comment', async () => {
		const api = await adminApi();
		const alertId = await seed.alert(api, { alert_title: 'e2e alert comment' });

		try {
			const base = `/api/v2/alerts/${alertId}/comments`;

			const post = await api.post(base, { data: { comment_text: 'alert note' } });
			expect(post.ok(), await post.text()).toBeTruthy();
			const comment = await apiJson<{ comment_id: number }>(post);

			const list = await api.get(base);
			expect(list.ok()).toBeTruthy();
			expect(await list.text()).toContain('alert note');

			await api.delete(`${base}/${comment.comment_id}`);
		} finally {
			await cleanup.alert(api, alertId);
			await api.dispose();
		}
	});
});
