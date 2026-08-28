import type { Reroute } from '@sveltejs/kit';

/**
 * Rewrite IRIS v2.4.29 flat-query case URLs at the router boundary so
 * bookmarks, e-mails, and any stored links that predate the SvelteKit
 * tree resolve to the new path-based routes. This is a safety net —
 * markdown stored in notes/comments/etc. is rewritten at render time by
 * `legacy-content.ts` (frontend) and `_rewrite_legacy_case_urls`
 * (backend, at Y.Doc seed). This hook covers everything else.
 *
 *   /case?cid=X                     → /case/X
 *   /case/iocs?cid=X&ioc_id=Y       → /case/X/iocs/Y
 *   /case/iocs?cid=X                → /case/X/iocs
 *   /case/assets?cid=X&asset_id=Y   → /case/X/assets/Y
 *   /case/tasks?cid=X&id=Y          → /case/X/tasks/Y
 *   /case/notes?cid=X&note_id=Y     → /case/X/notes/Y
 *   /case/evidences?cid=X&evidence_id=Y → /case/X/evidences/Y
 *   /case/timeline?cid=X            → /case/X/timeline
 *
 * `reroute` is called by SvelteKit for every navigation — client and
 * server — before route matching. Returning a different pathname makes
 * the router act as if that were the requested URL. We never touch the
 * URL bar (`reroute` is intentional about this: the visible URL keeps
 * the shape the user typed), which is fine — the user still lands on
 * the correct page.
 */

const CASE_SUBPATH_ID_PARAM: Record<string, string> = {
	iocs: 'ioc_id',
	assets: 'asset_id',
	tasks: 'id',
	notes: 'note_id',
	evidences: 'evidence_id'
};

export const reroute: Reroute = ({ url }) => {
	const cid = url.searchParams.get('cid');
	if (!cid || !/^\d+$/.test(cid)) return;

	const pathname = url.pathname;

	if (pathname === '/case') {
		return `/case/${cid}`;
	}

	const subpathMatch = pathname.match(/^\/case\/(iocs|assets|tasks|notes|evidences|timeline)\/?$/);
	if (!subpathMatch) return;

	const section = subpathMatch[1];
	if (section === 'timeline') return `/case/${cid}/timeline`;

	const idParam = CASE_SUBPATH_ID_PARAM[section];
	const id = url.searchParams.get(idParam);
	if (id && /^\d+$/.test(id)) return `/case/${cid}/${section}/${id}`;
	return `/case/${cid}/${section}`;
};
