/**
 * The suggestions inbox: which suggestions a set of filters keeps, and
 * how a pushed suggestion lands in the list on screen.
 */
import type {
	AiSuggestion,
	AiSuggestionEntityType,
	AiSuggestionSocketEvent,
	AiSuggestionStatus
} from '$lib/services/ai-suggestions.service';

/**
 * `review`, the default: what is left to look at, the open suggestions
 * and those of dry runs (which never become open).
 */
export type AiSuggestionInboxStatus = AiSuggestionStatus | 'all' | 'review';

const REVIEW_STATUSES: AiSuggestionStatus[] = ['open', 'dry_run'];

export interface AiSuggestionInboxFilters {
	status: AiSuggestionInboxStatus;
	workflowId: number | null;
	/** `none`: the suggestions about no entity. */
	entityType: AiSuggestionEntityType | 'none' | '';
	severity: string;
	mine: boolean;
}

export const AI_SUGGESTION_INBOX_DEFAULTS: AiSuggestionInboxFilters = {
	status: 'review',
	workflowId: null,
	entityType: '',
	severity: '',
	mine: false
};

export const AI_SUGGESTION_INBOX_STATUSES: AiSuggestionInboxStatus[] = [
	'review',
	'open',
	'dry_run',
	'accepted',
	'dismissed',
	'expired',
	'all'
];

export const AI_SUGGESTION_INBOX_STATUS_LABELS: Record<string, string> = {
	review: 'To review',
	all: 'All'
};

/** The `status` query parameter of a filter. */
export function aiSuggestionInboxStatusParam(status: AiSuggestionInboxStatus): string {
	return status === 'review' ? REVIEW_STATUSES.join(',') : status;
}

export const AI_SUGGESTION_SEVERITIES = ['critical', 'high', 'medium', 'low'];

/**
 * Whether the filters keep `s`. `mine` is left to the server (the
 * audience is not in the payload): a pushed suggestion reached this
 * user, so it is addressed to them or to nobody.
 */
export function aiSuggestionInboxMatches(
	s: AiSuggestion,
	filters: AiSuggestionInboxFilters
): boolean {
	if (filters.status === 'review') {
		if (!REVIEW_STATUSES.includes(s.status)) return false;
	} else if (filters.status !== 'all' && s.status !== filters.status) return false;
	if (filters.workflowId !== null && s.workflow_id !== filters.workflowId) return false;
	if (filters.entityType === 'none' && s.entity_type) return false;
	if (filters.entityType && filters.entityType !== 'none' && s.entity_type !== filters.entityType) {
		return false;
	}
	if (filters.severity && s.severity !== filters.severity) return false;
	return true;
}

/** Newest first, by creation date then id. */
function newestFirst(a: AiSuggestion, b: AiSuggestion): number {
	const at = a.created_at ? Date.parse(a.created_at) : 0;
	const bt = b.created_at ? Date.parse(b.created_at) : 0;
	return bt - at || b.id - a.id;
}

/**
 * Applies a pushed suggestion to the list on screen. A known one is
 * updated in place (even if it no longer matches, so it does not vanish
 * under the cursor right after Accept); a new one is added when it
 * matches. Pushes never carry the answer / result: those from the REST
 * view are kept. Returns the same array when nothing changed.
 */
export function aiSuggestionInboxApply(
	list: AiSuggestion[],
	event: AiSuggestionSocketEvent | null | undefined,
	filters: AiSuggestionInboxFilters
): AiSuggestion[] {
	const s = event?.suggestion;
	if (!s || typeof s.id !== 'number') return list;
	if (event.action !== 'created' && event.action !== 'updated') return list;
	const index = list.findIndex((o) => o.id === s.id);
	if (index >= 0) {
		const previous = list[index];
		const merged: AiSuggestion = {
			...s,
			answer: s.answer ?? previous.answer,
			result: s.result ?? previous.result
		};
		const next = list.slice();
		next[index] = merged;
		return next;
	}
	if (!aiSuggestionInboxMatches(s, filters)) return list;
	return [...list, s].sort(newestFirst);
}

/** Workflow filter choices, from the suggestions loaded so far. */
export function aiSuggestionInboxWorkflows(
	list: AiSuggestion[],
	known: Array<{ id: number; name: string }> = []
): Array<{ id: number; name: string }> {
	const byId = new Map(known.map((w) => [w.id, w.name]));
	for (const s of list) {
		if (typeof s.workflow_id === 'number' && !byId.has(s.workflow_id)) {
			byId.set(s.workflow_id, s.workflow_name || `Workflow #${s.workflow_id}`);
		}
	}
	return [...byId].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
}
