/**
 * Case-target completions for the scope slash commands (`/asset`, `/ioc`,
 * `/push`, `/flag`, `/unflag`, `/share-note`). While one of those is being
 * typed, `#` offers the attached cases first and inserts the bare
 * `#<case_id>` token the backend parses as a target (the
 * `[Asset "x"](/case/N/…)` markup is still offered for the subject).
 */

export const SCOPE_SLASH_COMMANDS = [
	'/asset',
	'/ioc',
	'/flag',
	'/unflag',
	'/push',
	'/share-note'
] as const;

/** True when `body` starts with a scope command followed by its arguments. */
export const isScopeSlashCommand = (body: string): boolean => {
	const match = /^(\/[a-z]+(?:-[a-z]+)*)\s/.exec(body);
	return match !== null && (SCOPE_SLASH_COMMANDS as readonly string[]).includes(match[1]);
};

export type CaseTargetItem = {
	caseId: number;
	label: string;
	sublabel: string;
	insertion: string;
};

/**
 * Attached cases matching `query` (case id prefix, `case-<id>`, or a
 * case-insensitive substring of the case name), in attachment order.
 */
export const caseTargetItems = (
	attachedCases: { case_id: number; case_name: string | null }[],
	query: string
): CaseTargetItem[] => {
	const q = query.trim().toLowerCase();
	const idQuery = q.replace(/^case-?/, '');
	return attachedCases
		.filter((c) => {
			if (q === '') return true;
			if (idQuery !== '' && String(c.case_id).startsWith(idQuery)) return true;
			return (c.case_name ?? '').toLowerCase().includes(q);
		})
		.map((c) => ({
			caseId: c.case_id,
			label: `Case #${c.case_id}`,
			sublabel: c.case_name ?? '',
			insertion: `#${c.case_id}`
		}));
};
