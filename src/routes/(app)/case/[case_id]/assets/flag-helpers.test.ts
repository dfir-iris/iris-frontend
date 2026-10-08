import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('$lib/services/asset-flags.service', () => ({
	AssetFlagsService: { setAssetFlag: vi.fn(), clearAssetFlag: vi.fn() }
}));

import { AssetFlagsService, type AssetFlag } from '$lib/services/asset-flags.service';
import type { CaseAssetsContext } from '$lib/contexts/case-assets.context.svelte';
import {
	FLAG_REASON_MAX,
	applyAssetFlag,
	buildFlagChange,
	flagNeedsInput,
	validateFlagInput
} from './flag-helpers';

const flag = (overrides: Partial<AssetFlag> = {}): AssetFlag => ({
	id: 2,
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

const setFlag = AssetFlagsService.setAssetFlag as unknown as ReturnType<typeof vi.fn>;
const clearFlag = AssetFlagsService.clearAssetFlag as unknown as ReturnType<typeof vi.fn>;

describe('flagNeedsInput()', () => {
	it('is false for null and plain flags', () => {
		expect(flagNeedsInput(null)).toBe(false);
		expect(flagNeedsInput(flag())).toBe(false);
	});

	it('is true when a reason or decision is required', () => {
		expect(flagNeedsInput(flag({ requires_reason: true }))).toBe(true);
		expect(flagNeedsInput(flag({ requires_decision: true }))).toBe(true);
	});
});

describe('validateFlagInput()', () => {
	it('accepts an empty form for a plain flag', () => {
		expect(validateFlagInput(flag(), '', '', '')).toBeNull();
	});

	it('requires a non-blank reason when asked', () => {
		const f = flag({ requires_reason: true });
		expect(validateFlagInput(f, '   ', '', '')).toMatch(/requires a reason/);
		expect(validateFlagInput(f, 'vendor EOL', '', '')).toBeNull();
	});

	it('caps the reason length', () => {
		expect(validateFlagInput(flag(), 'x'.repeat(FLAG_REASON_MAX + 1), '', '')).toMatch(/at most/);
	});

	it('requires a positive integer decision id', () => {
		expect(validateFlagInput(flag(), '', 'abc', '')).toMatch(/positive number/);
		expect(validateFlagInput(flag(), '', '0', '')).toMatch(/positive number/);
		expect(validateFlagInput(flag(), '', '12', '')).toBeNull();
		expect(validateFlagInput(flag({ requires_decision: true }), '', '', '')).toMatch(
			/requires a decision/
		);
	});

	it('rejects an unparsable date', () => {
		expect(validateFlagInput(flag(), '', '', 'not a date')).toMatch(/Date/);
		expect(validateFlagInput(flag(), '', '', '2026-10-08T14:30')).toBeNull();
	});

	it('never requires a reason nor a decision to remove a flag', () => {
		const f = flag({ requires_reason: true, requires_decision: true });
		expect(validateFlagInput(f, '', '', '', 'clear')).toBeNull();
	});
});

describe('buildFlagChange()', () => {
	it('trims and omits empty fields', () => {
		expect(buildFlagChange('  ', '', '')).toEqual({});
		expect(buildFlagChange(' why ', ' 7 ', '')).toEqual({ reason: 'why', decision_id: 7 });
	});

	it('sends the date as UTC ISO', () => {
		const local = '2026-10-08T14:30';
		expect(buildFlagChange('', '', local)).toEqual({ date: new Date(local).toISOString() });
	});

	it('drops the decision when removing', () => {
		expect(buildFlagChange('back online', '7', '', 'clear')).toEqual({ reason: 'back online' });
	});
});

describe('applyAssetFlag()', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('sets the flag, writes successes back to the store and collects failures', async () => {
		setFlag
			.mockResolvedValueOnce({ ok: true, status: 200, data: { asset_id: 1, flags: [] } })
			.mockResolvedValueOnce({ ok: false, status: 400, data: { message: 'needs a reason' } });
		const caseAssets = { byId: {} } as unknown as CaseAssetsContext;

		const result = await applyAssetFlag(caseAssets, 9, [1, 2], 4, 'set', { reason: 'why' });

		expect(setFlag).toHaveBeenCalledWith(9, 1, 4, { reason: 'why' });
		expect(setFlag).toHaveBeenCalledWith(9, 2, 4, { reason: 'why' });
		expect(result.updated).toBe(1);
		expect(result.failed).toEqual([{ assetId: 2, message: 'needs a reason' }]);
		expect(caseAssets.byId[1]).toEqual({ asset_id: 1, flags: [] });
		expect(caseAssets.byId[2]).toBeUndefined();
	});

	it('removes the flag without a decision', async () => {
		// ApiService hands DELETE responses back with an empty body.
		clearFlag.mockResolvedValueOnce({ ok: true, status: 200, data: '' });
		const caseAssets = {
			byId: { 1: { asset_id: 1, flags: [{ flag_id: 4 }, { flag_id: 5 }] } }
		} as unknown as CaseAssetsContext;

		const result = await applyAssetFlag(caseAssets, 9, [1], 4, 'clear', {
			reason: 'reconnected',
			decision_id: 3
		});

		expect(clearFlag).toHaveBeenCalledWith(9, 1, 4, { reason: 'reconnected' });
		expect(setFlag).not.toHaveBeenCalled();
		expect(result).toEqual({ updated: 1, failed: [] });
		expect(caseAssets.byId[1].flags).toEqual([{ flag_id: 5 }]);
	});

	it('reports a failed removal', async () => {
		clearFlag.mockResolvedValueOnce({ ok: false, status: 400, data: '' });
		const caseAssets = { byId: {} } as unknown as CaseAssetsContext;
		const result = await applyAssetFlag(caseAssets, 9, [1], 4, 'clear');
		expect(result.updated).toBe(0);
		expect(result.failed).toHaveLength(1);
	});

	it('reports a thrown request', async () => {
		setFlag.mockRejectedValueOnce(new Error('network down'));
		const caseAssets = { byId: {} } as unknown as CaseAssetsContext;
		const result = await applyAssetFlag(caseAssets, 9, [1], 4, 'set');
		expect(result).toEqual({ updated: 0, failed: [{ assetId: 1, message: 'network down' }] });
	});
});
