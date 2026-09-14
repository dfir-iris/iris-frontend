/**
 * Text edits driven by the AST.
 *
 * Everything here works on the *source characters* a node spans rather
 * than on a re-printed tree. The bar holds what the analyst typed, and
 * dropping one chip should leave the rest of their expression byte for
 * byte as they wrote it.
 */

import { parseLucene, topLevelConjuncts } from './parse';
import type { LuceneNode, Spanned } from './parse';

/**
 * The source text a span covers.
 *
 * Takes a `Spanned` rather than a `LuceneNode` because the chip bar also
 * has to show the runs the parser *could not* claim — a half-written tail
 * is still text the analyst committed, and it has to stay removable.
 */
export const textOf = (source: string, node: Spanned): string => source.slice(node.from, node.to);

/**
 * The text of a node, parenthesised if reusing it elsewhere would change
 * what it means.
 *
 * Only a bare `OR` needs this. `AND` binds tighter, so `a OR b` placed
 * after another clause reassociates into `(other AND a) OR b` — which is
 * wider, not narrower, and therefore the one rewrite that must never
 * happen silently.
 */
export const groupedTextOf = (source: string, node: LuceneNode): string => {
	const text = textOf(source, node);
	return node.type === 'or' && !node.grouped ? `(${text})` : text;
};

// Safe to match without re-lexing: these run against the text either side
// of a node boundary, and a clause boundary is never inside a quote.
const TRAILING_OPERATOR = /\s*(?:AND|&&|OR|\|\|)\s*$/;
const LEADING_OPERATOR = /^\s*(?:AND|&&|OR|\|\|)\s*/;

/**
 * The expression with one node cut out of it.
 *
 * The boolean operator that joined it to its neighbours goes too —
 * removing the middle of `a AND b AND c` must not leave `a AND AND c`.
 * Whitespace is only touched at the seam, so a phrase with two spaces in
 * it elsewhere keeps them.
 */
export const removeNode = (source: string, node: Spanned): string => {
	let before = source.slice(0, node.from);
	let after = source.slice(node.to);

	// One side is enough — dropping both would eat the operator joining the
	// two survivors as well.
	if (TRAILING_OPERATOR.test(before)) {
		before = before.replace(TRAILING_OPERATOR, '');
	} else {
		after = after.replace(LEADING_OPERATOR, '');
	}

	before = before.replace(/\s+$/, '');
	after = after.replace(/^\s+/, '');

	if (before === '') return after;
	if (after === '') return before;
	return `${before} ${after}`;
};

/**
 * Append a clause to an expression, keeping the single-space convention.
 *
 * The caller promises the clause is one conjunct. Use `appendExpression`
 * for anything an analyst typed, which carries no such promise.
 */
export const appendClause = (source: string, clause: string): string => {
	const head = source.trim();
	if (clause === '') return head;
	return head === '' ? clause : `${head} ${clause}`;
};

/**
 * An expression parenthesised if juxtaposing it with another would change
 * what it means — the string-level twin of `groupedTextOf`.
 *
 * Only a bare top-level `OR` qualifies. Juxtaposition binds as `AND`,
 * which is tighter, so writing `x` beside `a OR b` reassociates it into
 * `(x AND a) OR b`: a query matching *more* rows than either side asked
 * for, produced by an edit that reads like a narrowing one. `AND` and
 * `NOT` already bind at least as tightly and survive the move untouched.
 *
 * Text the parser could not fully account for is returned as written.
 * Adding parentheses around a shape we are only guessing at would be the
 * same silent rewrite in the other direction, and the server refuses it
 * either way.
 */
const grouped = (expression: string): string => {
	const { ast, diagnostics } = parseLucene(expression);
	const bare = diagnostics.length === 0 && ast?.type === 'or' && ast.grouped !== true;

	return bare ? `(${expression})` : expression;
};

/**
 * Join two expressions with an implicit `AND`, without either one changing
 * meaning on the way.
 *
 * Both sides are protected, not just the new one: committing `tag:x` onto
 * an expression that is already `a OR b` reassociates just as badly as the
 * reverse. Neither is touched when the other is empty — there is nothing
 * to reassociate against, so `a OR b` typed into an empty bar stays the
 * unparenthesised text the analyst wrote, and only grows brackets at the
 * moment they start to carry weight.
 */
export const appendExpression = (source: string, fragment: string): string => {
	const head = source.trim();
	const tail = fragment.trim();

	if (head === '' || tail === '') return appendClause(head, tail);
	return appendClause(grouped(head), grouped(tail));
};

