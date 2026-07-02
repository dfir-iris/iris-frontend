/**
 * Smoke tests for the v2 Mail service — URL + body shape checks so
 * we catch a rename on either side.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../api.service', () => ({
	ApiService: {
		withQuery: vi.fn((url: string, params: Record<string, unknown>) => {
			const qs = new URLSearchParams();
			for (const [k, v] of Object.entries(params)) {
				if (v == null) continue;
				qs.append(k, String(v));
			}
			const q = qs.toString();
			return q ? `${url}?${q}` : url;
		}),
		get: vi.fn(),
		post: vi.fn(),
		put: vi.fn(),
		delete: vi.fn()
	}
}));

import { MailService } from '../mail.service';
import { ApiService } from '../api.service';

describe('MailService — rules', () => {
	beforeEach(() => vi.clearAllMocks());
	afterEach(() => vi.restoreAllMocks());

	it('listRules() calls /manage/mail/rules', async () => {
		(ApiService.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: true, status: 200, data: { data: [] }
		});
		await MailService.listRules();
		expect(ApiService.get).toHaveBeenCalledWith('/manage/mail/rules', {});
	});

	it('createRule() posts the rule body', async () => {
		(ApiService.post as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: true, status: 200, data: { id: 1 }
		});
		await MailService.createRule({
			name: 'r', priority: 100, action: 'create_alert'
		});
		expect(ApiService.post).toHaveBeenCalledWith(
			'/manage/mail/rules',
			{ name: 'r', priority: 100, action: 'create_alert' },
			{}
		);
	});

	it('updateRule() puts to /manage/mail/rules/<id>', async () => {
		(ApiService.put as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: true, status: 200, data: { id: 5 }
		});
		await MailService.updateRule(5, { enabled: false });
		expect(ApiService.put).toHaveBeenCalledWith(
			'/manage/mail/rules/5', { enabled: false }, {}
		);
	});

	it('deleteRule() deletes /manage/mail/rules/<id>', async () => {
		(ApiService.delete as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: true, status: 200, data: { deleted: 5 }
		});
		await MailService.deleteRule(5);
		expect(ApiService.delete).toHaveBeenCalledWith(
			'/manage/mail/rules/5', {}
		);
	});
});

describe('MailService — ingest log + poll', () => {
	beforeEach(() => vi.clearAllMocks());
	afterEach(() => vi.restoreAllMocks());

	it('listIngestLog() calls with a limit', async () => {
		(ApiService.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: true, status: 200, data: { data: [] }
		});
		await MailService.listIngestLog(50);
		expect(ApiService.get).toHaveBeenCalledWith(
			'/manage/mail/ingest-log?limit=50', {}
		);
	});

	it('pollNow() posts to /manage/mail/poll-now with an empty body', async () => {
		(ApiService.post as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: true, status: 200, data: { skipped: false, processed: 3 }
		});
		await MailService.pollNow();
		expect(ApiService.post).toHaveBeenCalledWith(
			'/manage/mail/poll-now', {}, {}
		);
	});
});
