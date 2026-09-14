import { describe, expect, it } from 'vitest';

import { applySuggestion, caretContext, quoteIfNeeded } from '../caret';
import { clausesOf, parseLucene, topLevelConjuncts } from '../parse';
import type { ClauseNode, ComparisonValue, LuceneNode, RangeValue, TermValue } from '../parse';
import { tokenize } from '../tokens';

/**
 * The preview parser mirrors `app/datamgmt/lucene/query_parser.py`. These
 * cases are deliberately the same shapes the backend suite covers — when
 * the two disagree the bar underlines something the API would accept, or
 * stays silent on something it would reject, and both are worse than no
 * preview at all.
 */

const ast = (source: string): LuceneNode | null => parseLucene(source).ast;

const clause = (node: LuceneNode | null): ClauseNode => {
	expect(node?.type).toBe('clause');
	return node as ClauseNode;
};

const term = (node: LuceneNode | null): TermValue => {
	const value = clause(node).value;
	expect(value.type).toBe('term');
	return value as TermValue;
};

const messages = (source: string) => parseLucene(source).diagnostics.map((d) => d.message);

describe('parseLucene — empty input', () => {
	it('treats an empty expression as no query rather than an error', () => {
		expect(parseLucene('')).toEqual({ ast: null, diagnostics: [] });
	});

	it('treats whitespace as no query', () => {
		expect(parseLucene('   \t ')).toEqual({ ast: null, diagnostics: [] });
	});
});

describe('parseLucene — clauses', () => {
	it('reads a bare term as a field-less clause', () => {
		const node = clause(ast('phishing'));
		expect(node.field).toBeNull();
		expect((node.value as TermValue).text).toBe('phishing');
	});

	it('reads field:value', () => {
		const node = clause(ast('title:beacon'));
		expect(node.field).toBe('title');
		expect((node.value as TermValue).text).toBe('beacon');
	});

	it('marks a quoted phrase as quoted', () => {
		expect(term(ast('title:"brute force"'))).toMatchObject({
			text: 'brute force',
			quoted: true
		});
	});

	it('keeps escapes intact so a wildcard stays distinguishable from a literal', () => {
		expect(term(ast('title:a\\*b')).text).toBe('a\\*b');
	});

	it('spans the clause from the field to the end of the value', () => {
		const node = clause(ast('title:beacon'));
		expect([node.from, node.to]).toEqual([0, 12]);
	});

	it('reads a dotted JSON path as one field', () => {
		expect(clause(ast('context.rule_name:brute')).field).toBe('context.rule_name');
	});
});

describe('parseLucene — precedence', () => {
	it('makes juxtaposition an AND', () => {
		expect(ast('crowdstrike phishing')).toMatchObject({ type: 'and' });
	});

	it('binds AND tighter than OR', () => {
		// `a OR b c` is `a OR (b AND c)`, not `(a OR b) AND c`.
		const node = ast('a OR b c');
		expect(node).toMatchObject({ type: 'or' });
		expect((node as { children: LuceneNode[] }).children[1]).toMatchObject({ type: 'and' });
	});

	it('accepts && and || as aliases', () => {
		expect(ast('a && b')).toMatchObject({ type: 'and' });
		expect(ast('a || b')).toMatchObject({ type: 'or' });
	});

	it('lets parentheses override precedence', () => {
		expect(ast('(a OR b) c')).toMatchObject({ type: 'and' });
	});

	it('makes juxtaposition inside a value group an OR', () => {
		// One alert holds one status, so `status:(New Assigned)` can only
		// sensibly mean "either".
		expect(ast('status:(New Assigned)')).toMatchObject({ type: 'or' });
	});

	it('still honours an explicit AND inside a value group', () => {
		expect(ast('tag:(phishing AND urgent)')).toMatchObject({ type: 'and' });
	});

	it('distributes the field over every member of a value group', () => {
		const node = ast('status:(New Assigned)') as { children: LuceneNode[] };
		expect(node.children.map((child) => clause(child).field)).toEqual(['status', 'status']);
	});
});

