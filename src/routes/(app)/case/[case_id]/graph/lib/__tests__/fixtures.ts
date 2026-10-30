import type { GraphEdge, GraphNode } from '$lib/types/resources/case-graph';

export const node = (key: string, extra: Partial<GraphNode> = {}): GraphNode => {
	const [kind, id] = key.split(':');
	return {
		key,
		kind: kind as GraphNode['kind'],
		id: Number(id),
		label: key,
		...extra
	};
};

let derivedSeq = 0;

export const edge = (source: string, target: string, extra: Partial<GraphEdge> = {}): GraphEdge => {
	const id = extra.id === undefined ? null : extra.id;
	return {
		key: id !== null ? `e:${id}` : `d:${source}>${target}#${derivedSeq++}`,
		id,
		source,
		target,
		relation: {
			id: 1,
			name: 'connected_to',
			label: 'Connected to',
			color: 'slate',
			line_style: 'solid'
		},
		directed: true,
		label: null,
		description: null,
		confidence: null,
		tlp: null,
		origin: id !== null ? 'manual' : 'event',
		review_state: 'accepted',
		first_seen: null,
		last_seen: null,
		event_ids: [],
		count: 1,
		editable: id !== null,
		...extra
	};
};
