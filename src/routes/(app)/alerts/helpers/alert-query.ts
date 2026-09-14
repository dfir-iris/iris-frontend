/**
 * The bridge between the search bar's text and the advanced filter grid.
 *
 * The bar is the single source of truth for what the queue is filtered by;
 * the grid is one way of editing it. That only works if a trip through the
 * grid is lossless, and the grid can express far less than the grammar can
 * — no `OR`, no negation, no wildcards, no JSON paths.
 *
 * Hence the split: `parseSimpleClauses` lifts the top-level conjuncts the
 * grid *can* render into `known` and keeps every other conjunct verbatim in
 * `residue`. `serializeSimpleClauses` prints `known` back out and appends
 * `residue` untouched. Opening the panel on an expression, changing one
 * select and closing it therefore cannot destroy the clause the panel never
 * showed — the panel displays the residue read-only so it is clear that
 * something is still applied.
 *
 * Round-tripping is stable rather than byte-exact: the first pass may add
 * parentheses around a bare `OR` (see `groupedTextOf`) and normalises
 * whitespace and clause order. Every pass after that is a fixed point, and
 * that is what the tests pin.
 *
 * This lives beside the alerts route rather than in `$lib` because it is
 * written against the route's `Filters` shape and the lookup tables the
 * page has already loaded. A `$lib` module reaching back into a route
 * would invert the dependency.
 */

import {
	groupedTextOf,
	parseLucene,
	quoteIfNeeded,
	topLevelConjuncts,
	type ClauseNode,
	type LuceneNode
} from '$lib/search/lucene';

import type { Filters } from '../components/AlertFilters/filters';

/** The `Filters` keys the advanced grid can both show and edit. */
export type SimpleFilterKey =
	| 'alert_title'
	| 'alert_description'
	| 'alert_source'
	| 'alert_tags'
	| 'source_reference'
	| 'alert_assets'
	| 'alert_iocs'
	| 'alert_ids'
	| 'alert_status_id'
	| 'alert_severity_id'
	| 'alert_classification_id'
	| 'resolution_status_id'
	| 'alert_customer_id'
	| 'alert_owner_id'
	| 'case_id'
	| 'cluster_id'
	| 'alert_start_date'
	| 'alert_end_date'
	| 'creation_start_date'
	| 'creation_end_date';

export type SimpleFilters = Pick<Filters, SimpleFilterKey>;

/**
 * Every key of `SimpleFilters`, as a value rather than a type.
 *
 * `serializeSimpleClauses` covers the same set clause by clause; the tests
 * pin that the two agree, so a key added to one and not the other is a
 * failure rather than a filter that silently stops being printed.
 */
export const SIMPLE_FILTER_KEYS: readonly SimpleFilterKey[] = [
	'alert_title',
	'alert_description',
	'alert_source',
	'alert_tags',
	'source_reference',
	'alert_assets',
	'alert_iocs',
	'alert_ids',
	'alert_status_id',
	'alert_severity_id',
	'alert_classification_id',
	'resolution_status_id',
	'alert_customer_id',
	'alert_owner_id',
	'case_id',
	'cluster_id',
	'alert_start_date',
	'alert_end_date',
	'creation_start_date',
	'creation_end_date'
];

/** The grid's slice of a filter set. */
export const pickSimpleFilters = (filters: SimpleFilters): SimpleFilters => {
	const picked: Record<string, unknown> = {};
	for (const key of SIMPLE_FILTER_KEYS) {
		if (filters[key] !== undefined) picked[key] = filters[key];
	}
	return picked as SimpleFilters;
};

/**
 * The same filter set with the grid's keys dropped.
 *
 * Used when an edit moves them into the expression: leaving the scalar
 * params behind would AND a stale copy of the filter onto the new one.
 */
export const withoutSimpleFilters = <T extends SimpleFilters>(filters: T): T => {
	const next = { ...filters };
	for (const key of SIMPLE_FILTER_KEYS) delete next[key];
	return next;
};

export interface SimpleClauses {
	known: SimpleFilters;
	/** The conjuncts the grid cannot render, ready to be re-appended. */
	residue: string;
}

