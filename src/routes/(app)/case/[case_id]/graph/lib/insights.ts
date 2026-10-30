/**
 * Pure helpers of the intelligence panels (§6 / §9.8–§9.10): heuristic
 * suggestions, AI proposals, gaps and the AI explanation.
 */
import type {
	GraphAiSuggestionsResult,
	GraphEdge,
	GraphExplainBody,
	GraphGap,
	GraphGapSeverity,
	GraphSuggestion
} from '$lib/types/resources/case-graph';
import type { NoteFolder } from '$lib/types/resources/note';
import { isStoredEdge } from './model';

// ---------------------------------------------------------------------------
// Suggestions
// ---------------------------------------------------------------------------

export const SUGGESTION_KINDS: { kind: string; label: string; hint: string }[] = [
	{
		kind: 'ip_match',
		label: 'Same IP address',
		hint: 'An asset IP equals an IOC value.'
	},
	{
		kind: 'enrichment_resolution',
		label: 'Enrichment resolutions',
		hint: 'An IOC enrichment resolves to another IOC of the case.'
	},
	{
		kind: 'alert_link',
		label: 'Shared alerts',
		hint: 'Both objects are linked to the same alert.'
	},
	{
		kind: 'text_mention',
		label: 'Mentioned in events',
		hint: 'A timeline event mentions an object it is not linked to.'
	}
];

export interface SuggestionGroup {
	kind: string;
	label: string;
	hint: string;
	items: GraphSuggestion[];
}

/** By kind (strongest heuristics first), keeping the server order (score) inside. */
export const groupSuggestions = (list: readonly GraphSuggestion[]): SuggestionGroup[] => {
	const groups = new Map<string, SuggestionGroup>();
	for (const k of SUGGESTION_KINDS) groups.set(k.kind, { ...k, items: [] });
	for (const s of list) {
		let g = groups.get(s.kind);
		if (!g) {
			g = { kind: s.kind, label: s.kind.replace(/_/g, ' '), hint: '', items: [] };
			groups.set(s.kind, g);
		}
		g.items.push(s);
	}
	return [...groups.values()].filter((g) => g.items.length);
};

/** The suggestions left once `keys` were accepted or dismissed. */
export const withoutSuggestions = (list: readonly GraphSuggestion[], keys: Iterable<string>) => {
	const drop = new Set(keys);
	return list.filter((s) => !drop.has(s.key));
};

export const acceptOutcome = (requested: number, created: number, unknown: number) => {
	const parts = [`${created} relation${created === 1 ? '' : 's'} created`];
	if (unknown) {
		parts.push(
			`${unknown} suggestion${unknown === 1 ? ' was' : 's were'} no longer current (refreshed)`
		);
	}
	return requested === 1 && created === 1 ? 'Relation created' : parts.join(', ');
};

// ---------------------------------------------------------------------------
// AI proposals
// ---------------------------------------------------------------------------

/** AI edges waiting for a review, most confident first. */
export const pendingAiEdges = (edges: readonly GraphEdge[]) =>
	edges
		.filter((e) => isStoredEdge(e) && e.origin === 'ai' && e.review_state === 'pending')
		.sort((a, b) => (b.confidence ?? -1) - (a.confidence ?? -1) || a.key.localeCompare(b.key));

export const aiOutcome = (r: GraphAiSuggestionsResult) => {
	const stored = r.edges?.length ?? 0;
	if (!r.proposed) return 'The model proposed no new relation.';
	const head = `${r.proposed} relation${r.proposed === 1 ? '' : 's'} proposed`;
	const kept = stored === 1 ? '1 to review' : `${stored} to review`;
	return r.dropped
		? `${head}, ${kept}, ${r.dropped} dropped (unknown objects, duplicates or existing relations).`
		: `${head}, ${kept}.`;
};

// ---------------------------------------------------------------------------
// Gaps
// ---------------------------------------------------------------------------

export const GAP_SEVERITIES: GraphGapSeverity[] = ['high', 'medium', 'low'];

