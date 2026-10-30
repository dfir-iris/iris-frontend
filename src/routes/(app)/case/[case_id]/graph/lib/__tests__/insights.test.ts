import { describe, expect, it } from 'vitest';
import type { GraphGap, GraphSuggestion } from '$lib/types/resources/case-graph';
import {
	acceptOutcome,
	aiOutcome,
	explainNoteContent,
	explainNoteTitle,
	explainRequest,
	findNotesDirectory,
	gapCounts,
	groupSuggestions,
	isExplainableKey,
	pendingAiEdges,
	sortGaps,
	withoutSuggestions
} from '../insights';
import { edge } from './fixtures';

const sug = (key: string, kind: string, extra: Partial<GraphSuggestion> = {}): GraphSuggestion => ({
	key,
	kind: kind as GraphSuggestion['kind'],
	source: 'asset:1',
	target: 'ioc:2',
	relation: 'connected_to',
	directed: true,
	reason: 'r',
	event_ids: [],
	score: 50,
	...extra
});

const gap = (code: string, severity: GraphGap['severity']): GraphGap => ({
	code,
	severity,
	node_keys: [],
	edge_keys: [],
	message: code
});

describe('groupSuggestions', () => {
	it('groups by known kind order, keeps server order and drops empty groups', () => {
		const groups = groupSuggestions([
			sug('a', 'text_mention'),
			sug('b', 'ip_match'),
			sug('c', 'text_mention'),
			sug('d', 'future_kind')
		]);
		expect(groups.map((g) => g.kind)).toEqual(['ip_match', 'text_mention', 'future_kind']);
		expect(groups[1].items.map((s) => s.key)).toEqual(['a', 'c']);
		expect(groups[2].label).toBe('future kind');
	});

	it('returns nothing for an empty list', () => {
		expect(groupSuggestions([])).toEqual([]);
	});
});

describe('withoutSuggestions / acceptOutcome', () => {
	it('drops the given keys', () => {
		const list = [sug('a', 'ip_match'), sug('b', 'ip_match'), sug('c', 'ip_match')];
		expect(withoutSuggestions(list, ['a', 'c']).map((s) => s.key)).toEqual(['b']);
	});

	it('describes the outcome', () => {
		expect(acceptOutcome(1, 1, 0)).toBe('Relation created');
		expect(acceptOutcome(3, 3, 0)).toBe('3 relations created');
		expect(acceptOutcome(3, 2, 1)).toBe(
			'2 relations created, 1 suggestion was no longer current (refreshed)'
		);
		expect(acceptOutcome(2, 0, 2)).toBe(
			'0 relations created, 2 suggestions were no longer current (refreshed)'
		);
	});
});

describe('AI proposals', () => {
	it('keeps stored pending AI edges, most confident first', () => {
		const edges = [
			edge('asset:1', 'ioc:1', { id: 1, origin: 'ai', review_state: 'pending', confidence: 40 }),
			edge('asset:1', 'ioc:2', { id: 2, origin: 'ai', review_state: 'pending', confidence: 90 }),
			edge('asset:1', 'ioc:3', { id: 3, origin: 'ai', review_state: 'accepted' }),
			edge('asset:1', 'ioc:4', { id: 4, review_state: 'pending' }),
			edge('asset:1', 'ioc:5', { id: 5, origin: 'ai', review_state: 'pending' }),
			edge('asset:1', 'ioc:6', { origin: 'ai', review_state: 'pending' })
		];
		expect(pendingAiEdges(edges).map((e) => e.key)).toEqual(['e:2', 'e:1', 'e:5']);
	});

	it('summarises a run', () => {
		expect(aiOutcome({ edges: [], proposed: 0, dropped: 0 })).toBe(
			'The model proposed no new relation.'
		);
		const one = edge('asset:1', 'ioc:1', { id: 1 });
		expect(aiOutcome({ edges: [one], proposed: 1, dropped: 0 })).toBe(
			'1 relation proposed, 1 to review.'
		);
		expect(aiOutcome({ edges: [one], proposed: 3, dropped: 2 })).toBe(
			'3 relations proposed, 1 to review, 2 dropped (unknown objects, duplicates or existing relations).'
		);
	});
});

describe('gaps', () => {
	it('sorts by severity, stable inside', () => {
		const sorted = sortGaps([
			gap('a', 'low'),
			gap('b', 'high'),
			gap('c', 'medium'),
			gap('d', 'high'),
			gap('e', 'weird' as GraphGap['severity'])
		]);
		expect(sorted.map((g) => g.code)).toEqual(['b', 'd', 'c', 'a', 'e']);
	});

	it('counts by severity', () => {
		expect(gapCounts([gap('a', 'low'), gap('b', 'high'), gap('c', 'high')])).toEqual({
			high: 2,
			medium: 0,
			low: 1
		});
	});
});

describe('explainRequest', () => {
	const ctx = {
		selection: ['asset:1', 'event:3', 'ioc:2', 'asset:1'],
		canvas: ['node:4', 'task:5'],
		viewId: null
	};

	it('knows the explainable kinds', () => {
		expect(isExplainableKey('asset:1')).toBe(true);
		expect(isExplainableKey('node:1')).toBe(true);
		expect(isExplainableKey('event:1')).toBe(false);
	});

	it('explains the whole graph without a body', () => {
		expect(explainRequest('case', ctx)).toEqual({ body: {}, left: 0 });
	});

	it('needs a loaded view', () => {
		expect(explainRequest('view', ctx).error).toBeTruthy();
		expect(explainRequest('view', { ...ctx, viewId: 7 })).toEqual({
			body: { view_id: 7 },
			left: 0
		});
	});

	it('filters the selection and the canvas', () => {
		expect(explainRequest('selection', ctx)).toEqual({
			body: { node_keys: ['asset:1', 'ioc:2'] },
			left: 1
		});
		expect(explainRequest('canvas', ctx)).toEqual({ body: { node_keys: ['node:4'] }, left: 1 });
	});

	it('errors when nothing is explainable', () => {
		expect(explainRequest('selection', { ...ctx, selection: ['event:1'] }).error).toMatch(/Select/);
		expect(explainRequest('canvas', { ...ctx, canvas: [] }).error).toMatch(/drawn/);
	});
});

describe('explanation notes', () => {
	it('finds the top-level, non-mirror directory case-insensitively', () => {
		const folders = [
			{ id: 1, name: 'Investigation graph', parent_id: 3, mirror_war_room_id: null },
			{ id: 2, name: 'investigation GRAPH ', parent_id: null, mirror_war_room_id: 9 },
			{ id: 4, name: ' Investigation Graph', parent_id: null, mirror_war_room_id: null }
		];
		expect(findNotesDirectory(folders)?.id).toBe(4);
		expect(findNotesDirectory(folders.slice(0, 2))).toBeNull();
	});

	it('titles and footers the note', () => {
		const at = new Date(2026, 9, 3, 9, 5);
		expect(explainNoteTitle('selection', at)).toBe(
			'Graph explanation — selection — 2026-10-03 09:05'
		);
		expect(explainNoteTitle('view', at, 'Lateral')).toBe(
			'Graph explanation — Lateral — 2026-10-03 09:05'
		);
		const content = explainNoteContent('  # Path\n', at, '/case/1/graph');
		expect(content.startsWith('# Path\n\n---')).toBe(true);
		expect(content).toContain('[investigation graph](/case/1/graph)');
		expect(content).toContain('2026-10-03 09:05');
	});
});
