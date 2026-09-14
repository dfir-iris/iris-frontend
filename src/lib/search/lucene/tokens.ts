/**
 * Tokenizer for the alert search bar's Lucene subset.
 *
 * A mirror of `app/datamgmt/lucene/query_parser.py::_Lexer`. The backend
 * is the authority on what a query *means* — this side never builds the
 * request, it only reads the text the analyst is typing so the bar can
 * highlight it, underline a mistake before the round trip, and know what
 * the caret is sitting on for autocomplete.
 *
 * Because it runs on every keystroke against half-written input, it never
 * throws: a problem becomes a `Diagnostic` and tokenizing carries on, so
 * `status:"unclo` still highlights the part that is already valid.
 */

export type TokenKind =
	| 'field'
	| 'term'
	| 'phrase'
	| 'lparen'
	| 'rparen'
	| 'lbracket'
	| 'rbracket'
	| 'lbrace'
	| 'rbrace'
	| 'and'
	| 'or'
	| 'not'
	| 'require'
	| 'to'
	| 'eof';

export interface Token {
	kind: TokenKind;
	/** Source text of the token. For a phrase, the quotes are stripped. */
	text: string;
	/** Offset of the first character, into the original source. */
	from: number;
	/** Offset one past the last character. */
	to: number;
}

export interface Diagnostic {
	message: string;
	from: number;
	to: number;
}

export interface TokenizeResult {
	tokens: Token[];
	diagnostics: Diagnostic[];
}

/** Same guard rails as the backend, so the bar refuses what the API would. */
export const MAX_QUERY_LENGTH = 4096;
export const MAX_NODES = 200;
export const MAX_DEPTH = 16;

/**
 * Characters that end an unquoted term run.
 *
 * `:` is deliberately absent — it is only special after something shaped
 * like a field name, which `FIELD_PATTERN` decides, so IOC values like
 * `fe80::1` survive.
 */
const TERM_STOP = new Set([' ', '\t', '\r', '\n', '(', ')', '[', ']', '{', '}', '"']);

/**
 * A field name followed by its colon. Dots are allowed so JSON paths
 * (`context.rule_name`) lex as one field.
 */
const FIELD_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z0-9_*]+)*:/;

/**
 * Bare words that are operators rather than terms. Uppercase only, per
 * Lucene: `to`, `and` and `or` are ordinary words an analyst may well be
 * searching for.
 */
const OPERATOR_WORDS = new Map<string, TokenKind>([
	['AND', 'and'],
	['OR', 'or'],
	['NOT', 'not'],
	['TO', 'to']
]);

const SINGLES = new Map<string, TokenKind>([
	['(', 'lparen'],
	[')', 'rparen'],
	['[', 'lbracket'],
	[']', 'rbracket'],
	['{', 'lbrace'],
	['}', 'rbrace']
]);

/**
 * Lucene features with no Postgres answer behind them. Accepting these
 * and ignoring the modifier would return results that look right and are
 * not, so they are named and refused.
 */
const UNSUPPORTED: readonly [string, string][] = [
	['~', 'Fuzzy and proximity search (~) is not supported'],
	['^', 'Term boosting (^) is not supported']
];

/**
 * Metacharacters that mark a `/…/` run as a regular expression rather
 * than a filesystem path. `.` and `*` are deliberately absent: paths and
 * hostnames are full of them, and rejecting `asset:/var/log/*.gz` to catch
 * a regex nobody wrote is the worse trade.
 */
const REGEX_MARKERS = new Set(['[', ']', '(', ')', '|', '+', '?', '^', '$']);

/** Kinds after which a `-`/`!`/`+` prefix opens a new clause. */
const CLAUSE_BOUNDARY: readonly TokenKind[] = [
	'lparen',
	'lbracket',
	'lbrace',
	'and',
	'or',
	'not',
	'require'
];

const isSpace = (char: string) => /\s/.test(char);

/**
 * Flag a term carrying a modifier the backend cannot honour.
 *
 * Shape is checked first: `/^foo$/` holds a `^`, and reporting that as a
 * boost would send the user looking for the wrong mistake.
 */
const unsupportedDiagnostics = (raw: string, offset: number): Diagnostic[] => {
	const found: Diagnostic[] = [];

	if (raw.length > 2 && raw.startsWith('/') && raw.endsWith('/')) {
		if ([...raw].some((char) => REGEX_MARKERS.has(char))) {
			found.push({
				message:
					'Regular-expression search (/…/) is not supported — quote the value to search for it literally',
				from: offset,
				to: offset + raw.length
			});
			return found;
		}
	}

	let index = 0;
	while (index < raw.length) {
		const char = raw[index];
		if (char === '\\') {
			index += 2;
			continue;
		}
		for (const [marker, message] of UNSUPPORTED) {
			if (char === marker) found.push({ message, from: offset + index, to: offset + index + 1 });
		}
		index += 1;
	}

	return found;
};

