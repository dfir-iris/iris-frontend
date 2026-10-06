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
	AssetStagesService,
	ASSET_STAGE_COLORS,
	assetStageChipClass,
	assetStageDotClass,
	sortAssetStages,
	type AssetStage
} from '../asset-stages.service';
import { ApiService } from '../api.service';
import {
	ASSET_STAGE_ICONS,
	getAssetStageIcon
} from '$lib/components/common/assets/asset-stage-icon';
import { CircleDot, Unplug } from 'lucide-svelte';

const mock = (method: keyof typeof ApiService) =>
	ApiService[method] as unknown as ReturnType<typeof vi.fn>;

const stage = (overrides: Partial<AssetStage> = {}): AssetStage => ({
	id: 1,
	name: 'Identified',
	description: null,
	color: 'sky',
	icon: 'scan-search',
	kind: 'progress',
	sort_order: 0,
	requires_reason: false,
	requires_decision: false,
	is_optional: false,
	...overrides
});

describe('AssetStagesService', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('list()', () => {
		it('GETs the taxonomy with default options', async () => {
			const res = { ok: true, status: 200, data: [] };
			mock('get').mockResolvedValueOnce(res);
			const out = await AssetStagesService.list();
			expect(ApiService.get).toHaveBeenCalledWith('/manage/asset-stages', {});
			expect(out).toBe(res);
		});

		it('forwards options', async () => {
			mock('get').mockResolvedValueOnce({ ok: true, status: 200, data: [] });
			const fetchFn = vi.fn() as unknown as typeof fetch;
			await AssetStagesService.list({ fetch: fetchFn });
			expect(ApiService.get).toHaveBeenCalledWith('/manage/asset-stages', { fetch: fetchFn });
		});
	});

	describe('create()', () => {
		it('POSTs the body', async () => {
			mock('post').mockResolvedValueOnce({ ok: true, status: 201, data: stage() });
			const body = { name: 'Isolated', color: 'orange', kind: 'progress' as const };
			await AssetStagesService.create(body);
			expect(ApiService.post).toHaveBeenCalledWith('/manage/asset-stages', body, {});
		});
	});

	describe('update()', () => {
		it('PUTs to the stage id', async () => {
			mock('put').mockResolvedValueOnce({ ok: true, status: 200, data: stage() });
			await AssetStagesService.update(5, { name: 'Renamed' });
			expect(ApiService.put).toHaveBeenCalledWith(
				'/manage/asset-stages/5',
				{ name: 'Renamed' },
				{}
			);
		});
	});

	describe('remove()', () => {
		it('DELETEs the stage id', async () => {
			mock('delete').mockResolvedValueOnce({ ok: true, status: 204, data: '' });
			await AssetStagesService.remove(9);
			expect(ApiService.delete).toHaveBeenCalledWith('/manage/asset-stages/9', {});
		});
	});

	describe('reorder()', () => {
		it('POSTs the ordered ids', async () => {
			mock('post').mockResolvedValueOnce({ ok: true, status: 200, data: [] });
			await AssetStagesService.reorder([3, 1, 2]);
			expect(ApiService.post).toHaveBeenCalledWith(
				'/manage/asset-stages/reorder',
				{ ids: [3, 1, 2] },
				{}
			);
		});
	});

	describe('applyPreset()', () => {
		it.each(['incident', 'compromise-simple'] as const)(
			'POSTs the %s preset with an empty body',
			async (preset) => {
				mock('post').mockResolvedValueOnce({ ok: true, status: 200, data: [] });
				await AssetStagesService.applyPreset(preset);
				expect(ApiService.post).toHaveBeenCalledWith(
					`/manage/asset-stages/presets/${preset}`,
					{},
					{}
				);
			}
		);
	});

	describe('setAssetStage()', () => {
		it('PUTs the stage of a case asset', async () => {
			const res = { ok: true, status: 200, data: { asset_id: 4, stage_id: 2 } };
			mock('put').mockResolvedValueOnce(res);
			const body = { stage_id: 2, reason: 'contained', decision_id: 7 };
			const out = await AssetStagesService.setAssetStage(12, 4, body);
			expect(ApiService.put).toHaveBeenCalledWith('/cases/12/assets/4/stage', body, {});
			expect(out).toBe(res);
		});

		it('sends a null stage to clear it', async () => {
			mock('put').mockResolvedValueOnce({ ok: true, status: 200, data: {} });
			await AssetStagesService.setAssetStage(12, 4, { stage_id: null });
			expect(ApiService.put).toHaveBeenCalledWith(
				'/cases/12/assets/4/stage',
				{ stage_id: null },
				{}
			);
		});
	});

	describe('history()', () => {
		it('GETs the stage history of a case asset', async () => {
			mock('get').mockResolvedValueOnce({ ok: true, status: 200, data: [] });
			await AssetStagesService.history(12, 4);
			expect(ApiService.get).toHaveBeenCalledWith('/cases/12/assets/4/stage-history', {});
		});
	});
});

describe('assetStageChipClass()', () => {
	it('returns a class for every palette colour', () => {
		for (const color of ASSET_STAGE_COLORS) {
			expect(assetStageChipClass(color)).toContain(`bg-${color}-500/10`);
		}
	});

	it.each([undefined, null, '', 'not-a-colour', 'constructor', 'toString'])(
		'falls back to slate for %s',
		(color) => {
			expect(assetStageChipClass(color)).toBe(assetStageChipClass('slate'));
		}
	);
});

describe('assetStageDotClass()', () => {
	it('maps a known colour', () => {
		expect(assetStageDotClass('emerald')).toBe('bg-emerald-500');
	});

	it('falls back to slate', () => {
		expect(assetStageDotClass('nope')).toBe('bg-slate-500');
		expect(assetStageDotClass(null)).toBe('bg-slate-500');
	});
});

describe('sortAssetStages()', () => {
	it('orders by sort_order then id without mutating the input', () => {
		const input = [
			stage({ id: 3, sort_order: 1 }),
			stage({ id: 2, sort_order: 0 }),
			stage({ id: 1, sort_order: 1 })
		];
		const snapshot = input.map((s) => s.id);
		expect(sortAssetStages(input).map((s) => s.id)).toEqual([2, 1, 3]);
		expect(input.map((s) => s.id)).toEqual(snapshot);
	});

	it('handles an empty list', () => {
		expect(sortAssetStages([])).toEqual([]);
	});
});

describe('getAssetStageIcon()', () => {
	it('resolves an allow-listed name', () => {
		expect(getAssetStageIcon('unplug')).toBe(Unplug);
		expect(ASSET_STAGE_ICONS['circle-dot']).toBe(CircleDot);
	});

	it.each([undefined, null, '', 'unknown-icon', 'constructor', '__proto__'])(
		'falls back to CircleDot for %s',
		(name) => {
			expect(getAssetStageIcon(name)).toBe(CircleDot);
		}
	);
});