/** One value the bar spells by name and the grid stores by id. */
export interface LookupEntry {
	id: number;
	name: string;
}

/**
 * The name⇄id tables the page has already loaded.
 *
 * Resolution is deliberately client-side *only for display*: the request
 * carries the name and the backend resolves it again against the database,
 * so a table that is stale or empty costs a round-trip through the grid,
 * never a wrong result set.
 */
export interface AlertQueryLookups {
	statuses: LookupEntry[];
	severities: LookupEntry[];
	classifications: LookupEntry[];
	resolutions: LookupEntry[];
	customers: LookupEntry[];
	owners: LookupEntry[];
}

export const emptyLookups = (): AlertQueryLookups => ({
	statuses: [],
	severities: [],
	classifications: [],
	resolutions: [],
	customers: [],
	owners: []
});

type TextFilterKey =
	| 'alert_title'
	| 'alert_description'
	| 'alert_source'
	| 'alert_tags'
	| 'source_reference'
	| 'alert_assets'
	| 'alert_iocs';

type EnumFilterKey =
	| 'alert_status_id'
	| 'alert_severity_id'
	| 'alert_classification_id'
	| 'resolution_status_id'
	| 'alert_customer_id'
	| 'alert_owner_id';

type DateFilterKey =
	| 'alert_start_date'
	| 'alert_end_date'
	| 'creation_start_date'
	| 'creation_end_date';

interface TextField {
	key: TextFilterKey;
	/** The alias to print. Synonyms are only read. */
	alias: string;
	synonyms?: readonly string[];
}

interface EnumField {
	key: EnumFilterKey;
	alias: string;
	table: keyof AlertQueryLookups;
	synonyms?: readonly string[];
}

interface DateField {
	alias: string;
	lower: DateFilterKey;
	upper: DateFilterKey;
	synonyms?: readonly string[];
}

/**
 * The aliases the grid mirrors, in the order the panel lays them out so a
 * serialised expression reads the way the form does.
 */
const TEXT_FIELDS: readonly TextField[] = [
	{ key: 'alert_title', alias: 'title' },
	{ key: 'alert_description', alias: 'description', synonyms: ['desc'] },
	{ key: 'alert_source', alias: 'source' },
	{ key: 'alert_tags', alias: 'tag', synonyms: ['tags'] },
	{ key: 'alert_assets', alias: 'asset' },
	{ key: 'alert_iocs', alias: 'ioc' },
	{ key: 'source_reference', alias: 'ref', synonyms: ['source_ref'] }
];

const ENUM_FIELDS: readonly EnumField[] = [
	{ key: 'alert_status_id', alias: 'status', table: 'statuses' },
	{ key: 'alert_severity_id', alias: 'severity', table: 'severities' },
	{ key: 'alert_classification_id', alias: 'classification', table: 'classifications' },
	{ key: 'resolution_status_id', alias: 'resolution', table: 'resolutions' },
	{ key: 'alert_customer_id', alias: 'customer', table: 'customers', synonyms: ['client'] },
	{ key: 'alert_owner_id', alias: 'owner', table: 'owners', synonyms: ['assignee'] }
];

const DATE_FIELDS: readonly DateField[] = [
	{
		alias: 'event_time',
		synonyms: ['seen'],
		lower: 'alert_start_date',
		upper: 'alert_end_date'
	},
	{ alias: 'created', lower: 'creation_start_date', upper: 'creation_end_date' }
];

/** `cluster_id: -1` is the queue's "not in any cluster" filter. */
const NO_CLUSTER = -1;

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const INTEGER = /^\d+$/;

/** A live wildcard — an escaped `\*` is a literal star and does not count. */
const hasWildcard = (text: string): boolean => {
	for (let index = 0; index < text.length; index += 1) {
		if (text[index] === '\\') {
			index += 1;
			continue;
		}
		if (text[index] === '*' || text[index] === '?') return true;
	}
	return false;
};

/**
 * The value as the form should show it.
 *
 * Token text keeps its backslashes — the compiler needs to know what was
 * escaped — but a text box wants the characters themselves. Printing goes
 * back the other way through `quoteIfNeeded`.
 */
const unescape = (text: string): string => text.replace(/\\(.)/g, '$1');

