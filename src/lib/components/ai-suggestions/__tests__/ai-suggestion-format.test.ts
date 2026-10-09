import { describe, it, expect } from 'vitest';
import {
	aiSuggestionAge,
	aiSuggestionAnswerBuild,
	aiSuggestionAnswerDefaults,
	aiSuggestionConfidence,
	aiSuggestionFieldOptions,
	aiSuggestionKind,
	aiSuggestionSnippet
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

	it('previews a markdown body on one line', () => {
		expect(
			aiSuggestionSnippet('## Why\n\n- **3/70** engines flag [it](https://x)\n```\ncode\n```\nDone')
		).toBe('Why 3/70 engines flag it Done');
		expect(aiSuggestionSnippet(null)).toBe('');
		expect(aiSuggestionSnippet('x'.repeat(500))).toHaveLength(240);
	});

	it('gives a compact age', () => {
		const now = Date.parse('2026-10-08T12:00:00Z');
		expect(aiSuggestionAge('2026-10-08T11:59:40Z', now)).toBe('now');
		expect(aiSuggestionAge('2026-10-08T11:55:00Z', now)).toBe('5m');
		// Offset-less server dates are UTC
		expect(aiSuggestionAge('2026-10-08T09:00:00', now)).toBe('3h');
		expect(aiSuggestionAge('2026-10-06T12:00:00Z', now)).toBe('2d');
		expect(aiSuggestionAge('2026-09-01T12:00:00Z', now)).not.toMatch(/d$/);
		expect(aiSuggestionAge(null, now)).toBe('');
	});
});
