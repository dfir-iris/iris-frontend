import { describe, expect, it } from 'vitest';
import {
	SCOPE_MAX_TARGET_CASES,
	chunkIds,
	mapWithConcurrency,
	mergeCaseBatchResults
} from '../war-room-scope-batches';

describe('chunkIds', () => {
	it('keeps small lists in one batch', () => {
		expect(chunkIds([1, 2, 3], SCOPE_MAX_TARGET_CASES)).toEqual([[1, 2, 3]]);
		expect(chunkIds([], 50)).toEqual([]);
	});

	it('splits large lists in order', () => {
		const ids = Array.from({ length: 120 }, (_, i) => i + 1);
		const batches = chunkIds(ids, 50);
		expect(batches.map((b) => b.length)).toEqual([50, 50, 20]);
		expect(batches.flat()).toEqual(ids);
	});

	it('refuses a non-positive size', () => {
		expect(() => chunkIds([1], 0)).toThrow();
	});
});

describe('mergeCaseBatchResults', () => {
	it('concatenates results and de-duplicates customers', () => {
		const merged = mergeCaseBatchResults([
			{ results: [{ case_id: 1 }], customers: [{ customer_id: 1, customer_name: 'A' }] },
			{
				results: [{ case_id: 2 }, { case_id: 3 }],
				customers: [
					{ customer_id: 1, customer_name: 'A' },
					{ customer_id: 2, customer_name: 'B' }
				]
			}
		]);
		expect(merged.results.map((r) => r.case_id)).toEqual([1, 2, 3]);
		expect(merged.customers.map((c) => c.customer_id)).toEqual([1, 2]);
	});
});

describe('mapWithConcurrency', () => {
	it('keeps the order and caps calls in flight', async () => {
		let inFlight = 0;
		let peak = 0;
		const out = await mapWithConcurrency([5, 1, 4, 2, 3], 2, async (n) => {
			inFlight += 1;
			peak = Math.max(peak, inFlight);
			await new Promise((r) => setTimeout(r, n));
			inFlight -= 1;
			return n * 10;
		});
		expect(out).toEqual([50, 10, 40, 20, 30]);
		expect(peak).toBe(2);
	});

	it('handles an empty list and refuses a non-positive limit', async () => {
		expect(await mapWithConcurrency([], 3, async (n: number) => n)).toEqual([]);
		await expect(mapWithConcurrency([1], 0, async (n) => n)).rejects.toThrow();
	});
});
