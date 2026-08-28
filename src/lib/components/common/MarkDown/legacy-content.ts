/**
 * Normalizes legacy note/summary content so it renders correctly under the
 * new v2 API and the new icon system.
 *
 * Three classes of legacy artifacts exist in stored content:
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
 *
 * 3. Case-scoped IRIS v2.4.29 URLs — previously written as
 *      /case/iocs?cid={X}&ioc_id={Y}  (and the same shape for
 *      assets/tasks/notes/timeline plus the bare `/case?cid={X}` summary).
 *    The SvelteKit v2 router is fully path-based (`/case/{X}/iocs/{Y}`);
 *    without this rewrite, legacy links land on 404s or the wrong route.
 */

/**
 * Rewrite `/datastore/file/view/{id}?cid={X}` (and bare `/datastore/file/view/{id}`
 * when a sibling cid= appears on the same URL query) into the v2 form.
 * Works for occurrences inside markdown (`](…)`) and raw HTML (`src=`, `href=`).
 */
const rewriteDatastoreUrls = (text: string): string => {
	// Match: /datastore/file/view/NN?...cid=MM...  (cid may be anywhere in query)
	return text.replace(/\/datastore\/file\/view\/(\d+)(\?[^)\s"']*)?/g, (match, fileId, query) => {
		if (!query) return match; // no query, no cid → can't rewrite safely
		const cidMatch = query.match(/[?&]cid=(\d+)/);
		if (!cidMatch) return match;
		return `/api/v2/cases/${cidMatch[1]}/datastore/files/${fileId}`;
	});
};

/**
 * IRIS v2.4.29 emitted case-scoped links with a flat query-string:
 *   /case/iocs?cid=X&ioc_id=Y
 *   /case/assets?cid=X&asset_id=Y
 *   /case/tasks?cid=X&id=Y            (tasks used `id=`, not `task_id=`)
 *   /case/notes?cid=X&note_id=Y
 *   /case/timeline?cid=X
 *   /case?cid=X                       (case summary)
 * The new SvelteKit tree is fully path-based:
 *   /case/X/iocs/Y, /case/X/assets/Y, /case/X/tasks/Y, /case/X/notes/Y,
 *   /case/X/timeline, /case/X
 * We rewrite every stored occurrence — markdown `](…)` targets AND raw
 * HTML `href=`/`src=` — so opening an old note routes correctly and any
 * subsequent save round-trips the new URL back into the source column.
 *
 * Order matters: subpath variants (`/case/iocs`) MUST be matched before
 * the bare `/case?cid=` fallback, otherwise the latter would swallow the
 * `/case/…` prefix.
 */
const CASE_SUBPATH_ID_PARAM: Record<string, string> = {
	iocs: 'ioc_id',
	assets: 'asset_id',
	tasks: 'id',
	notes: 'note_id',
	evidences: 'evidence_id'
};

const rewriteLegacyCaseUrls = (text: string): string => {
	// /case/{section}?...cid=X&{section_id}=Y...  (params may appear in either order)
	let out = text.replace(
		/\/case\/(iocs|assets|tasks|notes|evidences|timeline)(\?[^)\s"'<>]*)/g,
		(match, section, query) => {
			const cidMatch = query.match(/[?&]cid=(\d+)/);
			if (!cidMatch) return match;
			const cid = cidMatch[1];
			if (section === 'timeline') return `/case/${cid}/timeline`;
			const idParam = CASE_SUBPATH_ID_PARAM[section as string];
			if (!idParam) return match;
			const idRe = new RegExp(`[?&]${idParam}=(\\d+)`);
			const idMatch = query.match(idRe);
			if (!idMatch) return `/case/${cid}/${section}`;
			return `/case/${cid}/${section}/${idMatch[1]}`;
		}
	);
	// Bare `/case?cid=X` — case summary. Run this AFTER the subpath pass.
	out = out.replace(/\/case(\?[^)\s"'<>]*)/g, (match, query) => {
		const cidMatch = query.match(/[?&]cid=(\d+)/);
		if (!cidMatch) return match;
		return `/case/${cidMatch[1]}`;
	});
	return out;
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

/**
 * Legacy IRIS stored markdown with the image/link brackets backslash-escaped
 * (e.g. `!\[alt\](url)` instead of `![alt](url)`) — likely an artifact of an
 * old templating/sanitization pass. markdown-it treats `\[` as a literal `[`,
 * so these never render as actual images or links.
 *
 * We unescape the specific bracket pairs here so the content renders
 * correctly. The pattern is targeted (only `\[ ... \]` followed by `(`) so
 * intentionally-escaped brackets in prose are left alone.
 *
 * Also:
 *  - Strip backticks that legacy content wrapped around the alt text
 *    (e.g. ``!\[`file.png`\](url)``). Tiptap's image node does not preserve
 *    alt markup, and the backticks were purely cosmetic.
 *  - Strip the non-standard `=WxH%` size suffix inside the URL parens
 *    (e.g. `![alt](url =60%x40%)`) — this is a markdown-it-imsize extension
 *    that the default parser doesn't understand, so it breaks the URL match
 *    and the image falls back to literal text. We drop the dimension hint
 *    since the editor supports drag-to-resize and stores width as an
 *    <img width> attribute, which is the source of truth going forward.
 */
const unescapeLegacyMarkdownLinks = (text: string): string => {
	return text
		.replace(/(!?)\\\[([^\]]*)\\\]\(/g, (_match, bang, inner) => {
			// Drop surrounding backticks from the alt/link text — a common
			// legacy pattern: `!\[`filename.png`\]`.
			const cleaned = inner.replace(/^`([^`]*)`$/, '$1');
			return `${bang}[${cleaned}](`;
		})
		.replace(/(!\[[^\]]*\]\()([^)\s]+)\s+=\d+%?x\d+%?(\))/g, '$1$2$3');
};

export const normalizeLegacyContent = (text: string): string => {
	if (!text) return text;
	return stripFontAwesomeTags(
		rewriteLegacyCaseUrls(rewriteDatastoreUrls(unescapeLegacyMarkdownLinks(text)))
	);
};
