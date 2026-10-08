import { describe, it, expect } from 'vitest';
import { tabLabelsToHide, tabRowLayout } from '../collapse-tab-labels';

describe('tabLabelsToHide', () => {
	const savings = [60, 40, 70, 110, 60, 80];

	it('hides nothing when the row fits', () => {
		expect(tabLabelsToHide(savings, 800, 800)).toBe(0);
		expect(tabLabelsToHide(savings, 700, 900)).toBe(0);
	});

	it('hides from the last tab, one at a time', () => {
		expect(tabLabelsToHide(savings, 800, 790)).toBe(1);
		expect(tabLabelsToHide(savings, 800, 720)).toBe(1);
		expect(tabLabelsToHide(savings, 800, 719)).toBe(2);
		expect(tabLabelsToHide(savings, 800, 600)).toBe(3);
	});

	it('hides every label when even that is not enough', () => {
		expect(tabLabelsToHide(savings, 800, 100)).toBe(savings.length);
	});

	it('handles a row without labels', () => {
		expect(tabLabelsToHide([], 300, 200)).toBe(0);
	});
});

describe('tabRowLayout', () => {
	// Five tabs: 100px each with the label, 40px of which is the label.
	const widths = [100, 100, 100, 100, 100];
	const savings = [60, 60, 60, 60, 60];

	it('keeps everything when the row fits', () => {
		expect(tabRowLayout(widths, savings, 500, 48)).toEqual({ labels: 0, overflow: 0 });
	});

	it('drops labels before moving any tab out', () => {
		expect(tabRowLayout(widths, savings, 440, 48)).toEqual({ labels: 1, overflow: 0 });
		expect(tabRowLayout(widths, savings, 200, 48)).toEqual({ labels: 5, overflow: 0 });
	});

	it('moves trailing tabs into the menu once icons alone do not fit', () => {
		// Icon-only row is 200px; 150 - 48 leaves room for two 40px tabs.
		expect(tabRowLayout(widths, savings, 150, 48)).toEqual({ labels: 5, overflow: 3 });
		expect(tabRowLayout(widths, savings, 199, 48)).toEqual({ labels: 5, overflow: 2 });
	});

	it('always keeps the first tab in the row', () => {
		expect(tabRowLayout(widths, savings, 10, 48)).toEqual({ labels: 5, overflow: 4 });
	});
});
