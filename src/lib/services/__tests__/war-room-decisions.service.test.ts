import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../api.service', () => ({
	ApiService: {
		withQuery: vi.fn(),
		get: vi.fn(),
		post: vi.fn(),
		put: vi.fn(),
		patch: vi.fn(),
		delete: vi.fn()
	}
}));

import {
	WarRoomDecisionsService,
	buildDecisionsListPath,
	formatCoarseDuration,
	formatDecisionTarget,
	isDecisionOpen
} from '../war-room-decisions.service';
import { ApiService } from '../api.service';

const mock = (method: keyof typeof ApiService) =>
	ApiService[method] as unknown as ReturnType<typeof vi.fn>;

describe('WarRoomDecisionsService', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('buildDecisionsListPath()', () => {
		it('returns the bare path without params', () => {
			expect(buildDecisionsListPath(4)).toBe('/war-rooms/4/decisions');
		});

		it('adds status, trimmed q and case_id', () => {
			expect(buildDecisionsListPath(4, { status: 'proposed', q: '  lyon ', case_id: 12 })).toBe(
				'/war-rooms/4/decisions?status=proposed&q=lyon&case_id=12'
			);
		});

		it('drops a blank q', () => {
			expect(buildDecisionsListPath(4, { q: '   ' })).toBe('/war-rooms/4/decisions');
		});

		it('encodes the search term', () => {
			expect(buildDecisionsListPath(4, { q: 'a&b c' })).toBe('/war-rooms/4/decisions?q=a%26b+c');
		});
	});

	describe('list()', () => {
		it('GETs the register with default options', async () => {
			const res = { ok: true, status: 200, data: [] };
			mock('get').mockResolvedValueOnce(res);
			const out = await WarRoomDecisionsService.list(7);
			expect(ApiService.get).toHaveBeenCalledWith('/war-rooms/7/decisions', {});
			expect(out).toBe(res);
		});

		it('forwards filters and options', async () => {
			mock('get').mockResolvedValueOnce({ ok: true, data: [] });
			const opts = { skipTokenRefresh: true };
			await WarRoomDecisionsService.list(7, { status: 'approved', case_id: 3 }, opts);
			expect(ApiService.get).toHaveBeenCalledWith(
				'/war-rooms/7/decisions?status=approved&case_id=3',
				opts
			);
		});
	});

	describe('get()', () => {
		it('GETs one decision', async () => {
			mock('get').mockResolvedValueOnce({ ok: true, data: { decision_id: 9 } });
			await WarRoomDecisionsService.get(7, 9);
			expect(ApiService.get).toHaveBeenCalledWith('/war-rooms/7/decisions/9', {});
		});
	});

	describe('create()', () => {
		it('POSTs the body', async () => {
			mock('post').mockResolvedValueOnce({ ok: true, status: 201, data: { decision_id: 1 } });
			const body = {
				title: 'Keep site offline',
				target_at: '2026-10-06T12:00:00',
				approver_ids: [2, 3],
				case_ids: [5]
			};
			await WarRoomDecisionsService.create(7, body);
			expect(ApiService.post).toHaveBeenCalledWith('/war-rooms/7/decisions', body, {});
		});

		it('forwards options', async () => {
			mock('post').mockResolvedValueOnce({ ok: true, data: {} });
			const opts = { headers: { 'X-Test': '1' } };
			await WarRoomDecisionsService.create(7, { title: 't' }, opts);
			const [, , forwarded] = mock('post').mock.calls[0];
			expect(forwarded).toBe(opts);
		});
	});

	describe('update()', () => {
		it('PATCHes the decision', async () => {
			mock('patch').mockResolvedValueOnce({ ok: true, data: {} });
			await WarRoomDecisionsService.update(7, 9, { status: 'rejected', target_at: null });
			expect(ApiService.patch).toHaveBeenCalledWith(
				'/war-rooms/7/decisions/9',
				{ status: 'rejected', target_at: null },
				{}
			);
		});
	});

	describe('vote()', () => {
		it('POSTs the verdict', async () => {
			mock('post').mockResolvedValueOnce({ ok: true, data: {} });
			await WarRoomDecisionsService.vote(7, 9, { verdict: 'approved', comment: 'ok' });
			expect(ApiService.post).toHaveBeenCalledWith(
				'/war-rooms/7/decisions/9/vote',
				{ verdict: 'approved', comment: 'ok' },
				{}
			);
		});
	});

	describe('markImplemented() / reopen()', () => {
		it('POSTs /implemented with an empty body', async () => {
			mock('post').mockResolvedValueOnce({ ok: true, data: {} });
			await WarRoomDecisionsService.markImplemented(7, 9);
			expect(ApiService.post).toHaveBeenCalledWith('/war-rooms/7/decisions/9/implemented', {}, {});
		});

		it('POSTs /reopen with an empty body', async () => {
			mock('post').mockResolvedValueOnce({ ok: true, data: {} });
			await WarRoomDecisionsService.reopen(7, 9);
			expect(ApiService.post).toHaveBeenCalledWith('/war-rooms/7/decisions/9/reopen', {}, {});
		});
	});

	describe('remove()', () => {
		it('DELETEs the decision', async () => {
			mock('delete').mockResolvedValueOnce({ ok: true, status: 204, data: '' });
			await WarRoomDecisionsService.remove(7, 9);
			expect(ApiService.delete).toHaveBeenCalledWith('/war-rooms/7/decisions/9', {});
		});
	});

	describe('chatCandidates()', () => {
		it('GETs /chat-candidates', async () => {
			mock('get').mockResolvedValueOnce({ ok: true, data: [] });
			await WarRoomDecisionsService.chatCandidates(7);
			expect(ApiService.get).toHaveBeenCalledWith('/war-rooms/7/decisions/chat-candidates', {});
		});
	});

	describe('assetCandidates()', () => {
		it('GETs the scope assets without a query', async () => {
			mock('get').mockResolvedValueOnce({ ok: true, data: { data: [] } });
			await WarRoomDecisionsService.assetCandidates(7);
			expect(ApiService.get).toHaveBeenCalledWith('/war-rooms/7/scope/assets', {});
		});

		it('passes an encoded q', async () => {
			mock('get').mockResolvedValueOnce({ ok: true, data: { data: [] } });
			await WarRoomDecisionsService.assetCandidates(7, ' dc 01 ');
			expect(ApiService.get).toHaveBeenCalledWith('/war-rooms/7/scope/assets?q=dc+01', {});
		});
	});
});

