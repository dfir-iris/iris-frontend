/**
 * What the caret is sitting on, for autocomplete.
 *
 * Token-level rather than AST-level on purpose: half-typed input rarely
 * parses, and `status:` — the exact moment the bar most wants to offer
 * something — never does.
 */

import { tokenize } from './tokens';
import type { Token } from './tokens';

export interface CaretContext {
	/**
	 * `field` — a bare word, which may become a field name or stay a
	 * free-text term. `value` — after `field:`, so the values of that field
	 * are what to offer. `none` — nothing useful to complete here.
	 */
	kind: 'field' | 'value' | 'none';
	/** The field whose values to suggest. Only set when `kind` is `value`. */
	field: string | null;
	/** The partial word typed so far, which the suggestions filter on. */
	word: string;
	/** The span a chosen suggestion replaces. Empty when inserting fresh. */
	from: number;
	to: number;
}

const NONE: CaretContext = { kind: 'none', field: null, word: '', from: 0, to: 0 };

/**
 * The token being edited: the one the caret is inside or at the end of.
 *
 * Ties go to the token that *ends* at the caret, since that is the one
 * being typed — with `status:new|` the caret is both at the end of `new`
 * and at the start of nothing.
 */
const tokenAt = (tokens: Token[], caret: number): Token | null => {
	for (const token of tokens) {
		if (token.kind === 'eof') continue;
		if (caret > token.from && caret <= token.to) return token;
	}
	return null;
};

const tokenEndingAt = (tokens: Token[], caret: number): Token | null => {
	for (const token of tokens) {
		if (token.kind !== 'eof' && token.to === caret) return token;
	}
	return null;
};

export const caretContext = (source: string, caret: number): CaretContext => {
	const position = Math.max(0, Math.min(caret, source.length));
	const { tokens } = tokenize(source);

	const token = tokenAt(tokens, position);

	if (token !== null) {
		if (token.kind === 'field') {
			// Inside the field name itself, or just past its colon. Past the
			// colon the value is what comes next; inside it, the name is.
			if (position === token.to) {
				return { kind: 'value', field: token.text, word: '', from: position, to: position };
			}
			return { kind: 'field', field: null, word: token.text, from: token.from, to: token.to };
		}

		if (token.kind === 'term') {
			const index = tokens.indexOf(token);
			const previous = index > 0 ? tokens[index - 1] : null;

			// `field:` and its value are adjacent by construction — a space
			// between them makes the value a free-text term instead, which is
			// what the backend would do with it too.
			if (previous?.kind === 'field' && previous.to === token.from) {
				return {
					kind: 'value',
					field: previous.text,
					word: token.text,
					from: token.from,
					to: token.to
				};
			}

			return { kind: 'field', field: null, word: token.text, from: token.from, to: token.to };
		}

		return NONE;
	}

	// Not inside a token: either at the very end of one that stops here, or
	// in whitespace where a new clause can begin.
	const ending = tokenEndingAt(tokens, position);
	if (ending?.kind === 'field') {
		return { kind: 'value', field: ending.text, word: '', from: position, to: position };
	}

	return { kind: 'field', field: null, word: '', from: position, to: position };
};

/**
 * The expression with the caret's word replaced by `replacement`.
 *
 * Returns the new text and where the caret should land — after the colon
 * for a field (so value suggestions come up straight away), after the
 * value plus a space for anything else.
 *
 * `trailing` overrides that rule. A boolean operator is offered in the
 * same place as a field name, because a bare word is all either looks like
 * half-typed, but `OR:` is not a thing — so the bar says what should
 * follow rather than letting the caret context guess.
 */
export const applySuggestion = (
	source: string,
	context: CaretContext,
	replacement: string,
	trailing?: string
): { text: string; caret: number } => {
	const rest = source.slice(context.to);
	const suffix = trailing ?? (context.kind === 'field' ? ':' : ' ');
	// Completing a value mid-expression already has a separator after it;
	// adding another would leave a double space behind every pick.
	const reuseSpace = suffix === ' ' && rest.startsWith(' ');
	const insert = `${replacement}${reuseSpace ? '' : suffix}`;

	return {
		text: `${source.slice(0, context.from)}${insert}${rest}`,
		caret: context.from + insert.length + (reuseSpace ? 1 : 0)
	};
};

/**
 * Quote a value when it needs it.
 *
 * A customer called "Acme Corp" has to reach the backend as one term, and
 * an analyst picking it from a list should not have to know that. `*` and
 * `?` are in the list for the same reason: a value that happens to contain
 * one is a literal, and only quoting keeps it from becoming a wildcard.
 */
export const quoteIfNeeded = (value: string): string => {
	if (!/[\s"\\()[\]{}:*?]/.test(value)) return value;
	return `"${value.replace(/(["\\])/g, '\\$1')}"`;
};
