import { describe, it, expect, vi, beforeEach } from 'vitest';

const socketHandlers = new Map<string, (payload: unknown) => void>();

vi.mock('$lib/stores/notifications.store', () => ({
	notifications: {
		onSocketEvent: vi.fn((event: string, handler: (payload: unknown) => void) => {
			socketHandlers.set(event, handler);
			return () => socketHandlers.delete(event);
		})
	}
}));

vi.mock('$lib/stores/toast.store', () => ({
	toast: vi.fn()
}));

vi.mock('$lib/stores/runtime-config.store.svelte', () => ({
	runtimeConfig: { state: { ai_workflows: { enabled: true } } }
}));

vi.mock('$lib/services/ai-suggestions.service', () => ({
	AiSuggestionsService: { list: vi.fn() }
}));

import {
	aiSuggestions,
	aiSuggestionsEnabled,
	aiSuggestionsEntityHref,
	aiSuggestionsKey,
	aiSuggestionsOpenCount,
	aiSuggestionsReduce,
	aiSuggestionsRunHref,
	aiSuggestionsToast,
	aiSuggestionsUpsert
} from '../ai-suggestions.store.svelte';
import { toast } from '$lib/stores/toast.store';
import { AiSuggestionsService, type AiSuggestion } from '$lib/services/ai-suggestions.service';

const mockList = AiSuggestionsService.list as unknown as ReturnType<typeof vi.fn>;
const mockToast = toast as unknown as ReturnType<typeof vi.fn>;

const make = (id: number, over: Partial<AiSuggestion> = {}): AiSuggestion => ({
	id,
	uuid: `u-${id}`,
	run_id: 1,
	run_uuid: 'run-1',
	workflow_id: 1,
	workflow_name: 'Triage',
	entity_type: 'alert',
	entity_id: 10,
	entity_title: 'Phishing',
	sub_entity: null,
	kind: 'generic_action',
	title: `s-${id}`,
	body: null,
	proposed_action: null,
	form_schema: null,
	related_refs: null,
	confidence: 0.8,
	severity: 'medium',
	status: 'open',
	created_at: `2026-10-0${id}T10:00:00`,
	resolved_at: null,
	resolved_by: null,
	resolution_note: null,
	answer: null,
	result: null,
	can_accept: true,
	...over
});

describe('ai-suggestions reducer', () => {
	it('ignores entities no panel loaded', () => {
		const state = {};
		expect(aiSuggestionsReduce(state, { action: 'created', suggestion: make(1) })).toBe(state);
	});

	it('prepends a created suggestion to a loaded entity, newest first', () => {
		const state = { [aiSuggestionsKey('alert', 10)]: [make(1)] };
		const next = aiSuggestionsReduce(state, { action: 'created', suggestion: make(2) });
		expect(next).not.toBe(state);
		expect(next['alert:10'].map((s) => s.id)).toEqual([2, 1]);
	});

	it('replaces an updated suggestion in place', () => {
		const state = { 'alert:10': [make(2), make(1)] };
		const next = aiSuggestionsReduce(state, {
			action: 'updated',
			suggestion: make(1, { status: 'accepted' })
		});
		expect(next['alert:10']).toHaveLength(2);
		expect(next['alert:10'].find((s) => s.id === 1)?.status).toBe('accepted');
	});

	it('keeps the answer and result a push does not carry', () => {
		const state = { 'alert:10': [make(1, { status: 'accepted', result: { case_id: 7 } })] };
		const next = aiSuggestionsReduce(state, {
			action: 'updated',
			suggestion: make(1, { status: 'accepted', result: null, answer: null })
		});
		expect(next['alert:10'][0].result).toEqual({ case_id: 7 });
	});

	it('does not duplicate a created event racing the REST load', () => {
		const state = { 'alert:10': [make(1)] };
		const next = aiSuggestionsReduce(state, { action: 'created', suggestion: make(1) });
		expect(next['alert:10']).toHaveLength(1);
	});

	it('keys by entity type and id', () => {
		const state = { 'case:10': [] as AiSuggestion[], 'alert:10': [] as AiSuggestion[] };
		const next = aiSuggestionsReduce(state, {
			action: 'created',
			suggestion: make(3, { entity_type: 'case' })
		});
		expect(next['case:10']).toHaveLength(1);
		expect(next['alert:10']).toHaveLength(0);
	});

	it('ignores malformed payloads and unknown actions', () => {
		const state = { 'alert:10': [] as AiSuggestion[] };
		expect(aiSuggestionsReduce(state, null)).toBe(state);
		expect(aiSuggestionsReduce(state, { action: 'created', suggestion: undefined as never })).toBe(
			state
		);
		expect(
			aiSuggestionsReduce(state, { action: 'created', suggestion: make(1, { entity_id: null }) })
		).toBe(state);
		expect(aiSuggestionsReduce(state, { action: 'deleted' as never, suggestion: make(1) })).toBe(
			state
		);
	});

	it('sorts by created_at then id', () => {
		const list = aiSuggestionsUpsert([make(1)], make(5, { created_at: null }));
		expect(list.map((s) => s.id)).toEqual([1, 5]);
	});

	it('counts open ones', () => {
		expect(aiSuggestionsOpenCount([make(1), make(2, { status: 'dismissed' })])).toBe(1);
		expect(aiSuggestionsOpenCount(undefined)).toBe(0);
	});
});