describe('decision helpers', () => {
	const now = Date.UTC(2026, 9, 6, 12, 0, 0);

	it('formatCoarseDuration picks a unit', () => {
		expect(formatCoarseDuration(10_000)).toBe('1 min');
		expect(formatCoarseDuration(45 * 60_000)).toBe('45 min');
		expect(formatCoarseDuration(3 * 3_600_000)).toBe('3 h');
		expect(formatCoarseDuration(-2 * 86_400_000)).toBe('2 d');
	});

	it('formatDecisionTarget reads naive values as UTC', () => {
		expect(formatDecisionTarget('2026-10-06T15:00:00', now)).toBe('in 3 h');
		expect(formatDecisionTarget('2026-10-06T10:00:00', now)).toBe('overdue by 2 h');
	});

	it('formatDecisionTarget is empty without a target', () => {
		expect(formatDecisionTarget(null, now)).toBe('');
		expect(formatDecisionTarget('not a date', now)).toBe('');
	});

	it('isDecisionOpen', () => {
		expect(isDecisionOpen({ status: 'proposed', implemented_at: null })).toBe(true);
		expect(isDecisionOpen({ status: 'approved', implemented_at: null })).toBe(true);
		expect(isDecisionOpen({ status: 'approved', implemented_at: '2026-10-06T10:00:00' })).toBe(
			false
		);
		expect(isDecisionOpen({ status: 'rejected', implemented_at: null })).toBe(false);
		expect(isDecisionOpen({ status: 'superseded', implemented_at: null })).toBe(false);
	});
});
