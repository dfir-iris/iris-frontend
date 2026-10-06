import { describe, it, expect } from 'vitest';
import { tabLabelsToHide } from '../collapse-tab-labels';

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
