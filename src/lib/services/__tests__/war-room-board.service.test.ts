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
	WarRoomBoardService,
	boardFlagCounts,
	boardVulnerabilityHref,
	boardVulnerabilityHrefFor,
	boardVulnerabilityKpis,
	type WarRoomBoardKpis
} from '../war-room-board.service';
import type { AssetFlag } from '../asset-flags.service';
import { ApiService } from '../api.service';

const mock = (method: keyof typeof ApiService) =>
	ApiService[method] as unknown as ReturnType<typeof vi.fn>;

const flag = (id: number, name: string, color: string, sort_order: number): AssetFlag => ({
	id,
	name,
	description: null,
	color,
	icon: 'unplug',
	kind: 'status',
	sort_order,
	requires_reason: false,
	requires_decision: false
});

describe('WarRoomBoardService', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('get()', () => {
		it('GETs /war-rooms/:id/board with default options', async () => {
			const res = { ok: true, status: 200, data: { kpis: {} } };
			mock('get').mockResolvedValueOnce(res);
			const out = await WarRoomBoardService.get(3);
			expect(ApiService.get).toHaveBeenCalledOnce();
			expect(ApiService.get).toHaveBeenCalledWith('/war-rooms/3/board', {});
			expect(out).toBe(res);
		});

		it('forwards options', async () => {
			mock('get').mockResolvedValueOnce({ ok: true, data: {} });
			const opts = { skipTokenRefresh: true };
			await WarRoomBoardService.get(3, opts);
			expect(ApiService.get).toHaveBeenCalledWith('/war-rooms/3/board', opts);
		});
	});
});

describe('boardFlagCounts()', () => {
	const flags = [flag(1, 'Isolated', 'blue', 0), flag(2, 'Patched', 'violet', 1)];

	it('returns nothing for an empty or missing map, or without assets', () => {
		expect(boardFlagCounts(undefined, flags, 5)).toEqual([]);
		expect(boardFlagCounts({}, flags, 5)).toEqual([]);
		expect(boardFlagCounts({ '1': 0, none: 0 }, flags, 5)).toEqual([]);
		expect(boardFlagCounts({ '1': 2 }, flags, 0)).toEqual([]);
	});

	it('orders rows by flag, then unknown, then unflagged', () => {
		const out = boardFlagCounts({ none: 2, '2': 1, '1': 3, '99': 2 }, flags, 8);
		expect(out.map((s) => s.key)).toEqual(['1', '2', 'other', 'none']);
		expect(out.map((s) => s.count)).toEqual([3, 1, 2, 2]);
		expect(out[0]).toMatchObject({ label: 'Isolated', color: 'blue', icon: 'unplug' });
		expect(out[3]).toMatchObject({ label: 'No flag', color: null });
	});

	it('gives each flag its share of the assets, overlaps included', () => {
		// 4 assets: 3 isolated, 2 patched (some carry both).
		const out = boardFlagCounts({ '1': 3, '2': 2 }, flags, 4);
		expect(out.map((s) => s.pct)).toEqual([75, 50]);
	});
});

describe('boardVulnerabilityHref()', () => {
	it('links vulnerability items to the case asset tab, focused on the finding', () => {
		expect(
			boardVulnerabilityHref({
				type: 'vulnerability_exploited_open',
				case_id: 4,
				asset_id: 7,
				finding_id: 9
			})
		).toBe('/case/4/assets/7?tab=vulnerabilities&finding=9');
		expect(boardVulnerabilityHref({ type: 'vulnerability_overdue', case_id: 4, asset_id: 7 })).toBe(
			'/case/4/assets/7?tab=vulnerabilities'
		);
	});

	it('falls back to the case assets list without an asset', () => {
		expect(boardVulnerabilityHref({ type: 'vulnerability_overdue', case_id: 4 })).toBe(
			'/case/4/assets'
		);
	});

	it('ignores other item types and items without a case', () => {
		expect(boardVulnerabilityHref({ type: 'compromised_unflagged', case_id: 4 })).toBeNull();
		expect(boardVulnerabilityHref({ type: 'vulnerability_overdue', case_id: null })).toBeNull();
	});
});

describe('boardVulnerabilityHrefFor()', () => {
	const item = { type: 'vulnerability_overdue', case_id: 4, asset_id: 7 };
	it('links only for readers', () => {
		expect(boardVulnerabilityHrefFor(item, true)).toBe('/case/4/assets/7?tab=vulnerabilities');
		expect(boardVulnerabilityHrefFor(item, false)).toBeNull();
	});
});

describe('boardVulnerabilityKpis()', () => {
	const base = {
		cases: 1,
		cases_accessible: 1,
		assets: 3,
		compromised: 0,
		flagged: 0,
		done: 0,
		exceptions: 0,
		unflagged: 0,
		decisions_open: 0,
		decisions_overdue: 0,
		decisions_due_24h: 0,
		tasks_open: 0
	} as WarRoomBoardKpis;

	it('returns null when the fields are omitted', () => {
		expect(boardVulnerabilityKpis(base, true)).toBeNull();
		expect(boardVulnerabilityKpis(null, true)).toBeNull();
	});

	it('returns null without read even when the fields are present', () => {
		expect(boardVulnerabilityKpis({ ...base, vulnerabilities_open: 2 }, false)).toBeNull();
	});

	it('maps the fields, defaulting missing siblings to 0', () => {
		expect(
			boardVulnerabilityKpis(
				{ ...base, vulnerabilities_open: 2, vulnerabilities_kev_open: 1, vulnerable_assets: 2 },
				true
			)
		).toEqual({ open: 2, exploitedOpen: 0, overdue: 0, kevOpen: 1, vulnerableAssets: 2 });
	});
});
