import { describe, expect, it } from 'vitest';
import {
	clampSplitQueueWidth,
	SPLIT_DETAIL_MIN_WIDTH,
	SPLIT_QUEUE_MIN_WIDTH
} from '../split-resize';

describe('clampSplitQueueWidth', () => {
	it('keeps a width that fits, rounded', () => {
		expect(clampSplitQueueWidth(700.6, 1600)).toBe(701);
	});

	it('never goes below the queue minimum', () => {
		expect(clampSplitQueueWidth(100, 1600)).toBe(SPLIT_QUEUE_MIN_WIDTH);
	});

	it('leaves the detail its minimum', () => {
		expect(clampSplitQueueWidth(1500, 1600)).toBe(1600 - SPLIT_DETAIL_MIN_WIDTH);
	});

	it('falls back to the queue minimum when both cannot fit', () => {
		expect(clampSplitQueueWidth(700, 800)).toBe(SPLIT_QUEUE_MIN_WIDTH);
	});
});