/**
 * An alternation that swallowed the conditions written before it.
 *
 * `OR` binds loosest of everything in the grammar, so `a b c OR d` means
 * "(a and b and c) or d" rather than "a and b and (c or d)". That is
 * standard Lucene and exactly what the backend runs — but it is not what
 * an analyst typing `OR malware` onto the end of a working query expects,
 * and the whole expression collapsing into one chip is usually the first
 * they hear of it.
 *
 * Only reported when the left side actually is a conjunction. `a OR b` is
 * a single condition too, but nothing was swallowed and there is nothing
 * to warn about.
 */
export const hasLooseAlternation = (source: string): boolean => {
	const { ast, diagnostics } = parseLucene(source);
	if (diagnostics.length > 0 || ast === null || ast.type !== 'or' || ast.grouped) return false;

	return ast.children.some((child) => child.type === 'and');
};

/**
 * The same expression with the alternation bound to just the condition in
 * front of it: `a b c OR d` becomes `a b (c OR d)`.
 *
 * `null` when there is no unambiguous way to do it. One alternation, a
 * conjunction on its left and a single condition on its right is the shape
 * that comes from appending `OR something` to a query that was working —
 * anything more tangled has no obviously-intended reading, and guessing at
 * one would be worse than leaving it to be edited by hand.
 *
 * This is offered, never applied on its own. Both readings are valid
 * queries and only the analyst knows which they meant.
 */
export const tightenAlternation = (source: string): string | null => {
	const { ast, diagnostics } = parseLucene(source);
	if (diagnostics.length > 0 || ast === null || ast.type !== 'or' || ast.grouped) return null;
	if (ast.children.length !== 2) return null;

	const [left, right] = ast.children;
	if (left.type !== 'and' || right.type === 'and') return null;

	const last = left.children[left.children.length - 1];
	const head = source.slice(0, last.from);
	const tail = source.slice(ast.to);

	return `${head}(${source.slice(last.from, ast.to)})${tail}`;
};

/** One removable piece of an expression, as the search bar's chips show it. */
export interface Conjunct {
	/** The source characters, exactly as they were typed. */
	text: string;
	/** Where they sit in `source`, to hand back to `removeNode`. */
	span: Spanned;
	/** False when the parser could not make sense of this run. */
	understood: boolean;
}

/** A span narrowed to its non-whitespace extent, so removal cuts cleanly. */
const trimmedSpan = (source: string, from: number, to: number): Spanned => {
	let start = from;
	let end = to;
	while (start < end && /\s/.test(source[start])) start += 1;
	while (end > start && /\s/.test(source[end - 1])) end -= 1;
	return { from: start, to: end };
};

/**
 * A spelled-out `AND` sitting between two conjuncts. `OR` cannot appear
 * there — one at the top level makes the whole expression a single
 * conjunct — so it is deliberately not in the pattern.
 */
const JOINER = /^(?:AND|&&)$/;

/**
 * An expression split into the pieces a chip may be made of.
 *
 * Top-level AND conjuncts rather than clauses: a bare `OR` at the root is
 * a single condition, and splitting it in two would offer a × that quietly
 * *widens* the query instead of narrowing it.
 *
 * The pieces cover every non-whitespace character of `source` bar the
 * operator joining two conjuncts, which is structure rather than content —
 * two chips side by side already read as "and", and a chip saying `AND`
 * would be one whose × means nothing. Everything else survives, including
 * text the parser could not make sense of: `parseLucene` salvages the
 * clauses in front of a mistake and stops, so without the
 * `understood: false` filler an expression with a bad tail would show
 * chips for only part of what it actually filters on, and leave the rest
 * on screen nowhere and impossible to delete.
 */
export const splitConjuncts = (source: string): Conjunct[] => {
	if (source.trim() === '') return [];

	const result: Conjunct[] = [];

	const pushRaw = (from: number, to: number, betweenConjuncts: boolean) => {
		const span = trimmedSpan(source, from, to);
		if (span.from >= span.to) return;

		const text = textOf(source, span);
		if (betweenConjuncts && JOINER.test(text)) return;

		result.push({ text, span, understood: false });
	};

	let cursor = 0;
	let seen = 0;
	for (const node of topLevelConjuncts(parseLucene(source).ast)) {
		pushRaw(cursor, node.from, seen > 0);
		result.push({ text: textOf(source, node), span: node, understood: true });
		cursor = node.to;
		seen += 1;
	}
	// Nothing follows the tail, so a dangling `AND` there is not joining
	// anything — it is a mistake, and it needs a × like any other.
	pushRaw(cursor, source.length, false);

	return result;
};