describe('parseLucene — negation', () => {
	it('reads a leading dash as a negation', () => {
		expect(ast('-status:Closed')).toMatchObject({ type: 'not' });
	});

	it('reads NOT as a negation', () => {
		expect(ast('NOT status:Closed')).toMatchObject({ type: 'not' });
	});

	it('reads ! as a negation', () => {
		expect(ast('!status:Closed')).toMatchObject({ type: 'not' });
	});

	it('keeps a dash inside a word part of the term', () => {
		expect(term(ast('asset:HOST-1')).text).toBe('HOST-1');
	});

	it('keeps a dash straight after the colon part of the value', () => {
		// `case:-1` means the identifier -1, not "not case 1".
		expect(term(ast('case:-1')).text).toBe('-1');
	});

	it('swallows a leading plus, which AND-by-default already means', () => {
		expect(ast('+title:beacon')).toMatchObject({ type: 'clause' });
	});
});

describe('parseLucene — ranges and comparisons', () => {
	it('reads an inclusive range', () => {
		const value = clause(ast('created:[2026-01-01 TO 2026-02-01]')).value as RangeValue;
		expect(value).toMatchObject({
			lower: '2026-01-01',
			upper: '2026-02-01',
			includeLower: true,
			includeUpper: true
		});
	});

	it('reads an exclusive range', () => {
		const value = clause(ast('id:{10 TO 20}')).value as RangeValue;
		expect(value).toMatchObject({ includeLower: false, includeUpper: false });
	});

	it('reads a star as an open bound', () => {
		const value = clause(ast('created:[2026-01-01 TO *]')).value as RangeValue;
		expect(value.upper).toBeNull();
	});

	it('reads each comparison operator', () => {
		const operators = ['severity:>=High', 'severity:<=Low', 'id:>5', 'id:<5'].map(
			(source) => (clause(ast(source)).value as ComparisonValue).operator
		);
		expect(operators).toEqual(['gte', 'lte', 'gt', 'lt']);
	});

	it('keeps the relative-date text on the comparison', () => {
		expect(clause(ast('created:>now-24h')).value).toMatchObject({
			operator: 'gt',
			text: 'now-24h'
		});
	});

	it('refuses a comparison with nothing after it', () => {
		expect(messages('id:>')).toContain("'>' needs a value after it");
	});

	it('refuses a range with no bounds', () => {
		expect(messages('created:[* TO *]')).toContain('A range needs at least one bound');
	});

	it('refuses a range missing its TO', () => {
		expect(messages('id:[1 5]')).toContain("Range needs a 'TO' between its bounds");
	});
});

describe('parseLucene — rejected features', () => {
	it('names fuzzy search rather than ignoring the modifier', () => {
		expect(messages('title:beacon~2')).toContain('Fuzzy and proximity search (~) is not supported');
	});

	it('names boosting', () => {
		expect(messages('title:beacon^3')).toContain('Term boosting (^) is not supported');
	});

	it('names regular expressions', () => {
		expect(messages('title:/^abc$/')[0]).toContain('Regular-expression search');
	});

	it('reports the boost in a regex whose parentheses split the term', () => {
		// `(` ends a term run, so `/^a(b|c)$/` never lexes as one `/…/` chunk —
		// the `^` is what gets named. The backend lexer does exactly the same,
		// and the bar being wrong in the same way as the API is the point.
		expect(messages('title:/^a(b|c)$/')[0]).toContain('Term boosting');
	});

	it('leaves a path alone, which is not a regex', () => {
		expect(messages('asset:/var/log/*.gz')).toEqual([]);
	});

	it('leaves an escaped tilde alone', () => {
		expect(messages('title:a\\~b')).toEqual([]);
	});
});

describe('parseLucene — diagnostics carry a position', () => {
	it('points at the character an expression ran out on', () => {
		const [diagnostic] = parseLucene('title:(').diagnostics;
		expect(diagnostic).toMatchObject({ message: 'Search expression ends unexpectedly', from: 7 });
	});

	it('points at the opening parenthesis of an unbalanced group', () => {
		const [diagnostic] = parseLucene('(a OR b').diagnostics;
		expect(diagnostic).toMatchObject({ message: 'Unbalanced parenthesis', from: 0 });
	});

	it('points at the opening quote of an unterminated phrase', () => {
		expect(parseLucene('title:"open').diagnostics[0]).toMatchObject({
			message: 'Unterminated quoted phrase',
			from: 6
		});
	});

	it('reports a leading operator', () => {
		expect(messages('AND foo')).toContain("Unexpected 'AND'");
	});

	it('keeps the part that already parsed when the tail is half-typed', () => {
		// The chips must not blink out mid-edit.
		const { ast: partial, diagnostics } = parseLucene('title:beacon AND');
		expect(diagnostics).toHaveLength(1);
		expect(clausesOf(partial)).toHaveLength(1);
	});
});

