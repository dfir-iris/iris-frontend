import { describe, it, expect } from 'vitest';
import {
	OPERATORS,
	isNonTextField,
	operatorsFor,
	operatorForField,
	coerceValue,
	emptyRootGroup
} from '../ConditionsBuilder.svelte';

/**
 * Regression for GlitchTip #214.
 *
 * The builder offered `contains (like)` on every field. Picking it on
 * `alert_status_id` (integer) produced `alert_status_id ILIKE '%0%'`, which
 * Postgres rejects with
 * `UndefinedFunction: operator does not exist: integer ~~* unknown`.
 */

const opValues = (field: string) => operatorsFor(field).map((o) => o.value);

describe('isNonTextField', () => {
	it.each([
		'alert_id',
		'alert_status_id',
		'alert_severity_id',
		'alert_owner_id',
		'alert_customer_id',
		'alert_classification_id',
		'alert_resolution_status_id',
		'alert_investigation_flow_id'
	])('treats id column %s as non-text', (field) => {
		expect(isNonTextField(field)).toBe(true);
	});

	it('treats uuid columns as non-text', () => {
		// alert_uuid is a real UUID column: `uuid ~~* unknown` fails too.
		expect(isNonTextField('alert_uuid')).toBe(true);
	});

	it.each(['alert_creation_time', 'alert_source_event_time', 'resolved_at', 'date_update'])(
		'treats timestamp column %s as non-text',
		(field) => {
			expect(isNonTextField(field)).toBe(true);
		}
	);

	it.each([
		'alert_title',
		'alert_description',
		'alert_note',
		'alert_tags',
		'alert_source',
		'alert_source_ref',
		'cluster_dedupe_key'
	])('treats text column %s as text', (field) => {
		expect(isNonTextField(field)).toBe(false);
	});

	it('judges a relationship path by its leaf segment', () => {
		expect(isNonTextField('assets.asset_type_id')).toBe(true);
		expect(isNonTextField('iocs.ioc_type_id')).toBe(true);
		expect(isNonTextField('assets.asset_name')).toBe(false);
		expect(isNonTextField('iocs.ioc_value')).toBe(false);
	});

	it('treats JSON document paths as text regardless of key name', () => {
		// The backend extracts these with `->>`, so the result is always text
		// even when the key happens to be named like an id.
		expect(isNonTextField('alert_context.severity')).toBe(false);
		expect(isNonTextField('alert_context.owner_id')).toBe(false);
		expect(isNonTextField('alert_source_content.event_type')).toBe(false);
	});

	it('stays permissive while the field is still empty', () => {
		expect(isNonTextField('')).toBe(false);
		expect(isNonTextField('   ')).toBe(false);
	});
});

describe('operatorsFor', () => {
	it('hides like / not_like on a numeric field', () => {
		const values = opValues('alert_status_id');
		expect(values).not.toContain('like');
		expect(values).not.toContain('not_like');
	});

	it('keeps the non-substring operators available on a numeric field', () => {
		const values = opValues('alert_status_id');
		expect(values).toEqual(expect.arrayContaining(['eq', 'neq', 'in', 'not_in']));
	});

	it('offers the full vocabulary on a text field', () => {
		expect(opValues('alert_title')).toEqual(OPERATORS.map((o) => o.value));
	});

	it('offers the full vocabulary on a JSON path', () => {
		expect(opValues('alert_context.severity')).toContain('like');
	});
});

describe('operatorForField', () => {
	it('downgrades a stale like to eq when the field turns numeric', () => {
		// Otherwise the option vanishes from the select but `like` is still
		// what gets submitted.
		expect(operatorForField('alert_status_id', 'like')).toBe('eq');
		expect(operatorForField('alert_status_id', 'not_like')).toBe('eq');
	});

	it('leaves valid operators untouched on a numeric field', () => {
		expect(operatorForField('alert_status_id', 'eq')).toBe('eq');
		expect(operatorForField('alert_status_id', 'in')).toBe('in');
	});

	it('leaves like alone on a text field', () => {
		expect(operatorForField('alert_title', 'like')).toBe('like');
	});
});

describe('coerceValue', () => {
	it('splits comma lists for in / not_in', () => {
		expect(coerceValue('a, b ,c', 'in')).toEqual(['a', 'b', 'c']);
		expect(coerceValue('a,,b', 'not_in')).toEqual(['a', 'b']);
	});

	it('passes scalars through for other operators', () => {
		expect(coerceValue('foo', 'eq')).toBe('foo');
	});
});

describe('emptyRootGroup', () => {
	it('starts as an empty AND group', () => {
		expect(emptyRootGroup()).toEqual({ logic: 'and', conditions: [] });
	});
});
