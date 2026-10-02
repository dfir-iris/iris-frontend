import { describe, expect, it } from 'vitest';
import { alertCardTone } from '../alert-card-status';

describe('alertCardTone', () => {
	it('keeps untriaged alerts apart', () => {
		expect(alertCardTone('New')).toBe('untriaged');
		expect(alertCardTone(' unspecified ')).toBe('untriaged');
	});

	it('treats work in flight as active, not finished', () => {
		expect(alertCardTone('In progress')).toBe('active');
		expect(alertCardTone('Pending')).toBe('active');
		expect(alertCardTone('Assigned')).toBe('active');
	});

	it('marks escalated alerts as handed off', () => {
		expect(alertCardTone('Escalated')).toBe('escalated');
	});

	it('only steps back for finished alerts', () => {
		expect(alertCardTone('Closed')).toBe('spent');
		expect(alertCardTone('Merged')).toBe('spent');
		expect(alertCardTone('Dismissed')).toBe('spent');
	});
});