/**
 * Whether a `:` at `end` is part of the value rather than a field marker.
 *
 * Two shapes have to escape being read as a field, because both are
 * things analysts paste into a triage search: a URL (`http://host/path`)
 * and an IPv6 address (`fe80::1`).
 */
const colonBelongsToTheValue = (source: string, end: number) =>
	source.slice(end, end + 2) === '//' || source.slice(end, end + 1) === ':';

export const tokenize = (source: string): TokenizeResult => {
	const tokens: Token[] = [];
	const diagnostics: Diagnostic[] = [];
	let index = 0;

	const atClauseBoundary = () => {
		if (tokens.length === 0) return true;
		return CLAUSE_BOUNDARY.includes(tokens[tokens.length - 1].kind);
	};

	const readPhrase = () => {
		const start = index;
		index += 1; // opening quote
		let chunk = '';

		while (index < source.length) {
			const char = source[index];
			if (char === '\\') {
				// Keep the escape intact: the compiler needs to know the next
				// character was escaped, not just what it was.
				chunk += char;
				index += 1;
				if (index < source.length) {
					chunk += source[index];
					index += 1;
				}
				continue;
			}
			if (char === '"') {
				index += 1;
				return { kind: 'phrase' as const, text: chunk, from: start, to: index };
			}
			chunk += char;
			index += 1;
		}

		// Unterminated. The user is most likely still typing it, so the
		// token is emitted anyway — only the diagnostic says it is unfinished.
		diagnostics.push({ message: 'Unterminated quoted phrase', from: start, to: source.length });
		return { kind: 'phrase' as const, text: chunk, from: start, to: source.length };
	};

	const readTerm = () => {
		const start = index;
		let chunk = '';

		while (index < source.length) {
			const char = source[index];
			if (char === '\\') {
				chunk += char;
				index += 1;
				if (index < source.length) {
					chunk += source[index];
					index += 1;
				}
				continue;
			}
			if (TERM_STOP.has(char)) break;
			chunk += char;
			index += 1;
		}

		diagnostics.push(...unsupportedDiagnostics(chunk, start));

		const operator = OPERATOR_WORDS.get(chunk);
		return { kind: operator ?? ('term' as const), text: chunk, from: start, to: index };
	};

	const tryReadField = (): Token | null => {
		const match = FIELD_PATTERN.exec(source.slice(index));
		if (match === null) return null;

		const end = index + match[0].length;
		if (colonBelongsToTheValue(source, end)) return null;

		const token: Token = {
			kind: 'field',
			text: match[0].slice(0, -1),
			from: index,
			to: end
		};
		index = end;
		return token;
	};

	while (index < source.length) {
		const char = source[index];

		if (isSpace(char)) {
			index += 1;
			continue;
		}

		const single = SINGLES.get(char);
		if (single !== undefined) {
			tokens.push({ kind: single, text: char, from: index, to: index + 1 });
			index += 1;
			continue;
		}

		if (char === '"') {
			tokens.push(readPhrase());
			continue;
		}

		if (char === '&' && source[index + 1] === '&') {
			tokens.push({ kind: 'and', text: '&&', from: index, to: index + 2 });
			index += 2;
			continue;
		}

		if (char === '|' && source[index + 1] === '|') {
			tokens.push({ kind: 'or', text: '||', from: index, to: index + 2 });
			index += 2;
			continue;
		}

		// `!` / `-` / `+` are prefix operators only where a clause can begin.
		// Mid-word they are ordinary characters, which is what keeps `HOST-1`
		// and `a+b` from splitting into three tokens.
		if ((char === '!' || char === '-' || char === '+') && atClauseBoundary()) {
			tokens.push({
				kind: char === '+' ? 'require' : 'not',
				text: char,
				from: index,
				to: index + 1
			});
			index += 1;
			continue;
		}

		const field = tryReadField();
		if (field !== null) {
			tokens.push(field);
			continue;
		}

		tokens.push(readTerm());
	}

	tokens.push({ kind: 'eof', text: '', from: source.length, to: source.length });

	if (source.length > MAX_QUERY_LENGTH) {
		diagnostics.unshift({
			message: `Search expression is too long (over ${MAX_QUERY_LENGTH} characters)`,
			from: MAX_QUERY_LENGTH,
			to: source.length
		});
	}

	return { tokens, diagnostics };
};
