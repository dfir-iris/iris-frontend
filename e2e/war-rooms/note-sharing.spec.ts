import { test, expect } from '../helpers/fixtures';
import { login } from '../helpers/auth';
import { adminApi, seed, cleanup, apiJson } from '../helpers/api';
import { expectToast } from '../helpers/ui';

// War-room note sharing: a live-mirror share lands in the attached
// case as a read-only note (banner + non-editable editor), and
// "Make a local copy" forks it into a normal, editable case note.

const rand = (p: string) => `${p}-${Math.random().toString(36).slice(2, 8)}`;

type CaseNoteRow = { note_id: number; note_title: string; mirror_source_note_id?: number | null };

test.describe('War room · note sharing', () => {
	test('mirrored note is read-only in the case; local copy is editable', async ({ page }) => {
		const api = await adminApi();
		const caseId = await seed.case(api, { case_name: rand('e2e share case') });
		const wrName = rand('share-wr');
		const wrId = await seed.warRoom(api, { name: wrName });
		const noteTitle = rand('shared-note');

		try {
			// The case needs a regular folder too, so the local copy has
			// somewhere unlocked to land.
			await seed.noteDirectory(api, caseId, rand('case-folder'));

			const attach = await api.post(`/api/v2/war-rooms/${wrId}/cases`, {
				data: { case_id: caseId }
			});
			expect(attach.ok(), await attach.text()).toBeTruthy();

			const folderRes = await api.post(`/api/v2/war-rooms/${wrId}/notes-folders`, {
				data: { name: rand('wr-folder') }
			});
			expect(folderRes.ok(), await folderRes.text()).toBeTruthy();
			const folder = await apiJson<{ id: number }>(folderRes);

			const noteRes = await api.post(`/api/v2/war-rooms/${wrId}/notes`, {
				data: { title: noteTitle, content: 'Shared from the war room', folder_id: folder.id }
			});
			expect(noteRes.ok(), await noteRes.text()).toBeTruthy();
			const wrNote = await apiJson<{ note_id: number }>(noteRes);

			const shareRes = await api.post(`/api/v2/war-rooms/${wrId}/note-shares`, {
				data: {
					note_id: wrNote.note_id,
					scope: 'cases',
					case_ids: [caseId],
					include_future: false,
					delivery: 'mirror'
				}
			});
			expect(shareRes.status(), await shareRes.text()).toBe(201);

			// Reconcile is synchronous today, but poll so a deferred
			// implementation does not make this flaky.
			let mirrorId = 0;
			await expect
				.poll(
					async () => {
						const res = await api.get(`/api/v2/cases/${caseId}/notes`);
						if (!res.ok()) return 0;
						const rows = await apiJson<CaseNoteRow[]>(res);
						const mirror = rows.find((n) => n.mirror_source_note_id === wrNote.note_id);
						mirrorId = mirror?.note_id ?? 0;
						return mirrorId;
					},
					{ timeout: 15_000 }
				)
				.toBeGreaterThan(0);

			await login(page);
			await page.goto(`/case/${caseId}/notes/${mirrorId}`);

			const banner = page.getByTestId('note-mirror-banner');
			await expect(banner).toBeVisible({ timeout: 15_000 });
			await expect(banner).toContainText('Mirrored from war room');
			await expect(banner).toContainText('read-only');
			await expect(banner.getByRole('link')).toHaveAttribute(
				'href',
				`/war-rooms/${wrId}/notes/${wrNote.note_id}`
			);

			// The editor renders a preview first; double-click enters edit
			// mode — except on a read-only mirror, where it must not.
			const body = page.locator('.markdown-editor-body').first();
			await expect(body).toContainText('Shared from the war room', { timeout: 15_000 });
			await body.getByRole('textbox').first().dblclick();
			await expect(page.locator('.ProseMirror').first()).toBeHidden();

			await banner.getByRole('button', { name: 'Make a local copy' }).click();

			await expect(page).not.toHaveURL(new RegExp(`/notes/${mirrorId}(?:$|[?#])`), {
				timeout: 15_000
			});
			await expect(page).toHaveURL(new RegExp(`/case/${caseId}/notes/\\d+`));
			await expect(page.getByText(`${noteTitle} (copy)`).first()).toBeVisible();
			await expect(page.getByTestId('note-mirror-banner')).toHaveCount(0);

			const copyBody = page.locator('.markdown-editor-body').first();
			await expect(copyBody).toContainText('Shared from the war room', { timeout: 15_000 });
			await copyBody.getByRole('textbox').first().dblclick();
			const copyEditor = page.locator('.ProseMirror').first();
			await expect(copyEditor).toBeVisible({ timeout: 15_000 });
			await expect(copyEditor).toHaveAttribute('contenteditable', 'true');
		} finally {
			await cleanup.warRoom(api, wrId);
			await cleanup.case(api, caseId);
			await api.dispose();
		}
	});

	test('share dialog creates a live mirror and flags the note as shared', async ({ page }) => {
		const api = await adminApi();
		const caseId = await seed.case(api, { case_name: rand('e2e share ui case') });
		const wrId = await seed.warRoom(api, { name: rand('share-ui-wr') });

		try {
			const attach = await api.post(`/api/v2/war-rooms/${wrId}/cases`, {
				data: { case_id: caseId }
			});
			expect(attach.ok(), await attach.text()).toBeTruthy();

			const noteRes = await api.post(`/api/v2/war-rooms/${wrId}/notes`, {
				data: { title: rand('ui-shared-note'), content: 'Hello cases' }
			});
			expect(noteRes.ok(), await noteRes.text()).toBeTruthy();
			const wrNote = await apiJson<{ note_id: number }>(noteRes);

			await login(page);
			await page.goto(`/war-rooms/${wrId}/notes/${wrNote.note_id}`);
			await expect(page.getByRole('main')).toBeVisible({ timeout: 10_000 });

			await page.getByRole('button', { name: 'Share with cases' }).first().click();
			const dialog = page.getByRole('dialog');
			await expect(dialog).toBeVisible();
			await expect(dialog.getByRole('radio', { name: /All attached cases/ })).toHaveAttribute(
				'aria-checked',
				'true'
			);
			await expect(dialog.getByRole('radio', { name: /Live mirror/ })).toHaveAttribute(
				'aria-checked',
				'true'
			);

			await dialog.getByRole('button', { name: 'Save sharing' }).click();
			await expectToast(page, /Shared with 1 case/);

			await expect(page.getByTestId('note-share-strip')).toBeVisible({ timeout: 10_000 });
			await expect(page.getByTestId('note-share-badge').first()).toBeVisible();

			const list = await api.get(`/api/v2/war-rooms/${wrId}/note-shares?note_id=${wrNote.note_id}`);
			expect(list.ok(), await list.text()).toBeTruthy();
			const shares = await apiJson<{ delivery: string; scope: string }[]>(list);
			expect(shares).toHaveLength(1);
			expect(shares[0]).toMatchObject({ delivery: 'mirror', scope: 'all' });
		} finally {
			await cleanup.warRoom(api, wrId);
			await cleanup.case(api, caseId);
			await api.dispose();
		}
	});
});
