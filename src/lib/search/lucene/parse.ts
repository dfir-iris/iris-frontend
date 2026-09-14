/**
 * Recursive-descent parser for the alert search bar's Lucene subset.
 *
 * A mirror of `app/datamgmt/lucene/query_parser.py::_Parser`, down to the
 * grammar and the wording of the errors:
 *
 *     query      := or_expr
 *     or_expr    := and_expr ( ("OR" | "||") and_expr )*
 *     and_expr   := unary ( ("AND" | "&&")? unary )*      # juxtaposition = AND
 *     unary      := ("NOT" | "!" | "-" | "+")? primary
 *     primary    := "(" or_expr ")" | clause
 *     clause     := [ field ":" ] value
 *     value      := "(" value_group ")" | range | comparison | phrase | term
 *
 * Inside a value group juxtaposition means OR rather than AND —
 * `status:(New Assigned)` can only sensibly mean "either", since one alert
 * holds one status.
 *
 * This is the *preview* parser. It exists to underline a mistake without a
 * round trip and to tell the bar what the caret is on; the `query=`
 * parameter always carries the raw text, and the backend's answer is the
 * only one that decides what the queue shows. Where the two could drift —
 * an alias this side has never heard of, a value only the database can
 * resolve — this one stays quiet rather than guessing, so a stale
 * frontend never refuses a query the server would have accepted.
 */

import { MAX_DEPTH, MAX_NODES, tokenize } from './tokens';
import type { Diagnostic, Token, TokenKind } from './tokens';

export type { Diagnostic, Token, TokenKind } from './tokens';

/**
 * Where a node came from in the source text.
 *
 * Every node carries it, not just the leaves: the chip bar slices a
 * conjunct back out of the expression to drop it, and the advanced panel
 * copies the conjuncts it cannot represent through verbatim. Both need the
 * original characters — re-printing an AST would quietly rewrite the
 * analyst's typing.
 */
export interface Spanned {
	from: number;
	to: number;
	/**
	 * The node was written inside parentheses, and `from`/`to` include them.
	 *
	 * Worth recording because an `OR` that was *not* parenthesized cannot be
	 * moved next to another clause without changing what it means — `a OR b`
	 * appended after `status:New` reassociates into `(status:New AND a) OR b`.
	 */
	grouped?: boolean;
}

export interface TermValue {
	type: 'term';
	/** Raw source text, escapes intact, so `*` and `\*` stay distinguishable. */
	text: string;
	/** A quoted phrase; wildcards inside it are literal. */
	quoted: boolean;
	from: number;
	to: number;
}

export interface RangeValue {
	type: 'range';
	/** `null` is an open bound — `*` in the source. */
	lower: string | null;
	upper: string | null;
	includeLower: boolean;
	includeUpper: boolean;
	from: number;
	to: number;
}

export type ComparisonOperator = 'gte' | 'lte' | 'gt' | 'lt';

export interface ComparisonValue {
	type: 'comparison';
	operator: ComparisonOperator;
	text: string;
	from: number;
	to: number;
}

export type LuceneValue = TermValue | RangeValue | ComparisonValue;

export interface ClauseNode extends Spanned {
	type: 'clause';
	/** `null` for a free-text term, which searches the default columns. */
	field: string | null;
	value: LuceneValue;
}

export interface AndNode extends Spanned {
	type: 'and';
	children: LuceneNode[];
}

export interface OrNode extends Spanned {
	type: 'or';
	children: LuceneNode[];
}

export interface NotNode extends Spanned {
	type: 'not';
	child: LuceneNode;
}

export type LuceneNode = ClauseNode | AndNode | OrNode | NotNode;

export interface ParseResult {
	/** `null` for an empty expression, or when parsing could not finish. */
	ast: LuceneNode | null;
	diagnostics: Diagnostic[];
}

const COMPARISON_PREFIXES: readonly [string, ComparisonOperator][] = [
	['>=', 'gte'],
	['<=', 'lte'],
	['>', 'gt'],
	['<', 'lt']
];

const CLAUSE_STARTERS: readonly TokenKind[] = [
	'term',
	'phrase',
	'field',
	'lparen',
	'lbracket',
	'lbrace',
	'not',
	'require'
];

const canStartClause = (kind: TokenKind) => CLAUSE_STARTERS.includes(kind);

/** The span a list of children covers, first character to last. */
const spanning = (children: LuceneNode[]): Spanned => ({
	from: children[0].from,
	to: children[children.length - 1].to
});

/** Thrown internally to unwind to `parseLucene`, which turns it into a diagnostic. */
class ParseFailure extends Error {
	constructor(
		readonly diagnostic: Diagnostic,
		readonly partial: LuceneNode | null
	) {
		super(diagnostic.message);
	}
}

class Parser {
	private index = 0;
	private nodes = 0;

	/**
	 * The last complete top-level expression, kept so a half-typed tail
	 * still yields chips for the clauses in front of it. Only depth 0
	 * updates it: salvaging the inside of a group the user is still
	 * writing would show a fragment and hide the clause it belongs to.
	 */
	private salvage: LuceneNode | null = null;