describe('parseLucene — guard rails', () => {
	it('refuses an expression longer than the backend accepts', () => {
		expect(messages('a'.repeat(5000))[0]).toContain('too long');
	});

	it('refuses an expression with too many terms', () => {
		expect(messages(Array.from({ length: 250 }, (_, i) => `t${i}`).join(' '))[0]).toContain(
			'too complex'
		);
	});

	it('refuses an expression nested too deeply', () => {
		const depth = 20;
		const source = `${'('.repeat(depth)}a${')'.repeat(depth)}`;
		expect(messages(source)[0]).toContain('nested too deeply');
	});
});

describe('tokenize — things analysts paste', () => {
	const kinds = (source: string) =>
		tokenize(source)
			.tokens.filter((token) => token.kind !== 'eof')
			.map((token) => token.kind);

	it('does not read a URL scheme as a field', () => {
		expect(kinds('http://host/path')).toEqual(['term']);
	});

	it('does not read an IPv6 address as a field', () => {
		expect(kinds('fe80::1')).toEqual(['term']);
	});

	it('does read a lone colon word as a field', () => {
		expect(kinds('title:x')).toEqual(['field', 'term']);
	});

	it('keeps lowercase and, or and to as ordinary words', () => {
		expect(kinds('and or to')).toEqual(['term', 'term', 'term']);
	});
});

describe('topLevelConjuncts', () => {
	it('splits an AND into its parts', () => {
		expect(topLevelConjuncts(ast('a b c'))).toHaveLength(3);
	});

	it('keeps a root OR whole, since splitting it would change the meaning', () => {
		expect(topLevelConjuncts(ast('a OR b'))).toHaveLength(1);
	});

	it('is empty for no query', () => {
		expect(topLevelConjuncts(null)).toEqual([]);
	});
});

describe('caretContext', () => {
	it('offers field names on a bare word', () => {
		expect(caretContext('stat', 4)).toMatchObject({ kind: 'field', word: 'stat', from: 0, to: 4 });
	});

	it('offers values straight after the colon', () => {
		expect(caretContext('status:', 7)).toMatchObject({ kind: 'value', field: 'status', word: '' });
	});

	it('offers values while one is being typed', () => {
		expect(caretContext('status:clo', 10)).toMatchObject({
			kind: 'value',
			field: 'status',
			word: 'clo',
			from: 7,
			to: 10
		});
	});

	it('offers field names again in the whitespace after a clause', () => {
		expect(caretContext('status:Closed ', 14)).toMatchObject({ kind: 'field', word: '' });
	});

	it('completes the field the caret is in, not the one before it', () => {
		expect(caretContext('title:x seve', 12)).toMatchObject({ kind: 'field', word: 'seve' });
	});

	it('stays inside the field name when the caret is before the colon', () => {
		expect(caretContext('status:Closed', 4)).toMatchObject({ kind: 'field', word: 'status' });
	});

	it('clamps a caret past the end of the text', () => {
		expect(caretContext('a', 99)).toMatchObject({ kind: 'field', word: 'a' });
	});
});

describe('applySuggestion', () => {
	it('appends a colon after a field so values come up next', () => {
		expect(applySuggestion('stat', caretContext('stat', 4), 'status')).toEqual({
			text: 'status:',
			caret: 7
		});
	});

	it('appends a space after a value so the next clause can start', () => {
		expect(applySuggestion('status:clo', caretContext('status:clo', 10), 'Closed')).toEqual({
			text: 'status:Closed ',
			caret: 14
		});
	});

	it('keeps the rest of the expression', () => {
		const source = 'status:clo severity:High';
		expect(applySuggestion(source, caretContext(source, 10), 'Closed').text).toBe(
			'status:Closed severity:High'
		);
	});
});

describe('quoteIfNeeded', () => {
	it('leaves a plain word alone', () => {
		expect(quoteIfNeeded('Closed')).toBe('Closed');
	});

	it('quotes a value with a space', () => {
		expect(quoteIfNeeded('In progress')).toBe('"In progress"');
	});

	it('escapes a quote inside the value', () => {
		expect(quoteIfNeeded('say "hi"')).toBe('"say \\"hi\\""');
	});
});