const matches = (field: { alias: string; synonyms?: readonly string[] }, alias: string): boolean =>
	field.alias === alias || (field.synonyms?.includes(alias) ?? false);

const byName = (entries: LookupEntry[], name: string): LookupEntry | undefined =>
	entries.find((entry) => entry.name.toLowerCase() === name.toLowerCase());

const byId = (entries: LookupEntry[], id: number): LookupEntry | undefined =>
	entries.find((entry) => entry.id === id);

/** A plain value the grid's text boxes can hold: no wildcards, no ranges. */
const plainText = (clause: ClauseNode): string | null => {
	if (clause.value.type !== 'term') return null;
	if (!clause.value.quoted && hasWildcard(clause.value.text)) return null;
	return unescape(clause.value.text);
};

/** Every integer in a comma- or space-separated list, in order, deduplicated. */
const integerList = (raw: string | number[] | undefined): number[] => {
	if (raw == null) return [];
	const parts = Array.isArray(raw) ? raw.map(String) : raw.split(/[\s,]+/);
	const found: number[] = [];
	for (const part of parts) {
		if (!INTEGER.test(part)) continue;
		const value = Number(part);
		if (!found.includes(value)) found.push(value);
	}
	return found;
};

/**
 * `id:(1 2 3)` — the one value group the grid can render, because its
 * Alert IDs box is itself a list. Anything else parenthesised is residue.
 */
const idGroup = (node: LuceneNode): number[] | null => {
	const children = node.type === 'or' ? node.children : [node];
	const ids: number[] = [];

	for (const child of children) {
		if (child.type !== 'clause' || child.field !== 'id') return null;
		const text = plainText(child);
		if (text === null || !INTEGER.test(text)) return null;
		ids.push(Number(text));
	}

	return ids.length > 0 ? ids : null;
};

/**
 * Try to move one conjunct into `known`.
 *
 * Returns false for anything the grid cannot render *faithfully* — the
 * caller then keeps the original text. "Faithfully" is the whole contract:
 * lifting `owner:me` into a numeric id would freeze today's analyst into
 * the expression, so `me` stays in the residue where it keeps meaning
 * whoever is looking.
 */
const lift = (node: LuceneNode, known: SimpleFilters, lookups: AlertQueryLookups): boolean => {
	const ids = idGroup(node);
	if (ids !== null) {
		if (known.alert_ids !== undefined) return false;
		known.alert_ids = ids.join(',');
		return true;
	}

	// Negation, OR and parenthesised groups have no cell in the form.
	if (node.type !== 'clause') return false;

	// A bare word searches every default column at once; the grid has no
	// box for "anywhere".
	if (node.field === null) return false;

	const alias = node.field;

	for (const field of TEXT_FIELDS) {
		if (!matches(field, alias)) continue;
		const text = plainText(node);
		if (text === null || known[field.key] !== undefined) return false;
		known[field.key] = text;
		return true;
	}

	for (const field of ENUM_FIELDS) {
		if (!matches(field, alias)) continue;
		const text = plainText(node);
		if (text === null || known[field.key] !== undefined) return false;
		// `me` and `none` resolve server-side, and unknown names may simply
		// mean this page loaded its tables before the value existed. Both
		// stay text rather than being guessed at.
		const entry = byName(lookups[field.table], text);
		if (entry === undefined) return false;
		known[field.key] = entry.id;
		return true;
	}

	for (const field of DATE_FIELDS) {
		if (!matches(field, alias)) continue;
		return liftDate(node, field, known);
	}

	if (alias === 'case') {
		const text = plainText(node);
		if (text === null || !INTEGER.test(text) || known.case_id !== undefined) return false;
		known.case_id = Number(text);
		return true;
	}

	if (alias === 'cluster') {
		const text = plainText(node);
		if (text === null || known.cluster_id !== undefined) return false;
		if (text.toLowerCase() === 'none') {
			known.cluster_id = NO_CLUSTER;
			return true;
		}
		if (!INTEGER.test(text)) return false;
		known.cluster_id = Number(text);
		return true;
	}

	return false;
};

