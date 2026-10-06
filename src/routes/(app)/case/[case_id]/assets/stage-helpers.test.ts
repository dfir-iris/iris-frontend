import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('$lib/services/asset-stages.service', () => ({
	AssetStagesService: { setAssetStage: vi.fn() }
}));

import { AssetStagesService, type AssetStage } from '$lib/services/asset-stages.service';
import type { CaseAssetsContext } from '$lib/contexts/case-assets.context.svelte';
import {
	STAGE_REASON_MAX,
	applyAssetStage,
	buildStageUpdate,
	stageNeedsInput,
	stagePathStates,
	validateStageInput
} from './stage-helpers';

const stage = (overrides: Partial<AssetStage> = {}): AssetStage => ({
	id: 2,
	name: 'Isolated',
	description: null,
	color: 'orange',
	icon: 'unplug',
	kind: 'progress',
	sort_order: 1,
	requires_reason: false,
	requires_decision: false,
	is_optional: false,
	...overrides
});

const setStage = AssetStagesService.setAssetStage as unknown as ReturnType<typeof vi.fn>;

describe('stageNeedsInput()', () => {
	it('is false for null and plain stages', () => {
		expect(stageNeedsInput(null)).toBe(false);
		expect(stageNeedsInput(stage())).toBe(false);
	});

	it('is true when a reason or decision is required', () => {
		expect(stageNeedsInput(stage({ requires_reason: true }))).toBe(true);
		expect(stageNeedsInput(stage({ requires_decision: true }))).toBe(true);
	});
});

describe('validateStageInput()', () => {
	it('accepts an empty form for a plain stage', () => {
		expect(validateStageInput(stage(), '', '')).toBeNull();
	});

	it('requires a non-blank reason when asked', () => {
		const s = stage({ requires_reason: true });
		expect(validateStageInput(s, '   ', '')).toMatch(/requires a reason/);
		expect(validateStageInput(s, 'patch window', '')).toBeNull();
	});

	it('caps the reason length', () => {
		expect(validateStageInput(stage(), 'x'.repeat(STAGE_REASON_MAX + 1), '')).toMatch(/at most/);
	});

	it('requires a positive integer decision id', () => {
		expect(validateStageInput(stage(), '', 'abc')).toMatch(/positive number/);
		expect(validateStageInput(stage(), '', '0')).toMatch(/positive number/);
		expect(validateStageInput(stage(), '', '12')).toBeNull();
		expect(validateStageInput(stage({ requires_decision: true }), '', '')).toMatch(
			/requires a decision/
		);
	});
});

describe('stagePathStates()', () => {
	// Identified → Isolated (optional) → Patched → Restored
	const path = [
		{ id: 1, is_optional: false },
		{ id: 2, is_optional: true },
		{ id: 3, is_optional: false },
		{ id: 4, is_optional: false }
	];

	it('is all to do without a current path stage', () => {
		expect(stagePathStates(path, null, [])).toEqual(['todo', 'todo', 'todo', 'todo']);
		expect(stagePathStates(path, 99, [])).toEqual(['todo', 'todo', 'todo', 'todo']);
	});

	it('marks an optional stage never entered as skipped', () => {
		expect(stagePathStates(path, 3, [1, 3])).toEqual(['reached', 'skipped', 'reached', 'todo']);
	});

	it('marks an optional stage the asset went through as reached', () => {
		expect(stagePathStates(path, 3, [1, 2, 3])).toEqual(['reached', 'reached', 'reached', 'todo']);
	});

	it('never skips a required stage, nor the current one', () => {
		expect(stagePathStates(path, 4, [4])).toEqual(['reached', 'skipped', 'reached', 'reached']);
		expect(stagePathStates(path, 2, [])).toEqual(['reached', 'reached', 'todo', 'todo']);
	});
});

describe('buildStageUpdate()', () => {
	it('clears with a bare null', () => {
		expect(buildStageUpdate(null, 'ignored', '3')).toEqual({ stage_id: null });
	});

	it('trims and omits empty fields', () => {
		expect(buildStageUpdate(stage(), '  ', '')).toEqual({ stage_id: 2 });
		expect(buildStageUpdate(stage(), ' why ', ' 7 ')).toEqual({
			stage_id: 2,
			reason: 'why',
			decision_id: 7
		});
	});
});

describe('applyAssetStage()', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('writes successes back to the store and collects failures', async () => {
		setStage
			.mockResolvedValueOnce({ ok: true, status: 200, data: { asset_id: 1, stage_id: 2 } })
			.mockResolvedValueOnce({ ok: false, status: 400, data: { message: 'needs a reason' } });
		const caseAssets = { byId: {} } as unknown as CaseAssetsContext;

		const result = await applyAssetStage(caseAssets, 9, [1, 2], { stage_id: 2 });

		expect(setStage).toHaveBeenCalledWith(9, 1, { stage_id: 2 });
		expect(setStage).toHaveBeenCalledWith(9, 2, { stage_id: 2 });
		expect(result.updated).toBe(1);
		expect(result.failed).toEqual([{ assetId: 2, message: 'needs a reason' }]);
		expect(caseAssets.byId[1]).toEqual({ asset_id: 1, stage_id: 2 });
		expect(caseAssets.byId[2]).toBeUndefined();
	});

	it('reports a thrown request', async () => {
		setStage.mockRejectedValueOnce(new Error('network down'));
		const caseAssets = { byId: {} } as unknown as CaseAssetsContext;
		const result = await applyAssetStage(caseAssets, 9, [1], { stage_id: null });
		expect(result).toEqual({ updated: 0, failed: [{ assetId: 1, message: 'network down' }] });
	});
});
