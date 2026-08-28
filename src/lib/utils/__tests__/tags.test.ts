import { describe, it, expect } from 'vitest';
import { stringToTags, tagsToString, normalizeTags } from '../tags';
import type { Tag } from '$lib/types/resources/tag';

// ── stringToTags ─────────────────────────────────────────────────────────────

describe('stringToTags', () => {
	it('splits a comma-separated string into Tag objects', () => {
		const tags = stringToTags('alpha,beta,gamma');
		expect(tags).toHaveLength(3);
		expect(tags.map((t) => t.tag_title)).toEqual(['alpha', 'beta', 'gamma']);
	});

	it('assigns tag_id starting at -1000 and decrementing for each tag', () => {
		const tags = stringToTags('a,b,c');
		expect(tags[0].tag_id).toBe(-1000);
		expect(tags[1].tag_id).toBe(-1001);
		expect(tags[2].tag_id).toBe(-1002);
	});

	it('trims whitespace around each tag title', () => {
		const tags = stringToTags('  foo  ,  bar  ');
		expect(tags[0].tag_title).toBe('foo');
		expect(tags[1].tag_title).toBe('bar');
	});

	it('filters out empty entries caused by leading/trailing commas', () => {
		const tags = stringToTags(',alpha,,beta,');
		expect(tags).toHaveLength(2);
		expect(tags.map((t) => t.tag_title)).toEqual(['alpha', 'beta']);
	});

	it('returns an empty array for an empty string', () => {
		expect(stringToTags('')).toEqual([]);
	});

	it('returns an empty array for a whitespace-only string', () => {
		// A single space trims to '', which has length 0 and is filtered out
		expect(stringToTags('   ')).toEqual([]);
	});

	it('returns a single-element array for a string with no commas', () => {
		const tags = stringToTags('solo');
		expect(tags).toHaveLength(1);
		expect(tags[0]).toEqual({ tag_id: -1000, tag_title: 'solo' });
	});
});

// ── tagsToString ─────────────────────────────────────────────────────────────

describe('tagsToString', () => {
	it('joins tag titles with a comma and no spaces', () => {
		const tags: Tag[] = [
			{ tag_id: 1, tag_title: 'alpha' },
			{ tag_id: 2, tag_title: 'beta' },
			{ tag_id: 3, tag_title: 'gamma' }
		];
		expect(tagsToString(tags)).toBe('alpha,beta,gamma');
	});

	it('returns an empty string for an empty array', () => {
		expect(tagsToString([])).toBe('');
	});

	it('returns the single title without a trailing comma for a one-element array', () => {
		expect(tagsToString([{ tag_id: 1, tag_title: 'only' }])).toBe('only');
	});

	it('is the inverse of stringToTags for a round-trip', () => {
		const original = 'foo,bar,baz';
		expect(tagsToString(stringToTags(original))).toBe(original);
	});
});

// ── normalizeTags ─────────────────────────────────────────────────────────────

describe('normalizeTags', () => {
	it('returns an empty array for null', () => {
		expect(normalizeTags(null)).toEqual([]);
	});

	it('returns an empty array for undefined', () => {
		expect(normalizeTags(undefined)).toEqual([]);
	});

	it('returns an empty array for an empty string', () => {
		expect(normalizeTags('')).toEqual([]);
	});

	it('delegates to stringToTags when given a string', () => {
		const result = normalizeTags('x,y');
		expect(result).toEqual(stringToTags('x,y'));
	});

	it('passes a Tag array through unchanged', () => {
		const tags: Tag[] = [
			{ tag_id: 10, tag_title: 'existing' },
			{ tag_id: 20, tag_title: 'tags' }
		];
		expect(normalizeTags(tags)).toBe(tags); // same reference
	});

	it('handles a Tag array with a single element', () => {
		const tags: Tag[] = [{ tag_id: 5, tag_title: 'lone' }];
		expect(normalizeTags(tags)).toEqual([{ tag_id: 5, tag_title: 'lone' }]);
	});
});
