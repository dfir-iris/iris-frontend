/**
 * Deep links between the case timeline and the investigation graph.
 *
 * - graph → timeline: `/case/<id>/timeline?events=101,108` highlights the
 *   supporting events (a single one keeps the legacy `sharedEventId`).
 * - timeline → graph: `/case/<id>/graph?events=101,108` selects what those
 *   events link, `?focus=asset:12,ioc:3` selects the given nodes.
 */

const NODE_KEY = /^[a-z_]+:\d+$/;

/** Positive integer ids of a comma list, de-duplicated, in order. */
export const parseIdList = (raw: string | null | undefined): number[] => {
	if (!raw) return [];
	const out: number[] = [];
	for (const part of raw.split(',')) {
		const s = part.trim();
		if (!/^\d+$/.test(s)) continue;
		const n = Number(s);
		if (n > 0 && !out.includes(n)) out.push(n);
	}
	return out;
};

/** Node keys (`kind:id`) of a comma list, de-duplicated, in order. */
export const parseKeyList = (raw: string | null | undefined): string[] => {
	if (!raw) return [];
	const out: string[] = [];
	for (const part of raw.split(',')) {
		const s = part.trim();
		if (NODE_KEY.test(s) && !out.includes(s)) out.push(s);
	}
	return out;
};

/** Event ids highlighted by a timeline URL (`sharedEventId` and `events`). */
export const highlightedEventIds = (params: URLSearchParams): number[] => {
	const ids = parseIdList(params.get('sharedEventId'));
	for (const id of parseIdList(params.get('events'))) if (!ids.includes(id)) ids.push(id);
	return ids;
};

export const timelineEventsUrl = (caseId: number, eventIds: number[]) => {
	const ids = [...new Set(eventIds)];
	if (ids.length === 1) return `/case/${caseId}/timeline?sharedEventId=${ids[0]}`;
	return ids.length
		? `/case/${caseId}/timeline?events=${ids.join(',')}`
		: `/case/${caseId}/timeline`;
};

export const graphUrl = (caseId: number, target: { focus?: string[]; events?: number[] } = {}) => {
	const params: string[] = [];
	if (target.focus?.length) params.push(`focus=${[...new Set(target.focus)].join(',')}`);
	if (target.events?.length) params.push(`events=${[...new Set(target.events)].join(',')}`);
	return `/case/${caseId}/graph${params.length ? `?${params.join('&')}` : ''}`;
};

export interface GraphLinkTarget {
	focus: string[];
	events: number[];
}

export const parseGraphLink = (params: URLSearchParams): GraphLinkTarget => ({
	focus: parseKeyList(params.get('focus')),
	events: parseIdList(params.get('events'))
});

interface LinkEdge {
	key: string;
	source: string;
	target: string;
	event_ids: number[];
}

interface LinkEvent {
	event_id: number;
	keys: string[];
}

/**
 * Nodes and edges a graph link points at: the focused nodes, plus for each
 * event its node (when drawn), the objects it links and the relations it
 * supports. Unknown keys are dropped.
 */
export const resolveGraphLink = (
	target: GraphLinkTarget,
	data: { nodeKeys: Set<string>; edges: LinkEdge[]; events: LinkEvent[] }
): { nodes: Set<string>; edges: Set<string> } => {
	const nodes = new Set<string>();
	const edges = new Set<string>();
	const add = (k: string) => {
		if (data.nodeKeys.has(k)) nodes.add(k);
	};
	target.focus.forEach(add);
	if (target.events.length) {
		const ids = new Set(target.events);
		for (const ev of data.events) {
			if (!ids.has(ev.event_id)) continue;
			add(`event:${ev.event_id}`);
			ev.keys.forEach(add);
		}
		for (const e of data.edges) {
			if (!e.event_ids.some((id) => ids.has(id))) continue;
			edges.add(e.key);
			add(e.source);
			add(e.target);
		}
	}
	return { nodes, edges };
};
