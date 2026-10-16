import { describe, expect, it, vi } from 'vitest';

vi.mock('$lib/services/custom-attributes.service', () => ({
	CustomAttributesService: { list: vi.fn() }
}));

import {
	seedCustomAttributeValues,
	unwrapAttributeValue,
	withObjectFields
} from '$lib/stores/custom-attributes.store.svelte';
import type { CustomAttributeSchema } from '$lib/services/custom-attributes.service';

const schema: CustomAttributeSchema = {
	SLA: {
		SLA_Status: { type: 'input_string', mandatory: false, value: '' },
		Escalated: { type: 'input_checkbox', mandatory: false, value: false }
	}
};

describe('unwrapAttributeValue', () => {
	it('unwraps the persisted {type, value, mandatory} shape', () => {
		expect(
			unwrapAttributeValue({ type: 'input_string', value: 'On track', mandatory: false })
		).toBe('On track');
		expect(unwrapAttributeValue({ type: 'input_checkbox', value: false, mandatory: false })).toBe(
			false
		);
	});

	it('passes bare values through', () => {
		expect(unwrapAttributeValue('plain')).toBe('plain');
		expect(unwrapAttributeValue(null)).toBeNull();
		expect(unwrapAttributeValue(['a'])).toEqual(['a']);
	});
});

describe('seedCustomAttributeValues', () => {
	it('seeds inputs with the stored value, not the stored object', () => {
		const values = seedCustomAttributeValues(schema, {
			SLA: { SLA_Status: { type: 'input_string', value: 'Breached', mandatory: false } }
		});
		expect(values.SLA.SLA_Status).toBe('Breached');
		expect(values.SLA.Escalated).toBe(false); // schema default
	});
});

describe('withObjectFields', () => {
	it('adds module-written tabs that the schema does not know', () => {
		const merged = withObjectFields(schema, {
			'VT Report': { 'HTML report': { type: 'html', value: '<b>report</b>', mandatory: false } }
		});
		expect(merged['VT Report']['HTML report']).toEqual({
			type: 'html',
			value: '<b>report</b>',
			mandatory: false
		});
		expect(merged.SLA).toBe(schema.SLA);
	});

	it('never overrides schema definitions and ignores untyped values', () => {
		const merged = withObjectFields(schema, {
			SLA: { SLA_Status: { type: 'html', value: 'x' }, Legacy: 'bare value' }
		});
		expect(merged.SLA.SLA_Status.type).toBe('input_string');
		expect(merged.SLA.Legacy).toBeUndefined();
	});
});