	constructor(private readonly tokens: Token[]) {}

	private current(): Token {
		return this.tokens[this.index];
	}

	private advance(): Token {
		return this.tokens[this.index++];
	}

	private fail(message: string, token: Token, partial: LuceneNode | null = null): never {
		throw new ParseFailure(
			{ message, from: token.from, to: Math.max(token.to, token.from + 1) },
			partial ?? this.salvage
		);
	}

	private remember(depth: number, children: LuceneNode[]): void {
		if (depth !== 0) return;
		this.salvage =
			children.length === 1
				? children[0]
				: { type: 'and', children: [...children], ...spanning(children) };
	}

	/** Widen a node to the parentheses it was written inside. */
	private group(node: LuceneNode, opening: Token, closing: Token): LuceneNode {
		node.from = opening.from;
		node.to = closing.to;
		node.grouped = true;
		return node;
	}

	private countNode(token: Token): void {
		this.nodes += 1;
		if (this.nodes > MAX_NODES) {
			this.fail(`Search expression is too complex (over ${MAX_NODES} terms)`, token);
		}
	}

	parse(): LuceneNode {
		const node = this.parseOr(0);
		const current = this.current();
		if (current.kind !== 'eof') {
			// Everything parsed so far is still worth keeping: the caret is
			// usually mid-edit, and the chips should not blink out because
			// the tail is half-typed.
			this.fail(`Unexpected '${current.text}'`, current, node);
		}
		return node;
	}

	private parseOr(depth: number): LuceneNode {
		if (depth > MAX_DEPTH) {
			this.fail(
				`Search expression is nested too deeply (over ${MAX_DEPTH} levels)`,
				this.current()
			);
		}

		const children = [this.parseAnd(depth)];
		while (this.current().kind === 'or') {
			this.advance();
			children.push(this.parseAnd(depth));
		}

		return children.length === 1 ? children[0] : { type: 'or', children, ...spanning(children) };
	}

	private parseAnd(depth: number): LuceneNode {
		const children = [this.parseUnary(depth)];
		this.remember(depth, children);

		for (;;) {
			const current = this.current();
			if (current.kind === 'and') {
				this.advance();
				children.push(this.parseUnary(depth));
				this.remember(depth, children);
				continue;
			}
			// Juxtaposition — `a b` means `a AND b`.
			if (canStartClause(current.kind)) {
				children.push(this.parseUnary(depth));
				this.remember(depth, children);
				continue;
			}
			break;
		}

		return children.length === 1 ? children[0] : { type: 'and', children, ...spanning(children) };
	}

	private parseUnary(depth: number): LuceneNode {
		const current = this.current();

		if (current.kind === 'not') {
			this.advance();
			const child = this.parseUnary(depth);
			return { type: 'not', child, from: current.from, to: child.to };
		}

		if (current.kind === 'require') {
			// `+a` is "must match", which is already what AND-by-default
			// gives us. Consumed so the query still parses, rather than
			// pretending the syntax does something extra.
			this.advance();
			return this.parseUnary(depth);
		}

		return this.parsePrimary(depth);
	}

	private parsePrimary(depth: number): LuceneNode {
		const current = this.current();

		if (current.kind === 'lparen') {
			this.advance();
			const node = this.parseOr(depth + 1);
			if (this.current().kind !== 'rparen') {
				this.fail('Unbalanced parenthesis', current, node);
			}
			return this.group(node, current, this.advance());
		}

		if (current.kind === 'field') {
			this.advance();
			return this.parseValue(current.text, current, depth);
		}

		return this.parseValue(null, current, depth);
	}

	private parseValue(field: string | null, at: Token, depth: number): LuceneNode {
		const current = this.current();

		// A field-less `(` is an ordinary group and never reaches here —
		// `parsePrimary` consumes it first.
		if (current.kind === 'lparen' && field !== null) {
			return this.parseValueGroup(field, depth + 1);
		}

		if (current.kind === 'lbracket' || current.kind === 'lbrace') {
			return this.parseRange(field);
		}

		if (current.kind === 'phrase') {
			this.advance();
			this.countNode(current);
			return {
				type: 'clause',
				field,
				value: {
					type: 'term',
					text: current.text,
					quoted: true,
					from: current.from,
					to: current.to
				},
				from: at.from,
				to: current.to
			};
		}

		if (current.kind === 'term') {
			this.advance();
			this.countNode(current);
			return {
				type: 'clause',
				field,
				value: this.termValue(current),
				from: at.from,
				to: current.to
			};
		}

		if (current.kind === 'eof') {
			this.fail('Search expression ends unexpectedly', current);
		}

		this.fail(`Unexpected '${current.text}'`, current);
	}

	/** `field:(a OR b)` — juxtaposition inside means OR, see the module doc. */
	private parseValueGroup(field: string, depth: number): LuceneNode {
		if (depth > MAX_DEPTH) {
			this.fail(
				`Search expression is nested too deeply (over ${MAX_DEPTH} levels)`,
				this.current()
			);
		}

		const opening = this.advance(); // '('
		const node = this.parseGroupOr(field, depth);

		if (this.current().kind !== 'rparen') {
			this.fail('Unbalanced parenthesis', opening, node);
		}
		return this.group(node, opening, this.advance());
	}

