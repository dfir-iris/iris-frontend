import { describe, expect, it } from 'vitest';
import type { GraphRelationType } from '$lib/types/resources/case-graph';
import {
	blankRelationTypeForm,
	moveItem,
	relationNameFromLabel,
	relationTypeBody,
	relationTypeDeleteBlocker,
	relationTypeToForm,
	sortRelationTypes,
	validateRelationTypeForm
} from '../graph-relation-types';

const type = (extra: Partial<GraphRelationType> = {}): GraphRelationType => ({
	id: 1,
	name: 'connected_to',
	label: 'Connected to',
	description: null,
	directed: true,
	color: 'slate',
	line_style: 'solid',
	stix_relationship: null,
	is_system: true,
	sort_order: 0,
	edge_count: 0,
	...extra
});

describe('relationNameFromLabel', () => {
	it('slugifies the label', () => {
		expect(relationNameFromLabel('Lateral movement')).toBe('lateral_movement');
		expect(relationNameFromLabel('  Exfiltrated → to!  ')).toBe('exfiltrated_to');
		expect(relationNameFromLabel('Résolu à')).toBe('resolu_a');
	});

	it('prefixes a leading digit and returns empty for nothing usable', () => {
		expect(relationNameFromLabel('2FA bypass')).toBe('r_2fa_bypass');
		expect(relationNameFromLabel('→ !')).toBe('');
		expect(relationNameFromLabel('a'.repeat(80))).toHaveLength(64);
	});
});

describe('validateRelationTypeForm', () => {
	const ok = { ...blankRelationTypeForm(), label: 'Beacons to', name: 'beacons_to' };

	it('accepts a valid form', () => {
		expect(validateRelationTypeForm(ok, [type()])).toBeNull();
	});

	it('requires a label and a backend-valid, unique name', () => {
		expect(validateRelationTypeForm({ ...ok, label: ' ' }, [])).toMatch(/Label/);
		expect(validateRelationTypeForm({ ...ok, name: '1abc' }, [])).toMatch(/Name/);
		expect(validateRelationTypeForm({ ...ok, name: 'a' }, [])).toMatch(/Name/);
		expect(validateRelationTypeForm({ ...ok, name: 'Beacons' }, [])).toMatch(/Name/);
		expect(validateRelationTypeForm({ ...ok, name: 'connected_to' }, [type()])).toMatch(
			/already exists/
		);
	});

	it('checks the STIX relationship', () => {
		expect(validateRelationTypeForm({ ...ok, stix_relationship: 'Related To' }, [])).toMatch(
			/STIX/
		);
		expect(validateRelationTypeForm({ ...ok, stix_relationship: '' }, [])).toBeNull();
	});
});

describe('relationTypeBody', () => {
	it('sends the name of a custom type, defaults STIX and nulls an empty description', () => {
		const form = {
			...blankRelationTypeForm(),
			label: ' Beacons to ',
			name: 'beacons_to',
			stix_relationship: ' '
		};
		expect(relationTypeBody(form, null)).toEqual({
			name: 'beacons_to',
			label: 'Beacons to',
			description: null,
			directed: true,
			color: 'slate',
			line_style: 'solid',
			stix_relationship: 'related-to'
		});
	});

	it('leaves the name of a system type out', () => {
		const t = type({ description: 'Generic', stix_relationship: 'communicates-with' });
		const body = relationTypeBody(relationTypeToForm(t), t);
		expect(body).not.toHaveProperty('name');
		expect(body.description).toBe('Generic');
		expect(body.stix_relationship).toBe('communicates-with');
	});
});

describe('relationTypeDeleteBlocker', () => {
	it('blocks system and used types only', () => {
		expect(relationTypeDeleteBlocker(type())).toMatch(/Built-in/);
		expect(relationTypeDeleteBlocker(type({ is_system: false, edge_count: 1 }))).toBe(
			'Used by 1 relation in cases'
		);
		expect(relationTypeDeleteBlocker(type({ is_system: false, edge_count: 3 }))).toBe(
			'Used by 3 relations in cases'
		);
		expect(relationTypeDeleteBlocker(type({ is_system: false, edge_count: 0 }))).toBeNull();
		expect(relationTypeDeleteBlocker({ is_system: false })).toBeNull();
	});
});

describe('ordering', () => {
	it('moves an item and ignores out-of-range moves', () => {
		expect(moveItem(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a']);
		expect(moveItem(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b']);
		expect(moveItem(['a', 'b'], 0, 5)).toEqual(['a', 'b']);
	});

	it('sorts by sort order then id', () => {
		const list = [
			type({ id: 3, sort_order: 1 }),
			type({ id: 2, sort_order: 0 }),
			type({ id: 1, sort_order: 1 })
		];
		expect(sortRelationTypes(list).map((t) => t.id)).toEqual([2, 1, 3]);
	});
});
