/**
 * Normalizes legacy note/summary content so it renders correctly under the
 * new v2 API and the new icon system.
 *
 * Two classes of legacy artifacts exist in stored content:
 *
 * 1. Datastore file URLs — previously written as
 *      /datastore/file/view/{id}?cid={X}
 *    The backend endpoint moved to
 *      /api/v2/cases/{X}/datastore/files/{id}
 *    so older content (both inside markdown image/link targets) needs to be
 *    rewritten on load. We keep it as a pre-parse pass so the editor only
 *    ever sees the new URLs — anything saved afterwards is written in the
 *    new form.
 *
 * 2. FontAwesome <i> tags embedded inside markdown link text, e.g.
 *      [<i class="fa-solid fa-virus-covid"></i> [DS] file.zip](url)
 *    The new frontend doesn't ship FontAwesome, so those <i> elements
 *    render as empty boxes that clutter the link. We strip them here.
 *    If we want to visually convey "IOC" / "evidence" / "password-protected"
 *    status in the future, we'll re-emit a clean marker (e.g. a badge) at
 *    that point; for now stripping them yields a much cleaner link that
 *    still reads: "[DS] file.zip".
 */

/**
 * Rewrite `/datastore/file/view/{id}?cid={X}` (and bare `/datastore/file/view/{id}`
 * when a sibling cid= appears on the same URL query) into the v2 form.
 * Works for occurrences inside markdown (`](…)`) and raw HTML (`src=`, `href=`).
 */
const rewriteDatastoreUrls = (text: string): string => {
	// Match: /datastore/file/view/NN?...cid=MM...  (cid may be anywhere in query)
	return text.replace(
		/\/datastore\/file\/view\/(\d+)(\?[^)\s"']*)?/g,
		(match, fileId, query) => {
			if (!query) return match; // no query, no cid → can't rewrite safely
			const cidMatch = query.match(/[?&]cid=(\d+)/);
			if (!cidMatch) return match;
			return `/api/v2/cases/${cidMatch[1]}/datastore/files/${fileId}`;
		}
	);
};

/**
 * Strip `<i class="fa-*">…</i>` tags (FontAwesome icon spans) from the
 * content. They're always self-empty in practice and only exist to trigger
 * CSS icons that don't ship in this frontend.
 */
const stripFontAwesomeTags = (text: string): string => {
	// Self-closing or empty <i class="fa…"></i>. Non-greedy to avoid
	// swallowing subsequent HTML.
	return text.replace(/<i\b[^>]*\bclass=["'][^"']*\bfa[-\w]*[^"']*["'][^>]*>\s*<\/i>/gi, '');
};

export const normalizeLegacyContent = (text: string): string => {
	if (!text) return text;
	return stripFontAwesomeTags(rewriteDatastoreUrls(text));
};
