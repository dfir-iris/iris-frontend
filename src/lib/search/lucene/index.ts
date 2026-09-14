export { tokenize, MAX_QUERY_LENGTH, MAX_NODES, MAX_DEPTH } from './tokens';
export type { Token, TokenKind, Diagnostic, TokenizeResult } from './tokens';

export { parseLucene, clausesOf, topLevelConjuncts } from './parse';
export type {
	Spanned,
	LuceneNode,
	LuceneValue,
	ClauseNode,
	AndNode,
	OrNode,
	NotNode,
	TermValue,
	RangeValue,
	ComparisonValue,
	ComparisonOperator,
	ParseResult
} from './parse';

export { caretContext, applySuggestion, quoteIfNeeded } from './caret';
export type { CaretContext } from './caret';

export {
	textOf,
	groupedTextOf,
	removeNode,
	appendExpression,
	splitConjuncts,
	hasLooseAlternation,
	tightenAlternation
} from './edit';
export type { Conjunct } from './edit';