/**
 * A date conjunct, if both the bound and the format fit the form's date
 * inputs.
 *
 * `type="date"` holds a bare `YYYY-MM-DD` and nothing else, so `now-7d`
 * and full timestamps stay in the residue. Strict `>` / `<` stay too: the
 * inputs mean an inclusive bound, and silently turning an exclusive one
 * inclusive would change the result set by a day.
 */
const liftDate = (clause: ClauseNode, field: DateField, known: SimpleFilters): boolean => {
	const { value } = clause;

	if (value.type === 'comparison') {
		if (!DATE_ONLY.test(value.text)) return false;
		const key =
			value.operator === 'gte' ? field.lower : value.operator === 'lte' ? field.upper : null;
		if (key === null || known[key] !== undefined) return false;
		known[key] = value.text;
		return true;
	}

	if (value.type === 'range') {
		if (!value.includeLower || !value.includeUpper) return false;
		if (value.lower === null || value.upper === null) return false;
		if (!DATE_ONLY.test(value.lower) || !DATE_ONLY.test(value.upper)) return false;
		if (known[field.lower] !== undefined || known[field.upper] !== undefined) return false;
		known[field.lower] = value.lower;
		known[field.upper] = value.upper;
		return true;
	}

	return false;
};

/**
 * Split an expression into the part the advanced grid can edit and the
 * part it must carry through untouched.
 *
 * An expression that does not parse yields no `known` at all and the whole
 * text as residue — a half-typed query must not be silently rewritten by
 * opening a panel.
 */
export const parseSimpleClauses = (
	query: string | undefined,
	lookups: AlertQueryLookups
): SimpleClauses => {
	const source = query ?? '';
	const known: SimpleFilters = {};

	if (source.trim() === '') return { known, residue: '' };

	const { ast, diagnostics } = parseLucene(source);
	if (ast === null || diagnostics.length > 0) return { known, residue: source.trim() };

	const residue: string[] = [];
	for (const conjunct of topLevelConjuncts(ast)) {
		if (lift(conjunct, known, lookups)) continue;
		residue.push(groupedTextOf(source, conjunct));
	}

	return { known, residue: residue.join(' ') };
};

const clause = (alias: string, value: string): string => `${alias}:${quoteIfNeeded(value)}`;

const asText = (value: string | string[] | undefined): string => {
	if (typeof value === 'string') return value;
	// The grid only ever writes a string. An array can still arrive from an
	// old saved filter, and joining it is closer to intent than dropping it.
	return Array.isArray(value) ? value.join(',') : '';
};

/**
 * Print the grid's state back into an expression, with the residue
 * re-appended exactly as it came in.
 *
 * Residue goes last so the clauses the analyst can see in the form lead the
 * bar; ordering is otherwise irrelevant, since every conjunct is ANDed.
 */
export const serializeSimpleClauses = (
	known: SimpleFilters,
	residue: string,
	lookups: AlertQueryLookups
): string => {
	const parts: string[] = [];

	for (const field of TEXT_FIELDS) {
		const text = asText(known[field.key]).trim();
		if (text !== '') parts.push(clause(field.alias, text));
	}

	for (const field of ENUM_FIELDS) {
		const id = known[field.key];
		if (id == null) continue;
		const entry = byId(lookups[field.table], id);
		// No name for this id — the value was deleted, or the page's tables
		// have not loaded. Fall through to the backend's raw-column escape
		// hatch so the filter still applies; it comes back as residue on the
		// next pass, which is visible rather than lost.
		parts.push(entry ? clause(field.alias, entry.name) : `${rawColumn(field.key)}:${id}`);
	}

	for (const field of DATE_FIELDS) {
		const lower = known[field.lower];
		const upper = known[field.upper];
		if (lower && upper) parts.push(`${field.alias}:[${lower} TO ${upper}]`);
		else if (lower) parts.push(`${field.alias}:>=${lower}`);
		else if (upper) parts.push(`${field.alias}:<=${upper}`);
	}

	const ids = integerList(known.alert_ids);
	if (ids.length === 1) parts.push(`id:${ids[0]}`);
	else if (ids.length > 1) parts.push(`id:(${ids.join(' ')})`);

	if (known.case_id != null) parts.push(`case:${known.case_id}`);
	if (known.cluster_id != null) {
		parts.push(known.cluster_id === NO_CLUSTER ? 'cluster:none' : `cluster:${known.cluster_id}`);
	}

	const tail = residue.trim();
	if (tail !== '') parts.push(tail);

	return parts.join(' ');
};