describe('ai-suggestions toast + links', () => {
	it('builds entity routes', () => {
		expect(aiSuggestionsEntityHref('alert', 1)).toBe('/alerts/1');
		expect(aiSuggestionsEntityHref('alert_cluster', 2)).toBe('/alert-clusters/2');
		expect(aiSuggestionsEntityHref('case', 3)).toBe('/case/3');
		expect(aiSuggestionsEntityHref('war_room', 4)).toBe('/war-rooms/4');
		expect(aiSuggestionsEntityHref('other', 4)).toBeNull();
		expect(aiSuggestionsEntityHref('case', null)).toBeNull();
	});

	it('refuses ids that are not positive safe integers', () => {
		for (const id of [0, -1, 1.5, NaN, Infinity, 2 ** 53, '3', '3/../../logout', {}]) {
			expect(aiSuggestionsEntityHref('case', id), String(id)).toBeNull();
		}
	});

	it('drops the toast link when the socket event carries a bad id', () => {
		const t = aiSuggestionsToast({
			action: 'created',
			suggestion: make(1, { entity_id: '10/../../settings' as unknown as number })
		});
		expect(t).not.toBeNull();
		expect(t?.link).toBeUndefined();
	});

	it('builds run routes from well-formed UUIDs only', () => {
		expect(aiSuggestionsRunHref('0b5c0f3e-1111-4222-8333-444455556666')).toBe(
			'/settings/ai-workflows/runs/0b5c0f3e-1111-4222-8333-444455556666'
		);
		for (const v of ['run-1', '../x', '//evil.example', null, undefined, 3]) {
			expect(aiSuggestionsRunHref(v), String(v)).toBeNull();
		}
	});

	it('toasts created open suggestions with a link', () => {
		const t = aiSuggestionsToast({ action: 'created', suggestion: make(1) });
		expect(t?.title).toBe('AI suggestion: s-1');
		expect(t?.description).toBe('Alert #10 — Phishing');
		expect(t?.link).toEqual({ href: '/alerts/10', label: 'Open alert' });
	});

	it('stays quiet for updates and non-open suggestions', () => {
		expect(aiSuggestionsToast({ action: 'updated', suggestion: make(1) })).toBeNull();
		expect(
			aiSuggestionsToast({ action: 'created', suggestion: make(1, { status: 'dry_run' }) })
		).toBeNull();
		expect(aiSuggestionsToast(null)).toBeNull();
	});

	it('reads the runtime flag', () => {
		expect(aiSuggestionsEnabled()).toBe(true);
	});
});

describe('ai-suggestions store', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		aiSuggestions.reset();
	});

	it('loads an entity and applies socket events to it', async () => {
		mockList.mockResolvedValueOnce({ ok: true, status: 200, data: [make(1)] });
		await aiSuggestions.load('alert', 10);
		expect(mockList).toHaveBeenCalledWith({ entity_type: 'alert', entity_id: 10, status: 'all' });
		expect(aiSuggestions.list('alert', 10)).toHaveLength(1);

		aiSuggestions.start();
		socketHandlers.get('ai_suggestion')?.({ action: 'created', suggestion: make(2) });
		expect(aiSuggestions.list('alert', 10).map((s) => s.id)).toEqual([2, 1]);
		expect(mockToast).toHaveBeenCalledTimes(1);

		socketHandlers.get('ai_suggestion')?.({
			action: 'updated',
			suggestion: make(2, { status: 'dismissed' })
		});
		expect(aiSuggestions.list('alert', 10)[0].status).toBe('dismissed');
		expect(mockToast).toHaveBeenCalledTimes(1);
		aiSuggestions.stop();
	});

	it('records load errors', async () => {
		mockList.mockResolvedValueOnce({
			ok: false,
			status: 500,
			data: null,
			error: { message: 'boom', type: 'x', status: 500 }
		});
		await aiSuggestions.load('case', 3);
		expect(aiSuggestions.error('case', 3)).toBe('boom');
		expect(aiSuggestions.isLoading('case', 3)).toBe(false);
	});

	it('merges an accepted suggestion', async () => {
		mockList.mockResolvedValueOnce({ ok: true, status: 200, data: [make(1)] });
		await aiSuggestions.load('alert', 10);
		aiSuggestions.apply(make(1, { status: 'accepted' }));
		expect(aiSuggestions.list('alert', 10)[0].status).toBe('accepted');
	});
});
