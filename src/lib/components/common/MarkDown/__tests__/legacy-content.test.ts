/**
 * Mark pseudo-XML the collab renderer used to flush to the source column
 * (`\<link href="…">x\</link>`, `\<bold>x\</bold>`). Same cases as
 * `TestRepairFlushedMarkMarkup` in the backend's `test_render.py`, which
 * runs the mirrored pass before re-seeding a document.
 */
import { describe, expect, it } from 'vitest';
import { normalizeLegacyContent } from '../legacy-content';

describe('normalizeLegacyContent — flushed mark markup', () => {
	it('leaves text without markup alone', () => {
		expect(normalizeLegacyContent('no markup here')).toBe('no markup here');
	});

	it('repairs bold, keeping a leading space outside the markers', () => {
		expect(normalizeLegacyContent('a\\<bold> b\\</bold>')).toBe('a **b**');
	});

	it('repairs nested marks', () => {
		expect(normalizeLegacyContent('\\<bold>\\<italic>b\\</italic>\\</bold>')).toBe('***b***');
	});

	it('unescapes inline code', () => {
		expect(normalizeLegacyContent('\\<code>a\\_b\\</code>')).toBe('`a_b`');
	});

	it('keeps the text of an underline', () => {
		expect(normalizeLegacyContent('\\<underline>u\\</underline>')).toBe('u');
	});

	it('repairs a link with escaped attributes and a null title', () => {
		const md = '\\<link target="\\_blank" href="https://x/a\\_b" title="null">f\\</link>';
		expect(normalizeLegacyContent(md)).toBe('[f](https://x/a_b)');
	});

	it('labels an emptied datastore chip link with its title', () => {
		const md =
			'\\<link rel="noopener noreferrer nofollow" target="\\_blank" title="HFm8.png" ' +
			'href="https://iris.i/api/v2/cases/3465/datastore/files/6771" ' +
			'class="text-blue-500 underline inline-flex"> \\</link>';
		expect(normalizeLegacyContent(md)).toBe(
			'[HFm8.png](https://iris.i/api/v2/cases/3465/datastore/files/6771 "HFm8.png")'
		);
	});

	it('repairs unescaped markup', () => {
		expect(normalizeLegacyContent('<link href="u">f</link>')).toBe('[f](u)');
	});

	it('leaves other HTML alone', () => {
		expect(normalizeLegacyContent('\\<span>x\\</span>')).toBe('\\<span>x\\</span>');
	});
});
