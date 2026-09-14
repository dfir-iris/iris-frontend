import { describe, expect, it } from 'vitest';

import {
	applySimpleClauses,
	emptyLookups,
	parseSimpleClauses,
	queueTabOf,
	serializeSimpleClauses,
	withQueueTab,
	type AlertQueryLookups,
	type SimpleFilters
} from '../alert-query';

/**
 * The advanced panel is a view onto the search bar, so every edit made in
 * it is a parse-then-print of the analyst's expression. The thing that can
 * go wrong is not a wrong chip — it is a clause quietly disappearing
 * because the form had no cell for it.
 *
 * Hence two kinds of test here: the lifting rules, and the invariant that
 * a trip through the panel is a fixed point.
 */

const lookups: AlertQueryLookups = {
	statuses: [
		{ id: 1, name: 'New' },
		{ id: 2, name: 'Assigned' },
		{ id: 5, name: 'Closed' }
	],
	severities: [
		{ id: 3, name: 'Medium' },
		{ id: 4, name: 'High' }
	],
	classifications: [{ id: 7, name: 'phishing' }],
	resolutions: [{ id: 2, name: 'True Positive With Impact' }],
	customers: [
		{ id: 1, name: 'IrisInitialClient' },
		{ id: 9, name: 'Acme Corp' }
	],
	owners: [
		{ id: 1, name: 'administrator' },
		{ id: 4, name: 'jdoe' }
	]
};

/** Parse, print, parse — the panel's full cycle with nothing changed. */
const roundTrip = (query: string): string => {
	const { known, residue } = parseSimpleClauses(query, lookups);
	return serializeSimpleClauses(known, residue, lookups);
};

describe('parseSimpleClauses', () => {
	it('lifts a text clause into the box that shows it', () => {
		expect(parseSimpleClauses('title:ransomware', lookups).known).toEqual({
			alert_title: 'ransomware'
		});
	});

	it('reads a synonym but prints the canonical alias', () => {
		expect(parseSimpleClauses('desc:beacon', lookups).known).toEqual({
			alert_description: 'beacon'
		});
		expect(roundTrip('desc:beacon')).toBe('description:beacon');
	});

	it('resolves an enum name to the id the form stores', () => {
		expect(parseSimpleClauses('status:Closed severity:High', lookups).known).toEqual({
			alert_status_id: 5,
			alert_severity_id: 4
		});
	});

	it('matches an enum name case-insensitively, as the backend does', () => {
		expect(parseSimpleClauses('status:closed', lookups).known.alert_status_id).toBe(5);
	});

	it('keeps a value it cannot resolve rather than guessing at it', () => {
		// A status added after this page loaded its tables is not an error —
		// the backend resolves the name again anyway.
		const { known, residue } = parseSimpleClauses('status:Quarantined', lookups);

		expect(known).toEqual({});
		expect(residue).toBe('status:Quarantined');
	});

	it('lifts an inclusive date range into the two date inputs', () => {
		expect(parseSimpleClauses('created:[2024-01-01 TO 2024-01-31]', lookups).known).toEqual({
			creation_start_date: '2024-01-01',
			creation_end_date: '2024-01-31'
		});
	});

	it('lifts a one-sided date comparison', () => {
		expect(parseSimpleClauses('event_time:>=2024-05-01', lookups).known).toEqual({
			alert_start_date: '2024-05-01'
		});
	});

	it('leaves a relative date alone — a date input cannot hold one', () => {
		const { known, residue } = parseSimpleClauses('created:>now-7d', lookups);

		expect(known).toEqual({});
		expect(residue).toBe('created:>now-7d');
	});

	it('leaves a strict bound alone rather than widening it by a day', () => {
		expect(parseSimpleClauses('created:>2024-01-01', lookups).residue).toBe('created:>2024-01-01');
	});

	it('lifts the cluster orphan shorthand to the id the queue uses', () => {
		expect(parseSimpleClauses('cluster:none', lookups).known).toEqual({ cluster_id: -1 });
	});

	it('lifts a list of alert ids', () => {
		expect(parseSimpleClauses('id:(1 2 3)', lookups).known).toEqual({ alert_ids: '1,2,3' });
	});

	it.each([
		['a negation', '-status:Closed'],
		['an alternation', '(source:crowdstrike OR source:sentinel)'],
		['a wildcard', 'asset:*.corp.local'],
		['a JSON path', 'context.rule_name:"brute force"'],
		['a bare term', 'ransomware'],
		['a macro', 'is:open'],
		['a relative owner', 'owner:me'],
		['an unassigned owner', 'owner:none']
	])('keeps %s in the residue', (_label, query) => {
		const { known, residue } = parseSimpleClauses(query, lookups);

		expect(known).toEqual({});
		expect(residue).toBe(query);
	});

	it('parenthesises a bare alternation so re-appending it cannot widen the search', () => {
		// `a OR b` after another clause would reassociate into
		// `(other AND a) OR b`, which matches more, not less.
		expect(parseSimpleClauses('source:crowdstrike OR source:sentinel', lookups).residue).toBe(
			'(source:crowdstrike OR source:sentinel)'
		);
	});

	it('keeps only the first of two clauses on one form field', () => {
		// The form has one Status select, so the second clause has nowhere
		// to go — but both still have to be applied.
		const { known, residue } = parseSimpleClauses('status:New status:Closed', lookups);

		expect(known).toEqual({ alert_status_id: 1 });
		expect(residue).toBe('status:Closed');
	});

	it('treats an expression that does not parse as entirely residue', () => {
		const { known, residue } = parseSimpleClauses('status:New AND (title:foo', lookups);

		expect(known).toEqual({});
		expect(residue).toBe('status:New AND (title:foo');
	});

	it('treats a rejected feature as residue even though the rest parses', () => {
		// `~` has no meaning on plain ILIKE and the backend refuses it. The
		// panel must not present half of a query the server will reject.
		expect(parseSimpleClauses('status:New title:foo~2', lookups).known).toEqual({});
	});

	it('is empty for an empty expression', () => {
		expect(parseSimpleClauses(undefined, lookups)).toEqual({ known: {}, residue: '' });
		expect(parseSimpleClauses('   ', lookups)).toEqual({ known: {}, residue: '' });
	});

	it('lifts nothing when the lookup tables have not loaded', () => {
		// Names still reach the backend through the residue, so the queue is
		// filtered correctly — only the form stays blank.
		const { known, residue } = parseSimpleClauses('status:Closed', emptyLookups());

		expect(known).toEqual({});
		expect(residue).toBe('status:Closed');
	});
});