	private parseGroupOr(field: string, depth: number): LuceneNode {
		const children = [this.parseGroupAnd(field, depth)];
		while (this.current().kind === 'or') {
			this.advance();
			children.push(this.parseGroupAnd(field, depth));
		}

		return children.length === 1 ? children[0] : { type: 'or', children, ...spanning(children) };
	}

	private parseGroupAnd(field: string, depth: number): LuceneNode {
		const children = [this.parseGroupUnary(field, depth)];
		let explicitAnd = false;

		for (;;) {
			const current = this.current();
			if (current.kind === 'and') {
				this.advance();
				explicitAnd = true;
				children.push(this.parseGroupUnary(field, depth));
				continue;
			}
			if (canStartClause(current.kind)) {
				children.push(this.parseGroupUnary(field, depth));
				continue;
			}
			break;
		}

		if (children.length === 1) return children[0];
		// Only an explicit AND means AND here; bare juxtaposition is OR.
		const span = spanning(children);
		return explicitAnd ? { type: 'and', children, ...span } : { type: 'or', children, ...span };
	}

	private parseGroupUnary(field: string, depth: number): LuceneNode {
		const current = this.current();

		if (current.kind === 'not') {
			this.advance();
			const child = this.parseGroupUnary(field, depth);
			return { type: 'not', child, from: current.from, to: child.to };
		}

		if (current.kind === 'require') {
			this.advance();
			return this.parseGroupUnary(field, depth);
		}

		if (current.kind === 'lparen') {
			return this.parseValueGroup(field, depth + 1);
		}

		return this.parseValue(field, current, depth);
	}

	private parseRange(field: string | null): LuceneNode {
		const opening = this.advance();
		const includeLower = opening.kind === 'lbracket';

		const lower = this.parseBound(opening);

		const separator = this.current();
		if (separator.kind !== 'to') {
			this.fail("Range needs a 'TO' between its bounds", separator);
		}
		this.advance();

		const upper = this.parseBound(opening);

		const closing = this.current();
		if (closing.kind !== 'rbracket' && closing.kind !== 'rbrace') {
			this.fail('Unterminated range', opening);
		}
		this.advance();

		if (lower === null && upper === null) {
			this.fail('A range needs at least one bound', opening);
		}

		this.countNode(opening);
		return {
			type: 'clause',
			field,
			value: {
				type: 'range',
				lower,
				upper,
				includeLower,
				includeUpper: closing.kind === 'rbracket',
				from: opening.from,
				to: closing.to
			},
			from: opening.from,
			to: closing.to
		};
	}

	/** One end of a range. `*` is the open bound, as in Lucene. */
	private parseBound(opening: Token): string | null {
		const current = this.current();
		if (current.kind !== 'term' && current.kind !== 'phrase') {
			this.fail('Range bound is missing', opening);
		}
		this.advance();
		if (current.kind === 'term' && current.text === '*') return null;
		return current.text;
	}

	/**
	 * A term token as either a comparison or a plain term.
	 *
	 * `created:>now-7d` lexes as one term because `>` is not a stop
	 * character; splitting it here keeps the tokenizer free of parser state.
	 */
	private termValue(token: Token): TermValue | ComparisonValue {
		for (const [prefix, operator] of COMPARISON_PREFIXES) {
			if (!token.text.startsWith(prefix)) continue;

			const rest = token.text.slice(prefix.length);
			if (rest === '') {
				this.fail(`'${prefix}' needs a value after it`, token);
			}
			return {
				type: 'comparison',
				operator,
				text: rest,
				from: token.from,
				to: token.to
			};
		}

		return {
			type: 'term',
			text: token.text,
			quoted: false,
			from: token.from,
			to: token.to
		};
	}
}

/**
 * Parse a search expression.
 *
 * Never throws and never rejects on an empty input: an expression that is
 * only whitespace is "no query", which is the unfiltered queue rather
 * than a mistake.
 */
export const parseLucene = (source: string): ParseResult => {
	const { tokens, diagnostics } = tokenize(source);

	if (source.trim() === '') return { ast: null, diagnostics };

	try {
		return { ast: new Parser(tokens).parse(), diagnostics };
	} catch (error) {
		if (error instanceof ParseFailure) {
			return { ast: error.partial, diagnostics: [...diagnostics, error.diagnostic] };
		}
		throw error;
	}
};

/** Every clause in the tree, left to right. Used to render the chip bar. */
export const clausesOf = (node: LuceneNode | null): ClauseNode[] => {
	if (node === null) return [];
	if (node.type === 'clause') return [node];
	if (node.type === 'not') return clausesOf(node.child);
	return node.children.flatMap(clausesOf);
};

/**
 * The top-level AND conjuncts of an expression.
 *
 * A single clause is one conjunct, and a bare OR at the root is one
 * conjunct too — splitting it would change what the query means.
 */
export const topLevelConjuncts = (node: LuceneNode | null): LuceneNode[] => {
	if (node === null) return [];
	if (node.type === 'and') return node.children;
	return [node];
};
