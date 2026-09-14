import { describe, expect, it } from 'vitest';

import {
	appendClause,
	appendExpression,
	groupedTextOf,
	hasLooseAlternation,
	removeNode,
	splitConjuncts,
	textOf,
	tightenAlternation
} from '../edit';
import { parseLucene, topLevelConjuncts } from '../parse';

/**
 * These back the chip bar's × button. Dropping one chip has to leave the
 * rest of the expression exactly as it was typed — and, in particular, has
 * to leave it parseable.
 */

const conjuncts = (source: string) => topLevelConjuncts(parseLucene(source).ast);

/** Remove the nth top-level conjunct, the way the chip bar does. */
const drop = (source: string, index: number) => removeNode(source, conjuncts(source)[index]);

describe('textOf', () => {
	it('returns the characters a node was parsed from', () => {
		const source = 'status:New title:"a  b"';

		expect(conjuncts(source).map((node) => textOf(source, node))).toEqual([
			'status:New',
			'title:"a  b"'
		]);
	});

	it('spans the parentheses a group was written inside', () => {
		const source = '(a OR b) tag:phishing';

		expect(textOf(source, conjuncts(source)[0])).toBe('(a OR b)');
	});

	it('spans the operator of a negation', () => {
		const source = 'severity:High -status:Closed';

		expect(textOf(source, conjuncts(source)[1])).toBe('-status:Closed');
	});
});

describe('groupedTextOf', () => {
	it('parenthesises a bare alternation', () => {
		const source = 'a OR b';

		expect(groupedTextOf(source, conjuncts(source)[0])).toBe('(a OR b)');
	});

	it('leaves an alternation that already has its own parentheses', () => {
		const source = '(a OR b)';

		expect(groupedTextOf(source, conjuncts(source)[0])).toBe('(a OR b)');
	});

	it('leaves everything else alone', () => {
		const source = 'status:New';

		expect(groupedTextOf(source, conjuncts(source)[0])).toBe('status:New');
	});
});

describe('removeNode', () => {
	it('removes the first conjunct', () => {
		expect(drop('status:New severity:High', 0)).toBe('severity:High');
	});

	it('removes the last conjunct', () => {
		expect(drop('status:New severity:High', 1)).toBe('status:New');
	});

	it('removes the only conjunct', () => {
		expect(drop('status:New', 0)).toBe('');
	});

	it('takes the joining AND with it', () => {
		expect(drop('a AND b AND c', 1)).toBe('a AND c');
	});

	it('takes a leading AND when the removed clause is last', () => {
		expect(drop('a AND b', 1)).toBe('a');
	});

	it('leaves whitespace inside a phrase alone', () => {
		expect(drop('status:New title:"two  spaces"', 0)).toBe('title:"two  spaces"');
	});

	it('leaves an expression that still parses', () => {
		const next = drop('(a OR b) status:New tag:phishing', 1);

		expect(next).toBe('(a OR b) tag:phishing');
		expect(parseLucene(next).diagnostics).toEqual([]);
	});
});

describe('appendClause', () => {
	it('joins with a single space', () => {
		expect(appendClause('status:New', 'owner:me')).toBe('status:New owner:me');
	});

	it('is the clause alone when there is nothing to append to', () => {
		expect(appendClause('   ', 'owner:me')).toBe('owner:me');
	});

	it('is the expression alone when there is nothing to append', () => {
		expect(appendClause(' status:New ', '')).toBe('status:New');
	});
});

