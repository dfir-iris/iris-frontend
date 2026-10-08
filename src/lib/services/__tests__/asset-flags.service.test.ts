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
	AssetFlagsService,
	ASSET_FLAG_COLORS,
	assetFlagChipClass,
	assetFlagDotClass,
	sortAssetFlags,
	type AssetFlag
} from '../asset-flags.service';
import { ApiService } from '../api.service';
import { ASSET_FLAG_ICONS, getAssetFlagIcon } from '$lib/components/common/assets/asset-flag-icon';
import { CircleDot, HardDrive, Unplug } from 'lucide-svelte';

const mock = (method: keyof typeof ApiService) =>
	ApiService[method] as unknown as ReturnType<typeof vi.fn>;

const flag = (overrides: Partial<AssetFlag> = {}): AssetFlag => ({
	id: 1,
	name: 'Isolated',
	description: null,
	color: 'blue',
	icon: 'unplug',
	kind: 'status',
	sort_order: 0,
	requires_reason: false,
	requires_decision: false,
	...overrides
});

describe('AssetFlagsService', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('list()', () => {
		it('GETs the taxonomy with default options', async () => {
			const res = { ok: true, status: 200, data: [] };
			mock('get').mockResolvedValueOnce(res);
			const out = await AssetFlagsService.list();
			expect(ApiService.get).toHaveBeenCalledWith('/manage/asset-flags', {});
			expect(out).toBe(res);
		});

		it('forwards options', async () => {
			mock('get').mockResolvedValueOnce({ ok: true, status: 200, data: [] });
			const fetchFn = vi.fn() as unknown as typeof fetch;
			await AssetFlagsService.list({ fetch: fetchFn });
			expect(ApiService.get).toHaveBeenCalledWith('/manage/asset-flags', { fetch: fetchFn });
		});
	});

	describe('create()', () => {
		it('POSTs the body', async () => {
			mock('post').mockResolvedValueOnce({ ok: true, status: 201, data: flag() });
			const body = { name: 'Isolated', color: 'blue', kind: 'status' as const };
			await AssetFlagsService.create(body);
			expect(ApiService.post).toHaveBeenCalledWith('/manage/asset-flags', body, {});
		});
	});

	describe('update()', () => {
		it('PUTs to the flag id', async () => {
			mock('put').mockResolvedValueOnce({ ok: true, status: 200, data: flag() });
			await AssetFlagsService.update(5, { name: 'Renamed' });
			expect(ApiService.put).toHaveBeenCalledWith('/manage/asset-flags/5', { name: 'Renamed' }, {});
		});
	});

	describe('remove()', () => {
		it('DELETEs the flag id', async () => {
			mock('delete').mockResolvedValueOnce({ ok: true, status: 204, data: '' });
			await AssetFlagsService.remove(9);
			expect(ApiService.delete).toHaveBeenCalledWith('/manage/asset-flags/9', {});
		});
	});

	describe('reorder()', () => {
		it('POSTs the ordered ids', async () => {
			mock('post').mockResolvedValueOnce({ ok: true, status: 200, data: [] });
			await AssetFlagsService.reorder([3, 1, 2]);
			expect(ApiService.post).toHaveBeenCalledWith(
				'/manage/asset-flags/reorder',
				{ ids: [3, 1, 2] },
				{}
			);
		});
	});

	describe('applyPreset()', () => {
		it.each(['incident', 'vulnerability'] as const)(
			'POSTs the %s preset with an empty body',
			async (preset) => {
				mock('post').mockResolvedValueOnce({ ok: true, status: 200, data: [] });
				await AssetFlagsService.applyPreset(preset);
				expect(ApiService.post).toHaveBeenCalledWith(
					`/manage/asset-flags/presets/${preset}`,
					{},
					{}
				);
			}
		);
	});

	describe('setAssetFlag()', () => {
		it('PUTs the flag of a case asset with its reason, decision and date', async () => {
			const res = { ok: true, status: 200, data: { asset_id: 4, flags: [] } };
			mock('put').mockResolvedValueOnce(res);
			const body = { reason: 'contained', decision_id: 7, date: '2026-01-02T03:04:05Z' };
			const out = await AssetFlagsService.setAssetFlag(12, 4, 2, body);
			expect(ApiService.put).toHaveBeenCalledWith('/cases/12/assets/4/flags/2', body, {});
			expect(out).toBe(res);
		});

		it('defaults to an empty body', async () => {
			mock('put').mockResolvedValueOnce({ ok: true, status: 200, data: {} });
			await AssetFlagsService.setAssetFlag(12, 4, 2);
			expect(ApiService.put).toHaveBeenCalledWith('/cases/12/assets/4/flags/2', {}, {});
		});
	});

	describe('clearAssetFlag()', () => {
		it('DELETEs the flag of a case asset, with the reason as body', async () => {
			mock('delete').mockResolvedValueOnce({ ok: true, status: 200, data: {} });
			await AssetFlagsService.clearAssetFlag(12, 4, 2, { reason: 'reconnected' });
			expect(ApiService.delete).toHaveBeenCalledWith(
				'/cases/12/assets/4/flags/2',
				{},
				{
					reason: 'reconnected'
				}
			);
		});
	});

	describe('history()', () => {
		it('GETs the flag history of a case asset', async () => {
			mock('get').mockResolvedValueOnce({ ok: true, status: 200, data: [] });
			await AssetFlagsService.history(12, 4);
			expect(ApiService.get).toHaveBeenCalledWith('/cases/12/assets/4/flag-history', {});
		});
	});
});

describe('assetFlagChipClass()', () => {
	it('returns a class for every palette colour', () => {
		for (const color of ASSET_FLAG_COLORS) {
			expect(assetFlagChipClass(color)).toContain(`bg-${color}-500/10`);
		}
	});

	it.each([undefined, null, '', 'not-a-colour', 'constructor', 'toString'])(
		'falls back to slate for %s',
		(color) => {
			expect(assetFlagChipClass(color)).toBe(assetFlagChipClass('slate'));
		}
	);
});

describe('assetFlagDotClass()', () => {
	it('maps a known colour', () => {
		expect(assetFlagDotClass('emerald')).toBe('bg-emerald-500');
	});

	it('falls back to slate', () => {
		expect(assetFlagDotClass('nope')).toBe('bg-slate-500');
		expect(assetFlagDotClass(null)).toBe('bg-slate-500');
	});
});

describe('sortAssetFlags()', () => {
	it('orders by sort_order then id without mutating the input', () => {
		const input = [
			flag({ id: 3, sort_order: 1 }),
			flag({ id: 2, sort_order: 0 }),
			flag({ id: 1, sort_order: 1 })
		];
		const snapshot = input.map((f) => f.id);
		expect(sortAssetFlags(input).map((f) => f.id)).toEqual([2, 1, 3]);
		expect(input.map((f) => f.id)).toEqual(snapshot);
	});

	it('handles an empty list', () => {
		expect(sortAssetFlags([])).toEqual([]);
	});
});

describe('getAssetFlagIcon()', () => {
	it('resolves an allow-listed name', () => {
		expect(getAssetFlagIcon('unplug')).toBe(Unplug);
		expect(getAssetFlagIcon('hard-drive')).toBe(HardDrive);
		expect(ASSET_FLAG_ICONS['circle-dot']).toBe(CircleDot);
	});

	it.each([undefined, null, '', 'unknown-icon', 'constructor', '__proto__'])(
		'falls back to CircleDot for %s',
		(name) => {
			expect(getAssetFlagIcon(name)).toBe(CircleDot);
		}
	);
});
