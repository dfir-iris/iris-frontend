/**
 * Attribute search grammar shared by the graph views:
 *
 *   kind:ioc type:ip tag:c2 compromised:true -flag:isolated "free text" more
 *
 * - `key:value` where `key` is one of the allowed keys (case-insensitive),
 * - `-key:value` negates the term,
 * - values and free text may be double-quoted to keep spaces,
 * - every other token (including `http://x` style tokens whose prefix is not
 *   an allowed key) is free text.
 */
export interface QueryTerm {
	key: string;
	value: string;
	negated: boolean;
}

export interface ParsedQuery {
	terms: QueryTerm[];
	/** Free-text tokens, lower-cased. */
	text: string[];
}

const tokenize = (input: string): string[] => {
	const tokens: string[] = [];
	let cur = '';
	let quoted = false;
	let had = false;
	for (const ch of input) {
		if (ch === '"') {
			quoted = !quoted;
			had = true;
			continue;
		}
		if (!quoted && /\s/.test(ch)) {
			if (cur || had) tokens.push(cur);
			cur = '';
			had = false;
			continue;
		}
		cur += ch;
	}
	if (cur || had) tokens.push(cur);
	return tokens.filter((t) => t.length > 0);
};

export const parseQuery = (input: string, allowedKeys: readonly string[]): ParsedQuery => {
	const allowed = new Set(allowedKeys.map((k) => k.toLowerCase()));
	const terms: QueryTerm[] = [];
	const text: string[] = [];
	for (const token of tokenize(input ?? '')) {
		const m = /^(-?)([a-z_]+):(.*)$/i.exec(token);
		if (m && allowed.has(m[2].toLowerCase()) && m[3].length > 0) {
			terms.push({ key: m[2].toLowerCase(), value: m[3].toLowerCase(), negated: m[1] === '-' });
		} else {
			text.push(token.toLowerCase());
		}
	}
	return { terms, text };
};

export const isEmptyQuery = (q: ParsedQuery) => q.terms.length === 0 && q.text.length === 0;

/** Truthy spellings accepted for boolean keys. */
export const queryBool = (value: string): boolean | null => {
	const v = value.toLowerCase();
	if (['true', 'yes', '1', 'y', 'on'].includes(v)) return true;
	if (['false', 'no', '0', 'n', 'off'].includes(v)) return false;
	return null;
};