/**
 * The `Alert` column behind a grid key, for the raw-column escape hatch.
 *
 * Only reached when an id has no name to print, so it is a fallback rather
 * than a second vocabulary.
 */
const rawColumn = (key: EnumFilterKey): string =>
	key === 'resolution_status_id' ? 'alert_resolution_status_id' : key;

/**
 * Replace the grid's part of an expression, keeping everything else.
 *
 * This is what the advanced panel calls on every edit: re-split the current
 * text, swap in the form's state, print it back out.
 */
export const applySimpleClauses = (
	query: string | undefined,
	next: SimpleFilters,
	lookups: AlertQueryLookups
): string => {
	const { residue } = parseSimpleClauses(query, lookups);
	return serializeSimpleClauses(next, residue, lookups);
};

/** The split cockpit's quick-filter tabs. `null` is "all open". */
export type QueueTab = 'mine' | 'unassigned' | 'escalated' | null;

/**
 * The conjuncts the tab strip owns.
 *
 * Switching tabs replaces exactly these and leaves everything else the
 * analyst typed in place — picking "Unassigned" while searching for a host
 * should keep searching for that host.
 */
const TAB_CLAUSES: readonly { field: string; value: string; tab: QueueTab | 'open' }[] = [
	{ field: 'is', value: 'open', tab: 'open' },
	{ field: 'owner', value: 'me', tab: 'mine' },
	{ field: 'owner', value: 'none', tab: 'unassigned' },
	{ field: 'status', value: 'escalated', tab: 'escalated' }
];

const tabClauseOf = (node: LuceneNode): (typeof TAB_CLAUSES)[number] | null => {
	if (node.type !== 'clause' || node.field === null) return null;
	const text = plainText(node);
	if (text === null) return null;

	const field = node.field.toLowerCase();
	const value = text.toLowerCase();
	return TAB_CLAUSES.find((entry) => entry.field === field && entry.value === value) ?? null;
};

/** The expression a tab writes, in the order the bar reads best. */
const tabExpression = (tab: QueueTab): string => {
	if (tab === 'escalated') return 'status:Escalated';
	if (tab === 'mine') return 'is:open owner:me';
	if (tab === 'unassigned') return 'is:open owner:none';
	return 'is:open';
};

/**
 * Which tab an expression corresponds to, or `null` for anything the strip
 * does not describe — which is also what "All open" shows as active.
 */
export const queueTabOf = (query: string | undefined): QueueTab => {
	const source = query ?? '';
	if (source.trim() === '') return null;

	const { ast } = parseLucene(source);
	const tabs = topLevelConjuncts(ast)
		.map(tabClauseOf)
		.filter((entry): entry is (typeof TAB_CLAUSES)[number] => entry !== null)
		.map((entry) => entry.tab);

	// Escalated is its own scope rather than a slice of the open queue, so
	// it wins outright.
	if (tabs.includes('escalated')) return 'escalated';
	if (tabs.includes('mine')) return 'mine';
	if (tabs.includes('unassigned')) return 'unassigned';
	return null;
};

/**
 * The expression with the tab strip's clauses swapped for another tab's.
 *
 * An expression that does not parse is left alone apart from the new
 * prefix: rewriting text the analyst is halfway through typing would be
 * worse than the duplicate clause they can see and delete.
 */
export const withQueueTab = (query: string | undefined, tab: QueueTab): string => {
	const source = query ?? '';
	const expression = tabExpression(tab);

	const { ast, diagnostics } = parseLucene(source);
	if (source.trim() === '') return expression;
	if (ast === null || diagnostics.length > 0) return `${expression} ${source.trim()}`;

	const kept = topLevelConjuncts(ast)
		.filter((node) => tabClauseOf(node) === null)
		.map((node) => groupedTextOf(source, node));

	return [expression, ...kept].join(' ');
};