describe('serializeSimpleClauses', () => {
	it('prints an enum id as the name the bar speaks', () => {
		const known: SimpleFilters = { alert_status_id: 5, alert_owner_id: 4 };

		expect(serializeSimpleClauses(known, '', lookups)).toBe('status:Closed owner:jdoe');
	});

	it('quotes a value with a space in it', () => {
		expect(serializeSimpleClauses({ alert_customer_id: 9 }, '', lookups)).toBe(
			'customer:"Acme Corp"'
		);
	});

	it('quotes a wildcard character so a typed star stays literal', () => {
		// The form's Title box is a plain substring match; `*` in it is a
		// character the analyst is looking for, not a pattern.
		expect(serializeSimpleClauses({ alert_title: 'report*' }, '', lookups)).toBe('title:"report*"');
	});

	it('falls back to the raw column when an id has no name left', () => {
		// A deleted status still filters the queue; dropping the clause
		// because its label is gone would silently widen the result set.
		expect(serializeSimpleClauses({ alert_status_id: 99 }, '', lookups)).toBe('alert_status_id:99');
		expect(serializeSimpleClauses({ resolution_status_id: 99 }, '', lookups)).toBe(
			'alert_resolution_status_id:99'
		);
	});

	it('prints both date bounds as a range and one as a comparison', () => {
		expect(
			serializeSimpleClauses(
				{ creation_start_date: '2024-01-01', creation_end_date: '2024-01-31' },
				'',
				lookups
			)
		).toBe('created:[2024-01-01 TO 2024-01-31]');

		expect(serializeSimpleClauses({ creation_end_date: '2024-01-31' }, '', lookups)).toBe(
			'created:<=2024-01-31'
		);
	});

	it('appends the residue last, untouched', () => {
		expect(serializeSimpleClauses({ alert_status_id: 1 }, '(a OR b) is:open', lookups)).toBe(
			'status:New (a OR b) is:open'
		);
	});

	it('prints nothing for an empty form', () => {
		expect(serializeSimpleClauses({}, '', lookups)).toBe('');
	});
});