describe('appendExpression', () => {
	it('joins two ordinary conditions with a space', () => {
		expect(appendExpression('status:New', 'owner:me')).toBe('status:New owner:me');
	});

	it('parenthesises an alternation being appended', () => {
		// Without the brackets this reassociates into
		// `(status:New AND a) OR b`, which matches alerts neither half of the
		// expression asked for.
		expect(appendExpression('status:New', 'a OR b')).toBe('status:New (a OR b)');
	});

	it('parenthesises an alternation being appended *to*', () => {
		// The same mistake from the other side, and the more likely one: the
		// alternation was typed first and the analyst is now narrowing it.
		expect(appendExpression('a OR b', 'status:New')).toBe('(a OR b) status:New');
	});

	it('does not stack brackets on an alternation that has its own', () => {
		expect(appendExpression('(a OR b)', 'status:New')).toBe('(a OR b) status:New');
		expect(appendExpression('status:New', '(a OR b)')).toBe('status:New (a OR b)');
	});

	it('leaves conjunction and negation alone, which already bind tightly', () => {
		expect(appendExpression('status:New', 'a AND b')).toBe('status:New a AND b');
		expect(appendExpression('status:New', 'NOT severity:Low')).toBe('status:New NOT severity:Low');
		expect(appendExpression('status:New', '-severity:Low')).toBe('status:New -severity:Low');
	});

	it('brackets nothing when there is only one side', () => {
		// An alternation typed into an empty bar has nothing to reassociate
		// against, so it stays exactly as it was written. The brackets appear
		// later, at the moment they start to carry weight.
		expect(appendExpression('', 'a OR b')).toBe('a OR b');
		expect(appendExpression('a OR b', '  ')).toBe('a OR b');
	});

	it('passes text it could not parse through as written', () => {
		// Guessing at brackets for a shape we did not understand is the same
		// silent rewrite in the other direction. The server refuses it either
		// way, and the analyst sees back what they typed.
		expect(appendExpression('status:New', 'foo(')).toBe('status:New foo(');
	});

	it('always produces a narrowing, whatever the two sides are', () => {
		// The invariant behind all of the above: joining two expressions can
		// only ever add a condition. If the root of the result is an `or`,
		// something widened.
		const sides = ['status:New', 'a OR b', '(a OR b)', 'x AND y', 'NOT severity:Low'];

		for (const head of sides) {
			for (const tail of sides) {
				const joined = appendExpression(head, tail);
				const { ast, diagnostics } = parseLucene(joined);

				expect(diagnostics, joined).toEqual([]);
				expect(ast?.type, joined).toBe('and');
			}
		}
	});
});

describe('hasLooseAlternation', () => {
	it('reports an OR that took the conditions in front of it', () => {
		// The shape from the field report: five conditions typed one at a
		// time, then `OR malware` appended, and the whole thing collapses
		// into a single chip.
		expect(hasLooseAlternation('is:open owner:me title:"malware" OR malware')).toBe(true);
	});

	it('says nothing about an alternation that swallowed nothing', () => {
		// One condition either way, so the single chip is no surprise.
		expect(hasLooseAlternation('a OR b')).toBe(false);
	});

	it('says nothing once the alternation is bracketed', () => {
		expect(hasLooseAlternation('is:open (title:malware OR malware)')).toBe(false);
		// Bracketing the whole thing does not change how it binds, but it
		// does mean the analyst wrote it deliberately.
		expect(hasLooseAlternation('(is:open title:malware OR malware)')).toBe(false);
	});

	it('says nothing about an expression with no OR in it', () => {
		expect(hasLooseAlternation('is:open owner:me')).toBe(false);
		expect(hasLooseAlternation('')).toBe(false);
	});

	it('says nothing about an expression that does not parse', () => {
		expect(hasLooseAlternation('is:open OR (')).toBe(false);
	});
});

