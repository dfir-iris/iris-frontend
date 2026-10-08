import { describe, it, expect } from 'vitest';
import {
	aiSuggestionAnswerBuild,
	aiSuggestionAnswerDefaults,
	aiSuggestionConfidence,
	aiSuggestionFieldOptions,
	aiSuggestionKind
} from '../ai-suggestion-format';
import type { AiSuggestionFormField } from '$lib/services/ai-suggestions.service';

const fields: AiSuggestionFormField[] = [
	{ name: 'host', label: 'Host', type: 'text', required: true },
	{ name: 'why', type: 'textarea' },
	{ name: 'count', type: 'number', required: true },
	{ name: 'isolate', type: 'boolean' },
	{ name: 'tier', type: 'select', options: ['t1', { value: 't2', label: 'Tier 2' }] }
];

describe('ai-suggestion-format', () => {
	it('labels kinds, with a fallback', () => {
		expect(aiSuggestionKind('info_request').label).toBe('Question for you');
		expect(aiSuggestionKind('custom_kind').label).toBe('custom_kind');
	});

	it('formats confidence', () => {
		expect(aiSuggestionConfidence(0.834)).toBe('83%');
		expect(aiSuggestionConfidence(72)).toBe('72%');
		expect(aiSuggestionConfidence(null)).toBeNull();
	});

	it('normalises select options', () => {
		expect(aiSuggestionFieldOptions(fields[4])).toEqual([
			{ value: 't1', label: 't1' },
			{ value: 't2', label: 'Tier 2' }
		]);
	});

	it('flags missing required fields', () => {
		const { errors } = aiSuggestionAnswerBuild(fields, aiSuggestionAnswerDefaults(fields));
		expect(errors).toEqual({ host: 'Required', count: 'Required' });
	});

	it('builds a typed answer', () => {
		const { answer, errors } = aiSuggestionAnswerBuild(fields, {
			host: 'dc01',
			why: '',
			count: '3',
			isolate: true,
			tier: 't2'
		});
		expect(errors).toEqual({});
		expect(answer).toEqual({ host: 'dc01', why: null, count: 3, isolate: true, tier: 't2' });
	});

	it('rejects a non-numeric number', () => {
		const { errors } = aiSuggestionAnswerBuild(fields, { host: 'x', count: 'abc' });
		expect(errors.count).toBe('Must be a number');
	});
});