describe('the residue invariant', () => {
	it.each([
		'status:Closed',
		'title:ransomware severity:High',
		'is:open owner:me',
		'-status:Closed severity:High',
		'(source:crowdstrike OR source:sentinel) tag:phishing',
		'context.rule_name:"brute force" status:New',
		'asset:*.corp.local created:>now-24h',
		'customer:"Acme Corp" created:[2024-01-01 TO 2024-01-31]',
		'id:(1 2 3) cluster:none case:12',
		'status:New AND (title:foo',
		'title:foo~2 status:New'
	])('is a fixed point for %s', (query) => {
		const once = roundTrip(query);

		expect(roundTrip(once)).toBe(once);
	});

	it.each([
		'is:open owner:me',
		'-status:Closed',
		'(source:crowdstrike OR source:sentinel)',
		'context.rule_name:"brute force"',
		'asset:*.corp.local',
		'created:>now-24h'
	])('carries %s through an edit the panel could not show it', (unrepresentable) => {
		const query = `status:New ${unrepresentable}`;
		const { known, residue } = parseSimpleClauses(query, lookups);

		// The analyst changes Status in the form and closes the panel.
		const next = serializeSimpleClauses({ ...known, alert_status_id: 5 }, residue, lookups);

		expect(next).toBe(`status:Closed ${unrepresentable}`);
	});

	it('drops a form field without touching the rest of the expression', () => {
		const query = 'status:New is:open owner:me';
		const { known, residue } = parseSimpleClauses(query, lookups);

		expect(serializeSimpleClauses({ ...known, alert_status_id: undefined }, residue, lookups)).toBe(
			'is:open owner:me'
		);
	});

	it('never widens: every conjunct of the input survives the trip', () => {
		const query = '-status:Closed severity:High (a OR b) is:unassigned';

		expect(roundTrip(query)).toBe('severity:High -status:Closed (a OR b) is:unassigned');
	});
});

describe('applySimpleClauses', () => {
	it('swaps the form clauses of an expression and keeps the rest', () => {
		expect(applySimpleClauses('status:New is:open', { alert_severity_id: 4 }, lookups)).toBe(
			'severity:High is:open'
		);
	});

	it('builds an expression from nothing', () => {
		expect(applySimpleClauses(undefined, { alert_title: 'beacon' }, lookups)).toBe('title:beacon');
	});
});

describe('queueTabOf', () => {
	it.each([
		['is:open', null],
		['is:open owner:me', 'mine'],
		['is:open owner:none', 'unassigned'],
		['status:Escalated', 'escalated'],
		['', null],
		['severity:High', null]
	] as const)('reads %s as the %s tab', (query, tab) => {
		expect(queueTabOf(query)).toBe(tab);
	});

	it('reads the tab through the rest of an expression', () => {
		expect(queueTabOf('title:beacon is:open owner:me severity:>=High')).toBe('mine');
	});

	it('is case-insensitive, like the backend resolving the value', () => {
		expect(queueTabOf('status:escalated')).toBe('escalated');
	});

	it('lets escalated win — it is its own scope, not a slice of the open queue', () => {
		expect(queueTabOf('is:open owner:me status:Escalated')).toBe('escalated');
	});

	it('ignores a negated tab clause, which means the opposite', () => {
		expect(queueTabOf('-owner:me is:open')).toBe(null);
	});
});

describe('withQueueTab', () => {
	it('writes the tab into an empty bar', () => {
		expect(withQueueTab('', 'mine')).toBe('is:open owner:me');
		expect(withQueueTab(undefined, null)).toBe('is:open');
	});

	it('swaps one tab for another', () => {
		expect(withQueueTab('is:open owner:me', 'unassigned')).toBe('is:open owner:none');
	});

	it('keeps what the analyst typed around it', () => {
		// Switching queue while searching for a host must not lose the host.
		expect(withQueueTab('is:open owner:me asset:HOST-1', 'escalated')).toBe(
			'status:Escalated asset:HOST-1'
		);
	});

	it('drops the open scope when moving to escalated, which is terminal', () => {
		expect(withQueueTab('is:open severity:High', 'escalated')).toBe(
			'status:Escalated severity:High'
		);
	});

	it('round-trips through queueTabOf', () => {
		for (const tab of ['mine', 'unassigned', 'escalated', null] as const) {
			expect(queueTabOf(withQueueTab('title:beacon', tab))).toBe(tab);
		}
	});

	it('leaves a half-typed expression alone rather than rewriting it', () => {
		expect(withQueueTab('status:New AND (title:foo', 'mine')).toBe(
			'is:open owner:me status:New AND (title:foo'
		);
	});
});
