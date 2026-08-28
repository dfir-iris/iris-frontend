import { describe, it, expect } from 'vitest';
import { toPlainSnippet } from '../text';

describe('toPlainSnippet', () => {
	// ── happy-path markdown stripping ────────────────────────────────────────

	it('returns plain text unchanged when there is no markdown syntax', () => {
		expect(toPlainSnippet('Hello world')).toBe('Hello world');
	});

	it('strips ATX headings (# through ######)', () => {
		expect(toPlainSnippet('# Title')).toBe('Title');
		expect(toPlainSnippet('## Section')).toBe('Section');
		expect(toPlainSnippet('###### Deep')).toBe('Deep');
	});

	it('strips bold and italic markers (* and _)', () => {
		expect(toPlainSnippet('**bold** text')).toBe('bold text');
		expect(toPlainSnippet('_italic_ text')).toBe('italic text');
		expect(toPlainSnippet('***bold-italic***')).toBe('bold-italic');
	});

	it('strips strikethrough (~~)', () => {
		expect(toPlainSnippet('~~deleted~~')).toBe('deleted');
	});

	it('strips inline code backticks and preserves the code text', () => {
		expect(toPlainSnippet('run `npm install` first')).toBe('run npm install first');
	});

	it('replaces fenced code blocks with a space', () => {
		const md = 'Look:\n```\nconst x = 1;\n```\ndone';
		// code block becomes a space; surrounding whitespace is collapsed
		expect(toPlainSnippet(md)).toBe('Look: done');
	});

	it('strips image syntax and replaces with a space', () => {
		expect(toPlainSnippet('before ![alt](http://example.com/img.png) after')).toBe('before after');
	});

	it('keeps link text and drops the URL', () => {
		expect(toPlainSnippet('[click here](https://example.com)')).toBe('click here');
	});

	it('strips blockquote markers', () => {
		expect(toPlainSnippet('> A quoted line')).toBe('A quoted line');
	});

	it('strips unordered list markers (-, *, +)', () => {
		expect(toPlainSnippet('- item one')).toBe('item one');
		expect(toPlainSnippet('* item two')).toBe('item two');
		expect(toPlainSnippet('+ item three')).toBe('item three');
	});

	it('collapses multiple whitespace characters into a single space', () => {
		expect(toPlainSnippet('word1   \t  word2')).toBe('word1 word2');
	});

	it('trims leading and trailing whitespace from the result', () => {
		expect(toPlainSnippet('  hello  ')).toBe('hello');
	});

	// ── truncation ────────────────────────────────────────────────────────────

	it('returns text as-is when it is exactly at the default 120-char limit', () => {
		const exactly120 = 'a'.repeat(120);
		expect(toPlainSnippet(exactly120)).toBe(exactly120);
	});

	it('truncates at 120 chars by default and appends the ellipsis character', () => {
		const long = 'a'.repeat(200);
		const result = toPlainSnippet(long);
		// Result must end with the ellipsis and be 120 chars total
		expect(result.endsWith('…')).toBe(true);
		expect([...result].length).toBe(120);
	});

	it('respects a custom max value', () => {
		const text = 'Hello, world!';
		const result = toPlainSnippet(text, 5);
		expect(result.endsWith('…')).toBe(true);
		expect([...result].length).toBe(5);
	});

	it('does not truncate when text is shorter than custom max', () => {
		expect(toPlainSnippet('Hi', 10)).toBe('Hi');
	});

	it('trims trailing space before appending the ellipsis', () => {
		// Construct text that, when sliced at max-1, ends with a space
		const text = 'abc def ghi'; // 11 chars; with max=8 slice is "abc def" (7) → trim → "abc def"
		const result = toPlainSnippet(text, 8);
		expect(result).toBe('abc def…');
	});

	// ── edge cases ────────────────────────────────────────────────────────────

	it('returns an empty string for an empty input', () => {
		expect(toPlainSnippet('')).toBe('');
	});

	it('returns an empty string when input contains only whitespace', () => {
		expect(toPlainSnippet('   \t\n  ')).toBe('');
	});

	it('handles a mix of heading, bold, link, and code in a single string', () => {
		const md = '## Overview\n**Key point**: see [docs]( https://example.com) and `code`.';
		const result = toPlainSnippet(md);
		expect(result).toBe('Overview Key point: see docs and code.');
	});
});
