import { describe, expect, it } from 'vitest';
import type { AiSuggestion } from '$lib/services/ai-suggestions.service';
import {
	AI_SUGGESTION_INBOX_DEFAULTS,
	aiSuggestionInboxApply,
	aiSuggestionInboxFiltered,
	aiSuggestionInboxMatches,
	aiSuggestionInboxSections,
	aiSuggestionInboxStatusParam,
	aiSuggestionInboxWorkflows
} from '../ai-suggestion-inbox';

function suggestion(over: Partial<AiSuggestion> = {}): AiSuggestion {
	return {
		id: 1,
		uuid: 'u1',
		run_id: 1,
		run_uuid: 'r1',
		workflow_id: 3,
		workflow_name: 'Triage',
		entity_type: 'alert',
		entity_id: 7,
		entity_title: null,
		sub_entity: null,
		kind: 'generic_action',
		title: 'Do it',
		body: null,
		proposed_action: null,
		form_schema: null,
		related_refs: null,
		confidence: null,
		severity: 'high',
		status: 'open',
		created_at: '2026-10-01T10:00:00Z',
		resolved_at: null,
		resolved_by: null,
		resolution_note: null,
		can_accept: true,
		...over
	};
}

const filters = { ...AI_SUGGESTION_INBOX_DEFAULTS };

describe('aiSuggestionInboxMatches', () => {
	it('keeps open and dry-run suggestions by default', () => {
		expect(aiSuggestionInboxMatches(suggestion(), filters)).toBe(true);
		expect(aiSuggestionInboxMatches(suggestion({ status: 'dry_run' }), filters)).toBe(true);
		expect(aiSuggestionInboxMatches(suggestion({ status: 'accepted' }), filters)).toBe(false);
		const open = { ...filters, status: 'open' as const };
		expect(aiSuggestionInboxMatches(suggestion({ status: 'dry_run' }), open)).toBe(false);
		expect(
			aiSuggestionInboxMatches(suggestion({ status: 'accepted' }), { ...filters, status: 'all' })
		).toBe(true);
	});

	it('asks the server for every status the filter keeps', () => {
		expect(aiSuggestionInboxStatusParam('review')).toBe('open,dry_run');
		expect(aiSuggestionInboxStatusParam('dismissed')).toBe('dismissed');
		expect(aiSuggestionInboxStatusParam('all')).toBe('all');
	});

	it('filters on workflow, severity and entity type', () => {
		expect(aiSuggestionInboxMatches(suggestion(), { ...filters, workflowId: 4 })).toBe(false);
		expect(aiSuggestionInboxMatches(suggestion(), { ...filters, workflowId: 3 })).toBe(true);
		expect(aiSuggestionInboxMatches(suggestion(), { ...filters, severity: 'low' })).toBe(false);
		expect(aiSuggestionInboxMatches(suggestion(), { ...filters, entityType: 'case' })).toBe(false);
		expect(aiSuggestionInboxMatches(suggestion(), { ...filters, entityType: 'alert' })).toBe(true);
	});

	it('`none` keeps only the suggestions about no entity', () => {
		const loose = suggestion({ entity_type: null, entity_id: null });
		expect(aiSuggestionInboxMatches(loose, { ...filters, entityType: 'none' })).toBe(true);
		expect(aiSuggestionInboxMatches(suggestion(), { ...filters, entityType: 'none' })).toBe(false);
	});
});

describe('aiSuggestionInboxApply', () => {
	it('adds a matching new suggestion, newest first', () => {
		const old = suggestion({ id: 1, created_at: '2026-10-01T10:00:00Z' });
		const fresh = suggestion({ id: 2, created_at: '2026-10-02T10:00:00Z' });
		const next = aiSuggestionInboxApply([old], { action: 'created', suggestion: fresh }, filters);
		expect(next.map((s) => s.id)).toEqual([2, 1]);
	});

	it('ignores a new suggestion the filters drop', () => {
		const list = [suggestion()];
		const pushed = suggestion({ id: 2, status: 'dismissed' });
		expect(aiSuggestionInboxApply(list, { action: 'created', suggestion: pushed }, filters)).toBe(
			list
		);
	});

	it('adds a pushed dry-run suggestion to the default list', () => {
		const pushed = suggestion({ id: 2, status: 'dry_run' });
		const next = aiSuggestionInboxApply([], { action: 'created', suggestion: pushed }, filters);
		expect(next.map((s) => s.id)).toEqual([2]);
	});

	it('updates a listed one in place and keeps its answer', () => {
		const list = [suggestion({ answer: { a: 1 } })];
		const pushed = suggestion({ status: 'accepted' });
		const next = aiSuggestionInboxApply(list, { action: 'updated', suggestion: pushed }, filters);
		expect(next).toHaveLength(1);
		expect(next[0].status).toBe('accepted');
		expect(next[0].answer).toEqual({ a: 1 });
	});

	it('ignores malformed events', () => {
		const list = [suggestion()];
		expect(aiSuggestionInboxApply(list, null, filters)).toBe(list);
		expect(
			aiSuggestionInboxApply(
				list,
				{ action: 'deleted' as 'created', suggestion: suggestion({ id: 9 }) },
				filters
			)
		).toBe(list);
	});
});

describe('aiSuggestionInboxWorkflows', () => {
	it('merges the known workflows with those seen in the list', () => {
		const list = [
			suggestion({ workflow_id: 3, workflow_name: 'Triage' }),
			suggestion({ id: 2, workflow_id: 5, workflow_name: null }),
			suggestion({ id: 3, workflow_id: null })
		];
		expect(aiSuggestionInboxWorkflows(list, [{ id: 8, name: 'Alpha' }])).toEqual([
			{ id: 8, name: 'Alpha' },
			{ id: 3, name: 'Triage' },
			{ id: 5, name: 'Workflow #5' }
		]);
	});
});

describe('aiSuggestionInboxSections', () => {
	it('splits open, dry-run and resolved suggestions, in that order, keeping the list order', () => {
		const list = [
			suggestion({ id: 1, status: 'dry_run' }),
			suggestion({ id: 2, status: 'dismissed' }),
			suggestion({ id: 3, status: 'open' }),
			suggestion({ id: 4, status: 'dry_run' }),
			suggestion({ id: 5, status: 'accepted' })
		];
		expect(aiSuggestionInboxSections(list).map((s) => [s.key, s.items.map((i) => i.id)])).toEqual([
			['open', [3]],
			['dry_run', [1, 4]],
			['resolved', [2, 5]]
		]);
	});

	it('leaves the empty sections out', () => {
		expect(aiSuggestionInboxSections([suggestion()]).map((s) => s.key)).toEqual(['open']);
		expect(aiSuggestionInboxSections([])).toEqual([]);
	});
});

describe('aiSuggestionInboxFiltered', () => {
	it('is false only on the defaults', () => {
		expect(aiSuggestionInboxFiltered({ ...AI_SUGGESTION_INBOX_DEFAULTS })).toBe(false);
		expect(aiSuggestionInboxFiltered({ ...AI_SUGGESTION_INBOX_DEFAULTS, severity: 'high' })).toBe(
			true
		);
		expect(aiSuggestionInboxFiltered({ ...AI_SUGGESTION_INBOX_DEFAULTS, workflowId: 3 })).toBe(
			true
		);
	});
});