export const GAP_LABEL: Record<string, string> = {
	initial_access_unknown: 'Initial access unknown',
	compromised_without_event: 'Compromised, no event',
	unanalysed_compromised: 'Compromised, not analysed',
	unsupported_edge: 'Unsupported relation',
	isolated_ioc: 'Isolated IOC'
};

const severityRank = (s: string) => {
	const i = GAP_SEVERITIES.indexOf(s as GraphGapSeverity);
	return i < 0 ? GAP_SEVERITIES.length : i;
};

/** Severity first (high → low), the server order inside (stable). */
export const sortGaps = (gaps: readonly GraphGap[]) =>
	gaps
		.map((g, i) => ({ g, i }))
		.sort((a, b) => severityRank(a.g.severity) - severityRank(b.g.severity) || a.i - b.i)
		.map(({ g }) => g);

export const gapCounts = (gaps: readonly GraphGap[]) => {
	const out: Record<GraphGapSeverity, number> = { high: 0, medium: 0, low: 0 };
	for (const g of gaps) if (g.severity in out) out[g.severity]++;
	return out;
};

// ---------------------------------------------------------------------------
// Explain
// ---------------------------------------------------------------------------

export type ExplainScope = 'case' | 'canvas' | 'selection' | 'view';

/** Kinds of the default graph the explanation is computed on (no `include`). */
const EXPLAINABLE_KINDS = new Set(['asset', 'ioc', 'node']);

export const isExplainableKey = (key: string) => EXPLAINABLE_KINDS.has(key.split(':')[0]);

export type ExplainRequest =
	| { body: GraphExplainBody; left: number; error?: undefined }
	| { error: string };

/**
 * Request body of a scope. Without a view the server explains the default
 * graph, so events, tasks… (from `include`) are left out of `node_keys`.
 */
export const explainRequest = (
	scope: ExplainScope,
	ctx: { selection: readonly string[]; canvas: Iterable<string>; viewId: number | null }
): ExplainRequest => {
	if (scope === 'case') return { body: {}, left: 0 };
	if (scope === 'view') {
		return ctx.viewId === null
			? { error: 'Load a saved view first.' }
			: { body: { view_id: ctx.viewId }, left: 0 };
	}
	const all = [...new Set(scope === 'selection' ? ctx.selection : ctx.canvas)];
	const keys = all.filter(isExplainableKey);
	if (!keys.length) {
		return {
			error:
				scope === 'selection'
					? 'Select assets, IOCs or free nodes to explain.'
					: 'No asset, IOC or free node is drawn.'
		};
	}
	return { body: { node_keys: keys }, left: all.length - keys.length };
};

export const EXPLAIN_NOTES_DIRECTORY = 'Investigation graph';

/** A directory of the (flat) directory listing. */
export type ListedNoteFolder = Pick<NoteFolder, 'id' | 'name' | 'mirror_war_room_id'> & {
	parent_id?: number | null;
};

/** The top-level notes directory the explanations are saved in, if any. */
export const findNotesDirectory = <F extends ListedNoteFolder>(
	folders: readonly F[],
	name = EXPLAIN_NOTES_DIRECTORY
): F | null =>
	folders.find(
		(f) =>
			!f.mirror_war_room_id &&
			(f.parent_id === null || f.parent_id === undefined) &&
			f.name.trim().toLowerCase() === name.toLowerCase()
	) ?? null;

const pad = (n: number) => `${n}`.padStart(2, '0');

const stamp = (d: Date) =>
	`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;

export const EXPLAIN_SCOPE_LABEL: Record<ExplainScope, string> = {
	case: 'Whole graph',
	canvas: 'Drawn objects',
	selection: 'Selection',
	view: 'Saved view'
};

export const explainNoteTitle = (scope: ExplainScope, at: Date, viewName?: string | null) =>
	`Graph explanation — ${scope === 'view' && viewName ? viewName : EXPLAIN_SCOPE_LABEL[scope].toLowerCase()} — ${stamp(at)}`;

export const explainNoteContent = (markdown: string, at: Date, graphPath: string) =>
	`${markdown.trim()}\n\n---\n\n_Generated by the AI assistant from the [investigation graph](${graphPath}) on ${stamp(at)}. Review it before relying on it._\n`;
