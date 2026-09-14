import { describe, expect, it } from 'vitest';

import { applySuggestion, caretContext } from '../caret';

/**
 * What the bar offers, and what picking it does to the text. The caret
 * position matters as much as the text: accepting a field name has to land
 * the caret where the value goes, or the value list never comes up.
 */

/** Read a fixture with `|` marking the caret, the way it reads on screen. */
const at = (fixture: string) => {
	const caret = fixture.indexOf('|');
	return caretContext(fixture.replace('|', ''), caret);
};

describe('caretContext', () => {
	it('offers field names on a bare word', () => {
		expect(at('sta|')).toMatchObject({ kind: 'field', word: 'sta', from: 0, to: 3 });
	});

	it('offers field names again after a completed clause', () => {
		// The position the boolean operators are offered from: there is
		// something to join to, and nothing typed yet to filter on.
		expect(at('status:New |')).toMatchObject({ kind: 'field', word: '', from: 11, to: 11 });
	});

	it('offers values once the colon is typed', () => {
		expect(at('status:|')).toMatchObject({ kind: 'value', field: 'status', word: '' });
		expect(at('status:Ne|')).toMatchObject({ kind: 'value', field: 'status', word: 'Ne' });
	});

	it('treats a value separated by a space as free text instead', () => {
		// Which is what the backend does with it too — `status: New` is a
		// dangling field and a bare term, not one clause.
		expect(at('status: Ne|')).toMatchObject({ kind: 'field', word: 'Ne' });
	});
});

describe('applySuggestion', () => {
	it('follows a field name with a colon, ready for the value', () => {
		const context = at('sta|');

		expect(applySuggestion('sta', context, 'status')).toEqual({ text: 'status:', caret: 7 });
	});

	it('follows a value with a space, ready for the next clause', () => {
		const context = at('status:Ne|');

		expect(applySuggestion('status:Ne', context, 'New')).toEqual({
			text: 'status:New ',
			caret: 11
		});
	});

	it('reuses the space already there rather than doubling it', () => {
		const source = 'status:Ne severity:High';
		const context = at('status:Ne| severity:High');

		expect(applySuggestion(source, context, 'New')).toEqual({
			text: 'status:New severity:High',
			caret: 11
		});
	});

	it('follows an operator with a space, not a colon', () => {
		// An operator is offered where a field name is, because half-typed
		// they look alike — but `OR:` is not a clause.
		const context = at('status:New o|');

		expect(applySuggestion('status:New o', context, 'OR', ' ')).toEqual({
			text: 'status:New OR ',
			caret: 14
		});
	});

	it('inserts an operator into empty space without disturbing what follows', () => {
		const source = 'status:New  severity:High';
		const context = at('status:New | severity:High');

		expect(applySuggestion(source, context, 'OR', ' ')).toEqual({
			text: 'status:New OR severity:High',
			caret: 14
		});
	});
});