describe('tightenAlternation', () => {
	it('binds the alternation to the condition in front of it', () => {
		expect(tightenAlternation('is:open owner:me description:rewrw OR malware')).toBe(
			'is:open owner:me (description:rewrw OR malware)'
		);
	});

	it('leaves the rest of the text exactly as it was typed', () => {
		expect(tightenAlternation('title:"two  spaces" -is:open OR malware')).toBe(
			'title:"two  spaces" (-is:open OR malware)'
		);
	});

	it('produces an expression that chips one condition at a time again', () => {
		const tightened = tightenAlternation('is:open owner:me title:malware OR malware');

		expect(splitConjuncts(tightened ?? '').map((chip) => chip.text)).toEqual([
			'is:open',
			'owner:me',
			'(title:malware OR malware)'
		]);
	});

	it('declines when there is nothing to tighten', () => {
		expect(tightenAlternation('a OR b')).toBeNull();
		expect(tightenAlternation('is:open owner:me')).toBeNull();
	});

	it('declines when the intended reading is a guess', () => {
		// `a b OR c d` could mean `a (b OR c) d`, which reorders the text, or
		// something else entirely. Three or more alternatives are no clearer.
		expect(tightenAlternation('a b OR c d')).toBeNull();
		expect(tightenAlternation('a b OR c OR d')).toBeNull();
	});
});

describe('splitConjuncts', () => {
	const texts = (source: string) => splitConjuncts(source).map((chip) => chip.text);

	it('has nothing to show for an empty expression', () => {
		expect(splitConjuncts('')).toEqual([]);
		expect(splitConjuncts('   ')).toEqual([]);
	});

	it('splits on top-level conjunction, however it was written', () => {
		expect(texts('status:New severity:High')).toEqual(['status:New', 'severity:High']);
		// The spelled-out operator is not a chip of its own: two chips side
		// by side already read as "and", and a × on the word would mean
		// nothing.
		expect(texts('status:New AND severity:High')).toEqual(['status:New', 'severity:High']);
		expect(texts('status:New && severity:High')).toEqual(['status:New', 'severity:High']);
	});

	it('shows a dangling operator, which joins nothing', () => {
		expect(texts('status:New AND')).toEqual(['status:New', 'AND']);
	});

	it('keeps an alternation whole', () => {
		// Splitting `a OR b` in two would put a × on each half, and removing
		// either one turns "a or b" into a query that matches *more* rows.
		expect(texts('a OR b')).toEqual(['a OR b']);
		expect(texts('(a OR b) tag:phishing')).toEqual(['(a OR b)', 'tag:phishing']);
	});

	it('marks every piece of a well-formed expression as understood', () => {
		expect(splitConjuncts('status:New -severity:Low').map((chip) => chip.understood)).toEqual([
			true,
			true
		]);
	});

	it('still shows the tail the parser gave up on', () => {
		// The salvaged clauses come back as chips, but the rest is what the
		// backend was actually asked to run — if it vanished here the queue
		// would be filtered by something with no × anywhere on screen.
		const chips = splitConjuncts('status:New foo(');

		expect(chips.map((chip) => chip.text)).toEqual(['status:New', 'foo', '(']);
		expect(chips.map((chip) => chip.understood)).toEqual([true, true, false]);
	});

	it('shows an expression it cannot parse at all as one piece', () => {
		expect(splitConjuncts('((')).toEqual([
			{ text: '((', span: { from: 0, to: 2 }, understood: false }
		]);
	});

	it('reports spans that remove cleanly', () => {
		const source = 'status:New severity:High owner:me';
		const chips = splitConjuncts(source);

		expect(removeNode(source, chips[1].span)).toBe('status:New owner:me');
	});

	it('covers every non-whitespace character of the expression', () => {
		// The invariant the chip bar leans on: whatever the parser made of
		// the text, nothing the analyst committed is left unrepresented.
		// Joining operators are the one exception, so none appear here.
		const strip = (source: string) => source.replace(/\s/g, '');

		for (const source of [
			'status:New severity:High',
			'  a OR b   tag:phishing ',
			'status:New foo(',
			'title:"two  spaces" -is:open',
			'(('
		]) {
			const covered = splitConjuncts(source)
				.map((chip) => chip.text)
				.join('');

			expect(strip(covered)).toBe(strip(source));
		}
	});
});
