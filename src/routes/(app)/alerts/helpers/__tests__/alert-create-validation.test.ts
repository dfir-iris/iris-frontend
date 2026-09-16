import { describe, expect, it } from 'vitest';
import { canCreateAlert, type AlertCreateDraft } from '../alert-create-validation';

const complete = (overrides: Partial<AlertCreateDraft> = {}): AlertCreateDraft => ({
	title: 'Hotline call from the SOC',
	customerId: '1',
	severityId: '2',
	statusId: '3',
	classificationId: '4',
	...overrides
});

describe('canCreateAlert', () => {
	it('accepts a draft with every field answered', () => {
		expect(canCreateAlert(complete())).toBe(true);
	});

	it('rejects an empty title', () => {
		expect(canCreateAlert(complete({ title: '' }))).toBe(false);
	});

	it('rejects a title that is only whitespace', () => {
		expect(canCreateAlert(complete({ title: '   ' }))).toBe(false);
	});

	it('rejects a draft with no customer', () => {
		expect(canCreateAlert(complete({ customerId: '' }))).toBe(false);
	});

	it('rejects a draft with no severity', () => {
		expect(canCreateAlert(complete({ severityId: '' }))).toBe(false);
	});

	it('rejects a draft with no status', () => {
		expect(canCreateAlert(complete({ statusId: '' }))).toBe(false);
	});

	it('rejects a draft with no classification', () => {
		expect(canCreateAlert(complete({ classificationId: '' }))).toBe(false);
	});
});
