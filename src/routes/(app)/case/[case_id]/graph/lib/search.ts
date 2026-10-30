import type { GraphNode } from '$lib/types/resources/case-graph';
import {
	isEmptyQuery,
	parseQuery,
	queryBool,
	type ParsedQuery,
	type QueryTerm
} from '$lib/components/common/CytoscapeGraph/query';

/**
 * Keys of the graph attribute search:
 * `kind:ioc type:ip tag:c2 compromised:true flag:isolated tlp:amber
 *  criticality:high status:done label:dc01`, any of them negated with `-`.
 */
export const GRAPH_SEARCH_KEYS = [
	'kind',
	'type',
	'tag',
	'compromised',
	'flag',
	'tlp',
	'criticality',
	'status',
	'label'
] as const;

export const parseGraphQuery = (input: string): ParsedQuery => parseQuery(input, GRAPH_SEARCH_KEYS);

const KIND_ALIASES: Record<string, string> = {
	free: 'node',
	freenode: 'node',
	indicator: 'ioc',
	iocs: 'ioc',
	assets: 'asset',
	events: 'event'
};

const lc = (v: unknown) => (typeof v === 'string' ? v.toLowerCase() : '');
const stripTlp = (v: string) => v.replace(/^tlp[:\s-]*/, '');

const termMatches = (node: GraphNode, term: QueryTerm): boolean => {
	const v = term.value;
	switch (term.key) {
		case 'kind':
			return node.kind === (KIND_ALIASES[v] ?? v);
		case 'type':
			return lc(node.type).includes(v);
		case 'tag':
			return (node.tags ?? []).some((t) => lc(t) === v);
		case 'compromised': {
			const want = queryBool(v);
			if (want === null) return false;
			return want ? node.compromised === true : node.compromised !== true;
		}
		case 'flag':
			return (node.flags ?? []).some((f) => lc(f.name).includes(v));
		case 'tlp':
			return stripTlp(lc(node.tlp)) === stripTlp(v);
		case 'criticality':
			return lc(node.criticality) === v;
		case 'status':
			return lc(node.analysis_status).includes(v);
		case 'label':
			return lc(node.label).includes(v);
		default:
			return false;
	}
};

const haystack = (node: GraphNode) =>
	[node.label, node.subtitle, node.type, node.description, ...(node.tags ?? [])].map(lc).join('\n');

/** Every term must hold (negated terms must not) and every free-text token must appear. */
export const nodeMatchesQuery = (node: GraphNode, query: ParsedQuery): boolean => {
	for (const term of query.terms) {
		if (termMatches(node, term) === term.negated) return false;
	}
	if (query.text.length) {
		const hay = haystack(node);
		if (!query.text.every((t) => hay.includes(t))) return false;
	}
	return true;
};

/** Keys of matching nodes in input order, or null when the query is empty. */
export const searchNodes = (nodes: GraphNode[], input: string): string[] | null => {
	const query = parseGraphQuery(input);
	if (isEmptyQuery(query)) return null;
	return nodes.filter((n) => nodeMatchesQuery(n, query)).map((n) => n.key);
};

/** Next index when cycling through matches with Enter / Shift+Enter. */
export const cycleIndex = (current: number, length: number, backwards = false): number => {
	if (length <= 0) return -1;
	if (current < 0 || current >= length) return backwards ? length - 1 : 0;
	return (current + (backwards ? -1 : 1) + length) % length;
};
