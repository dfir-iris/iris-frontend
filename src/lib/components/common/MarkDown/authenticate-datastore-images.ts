/**
 * Markdown stored in IRIS often embeds links/images that point at
 * datastore files, e.g.
 *
 *     ![](/api/v2/cases/3056/datastore/files/5853)
 *     [report.pdf](/api/v2/cases/3056/datastore/files/5853)
 *
 * which Showdown renders as raw `<img>` / `<a>` elements. Both
 * endpoints are gated by a bearer token (see
 * `app/blueprints/rest/v2/cases.py`), so a plain `<img src>` /
 * `<a href>` click — which carries cookies but NOT `Authorization` —
 * gets a 401 every time.
 *
 * This module sweeps a rendered HTML container and rewrites every
 * datastore reference it finds:
 *
 *   * `<img>` — fetch through the bearer-authenticated
 *     `CaseDatastoreService.fetchFileBlobUrl()` and swap `src` for a
 *     transient blob URL.
 *   * `<a>` — restyle as a labelled "file chip" (icon + filename)
 *     and intercept clicks so the file is fetched with bearer auth
 *     and either opened in a new tab (default) or saved as a download
 *     (when the user holds Alt / Option). The original href stays put
 *     so right-click → copy-link still produces the canonical URL.
 *
 * Both sweeps are idempotent (rewritten nodes carry a data-flag and
 * are skipped on subsequent runs) and revoke their blob URLs when the
 * container is torn down or re-rendered.
 *
 * Usage:
 *
 *     $effect(() => authenticateDatastoreImages(containerEl));
 */

import { CaseDatastoreService } from '$lib/services/case-datastore.service';

// Match both relative paths and absolute URLs pointing at the v2
// datastore endpoint. The case id and file id are the two capture
// groups.
const DATASTORE_PATH_RE = /\/api\/v2\/cases\/(\d+)\/datastore\/files\/(\d+)(?:\?|#|$)/;

const PROCESSED_ATTR = 'data-iris-ds-auth';
const LINK_PROCESSED_ATTR = 'data-iris-ds-link';

// Compact inline SVG so we don't drag a lucide dependency into a plain
// DOM-rewrite helper. Mirrors the FileText icon used elsewhere in the
// UI for datastore files.
const FILE_ICON_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/>
  <path d="M14 2v4a2 2 0 0 0 2 2h4"/>
  <path d="M10 13h4"/>
  <path d="M10 17h4"/>
</svg>`.trim();

const CHIP_CLASSES = [
	'inline-flex',
	'items-center',
	'gap-1',
	'rounded',
	'border',
	'border-border/60',
	'bg-muted/40',
	'px-1.5',
	'py-0.5',
	'align-baseline',
	'text-xs',
	'font-medium',
	'text-foreground',
	'no-underline',
	'transition-colors',
	'hover:bg-muted',
	'hover:text-foreground'
].join(' ');

export const authenticateDatastoreImages = (
	container: HTMLElement | null | undefined
): (() => void) => {
	if (!container) return () => {};

	const createdUrls: string[] = [];
	const clickHandlers: Array<{ el: HTMLAnchorElement; fn: (e: MouseEvent) => void }> = [];

	const imgs = container.querySelectorAll<HTMLImageElement>('img');
	imgs.forEach((img) => {
		if (img.hasAttribute(PROCESSED_ATTR)) return;
		const src = img.getAttribute('src');
		if (!src) return;

		const m = DATASTORE_PATH_RE.exec(src);
		if (!m) return;

		const caseId = Number(m[1]);
		const fileId = Number(m[2]);
		if (!Number.isFinite(caseId) || !Number.isFinite(fileId)) return;

		// Mark up-front to make the swap idempotent even if multiple
		// observers fire on the same node before our async fetch resolves.
		img.setAttribute(PROCESSED_ATTR, '1');

		void CaseDatastoreService.fetchFileBlobUrl(caseId, fileId).then((result) => {
			if (!result) {
				// Keep the original src so the broken-image icon is visible
				// rather than silently masking the failure. Clear the flag
				// so a manual retry (re-render) gets another go.
				img.removeAttribute(PROCESSED_ATTR);
				return;
			}
			createdUrls.push(result.url);
			img.src = result.url;
		});
	});

	const links = container.querySelectorAll<HTMLAnchorElement>('a[href]');
	links.forEach((a) => {
		if (a.hasAttribute(LINK_PROCESSED_ATTR)) return;
		const href = a.getAttribute('href');
		if (!href) return;

		const m = DATASTORE_PATH_RE.exec(href);
		if (!m) return;

		const caseId = Number(m[1]);
		const fileId = Number(m[2]);
		if (!Number.isFinite(caseId) || !Number.isFinite(fileId)) return;

		a.setAttribute(LINK_PROCESSED_ATTR, '1');

		// Restyle the bare hyperlink as a labelled file chip. Showdown
		// has already moved the link text into `a.textContent`, which is
		// almost always the filename the author typed (e.g.
		// `[report.pdf](...)`). We prepend an icon and apply the same
		// chip styling used for IOC / asset references elsewhere so the
		// reader sees a clear "this is an attachment" affordance instead
		// of a naked URL.
		const label = (a.textContent ?? '').trim() || `File #${fileId}`;
		a.classList.add(...CHIP_CLASSES.split(' '));
		a.setAttribute('title', label);
		a.setAttribute('data-iris-ds-file', String(fileId));

		// Build the chip contents with DOM APIs rather than innerHTML so
		// the user-controlled label can never be interpreted as markup —
		// the label flows through `textContent`, which the browser
		// escapes for us. The icon is a fixed, static SVG string we
		// authored ourselves, parsed once via a DocumentFragment so it
		// can't pick up runtime content.
		a.replaceChildren();
		const iconFragment = document
			.createRange()
			.createContextualFragment(FILE_ICON_SVG);
		a.appendChild(iconFragment);
		const labelSpan = document.createElement('span');
		labelSpan.className = 'truncate max-w-[20rem]';
		labelSpan.textContent = label;
		a.appendChild(labelSpan);

		// Intercept the click so the browser doesn't perform an
		// unauthenticated navigation to the bearer-gated endpoint. We
		// keep the href intact so users can right-click → "Copy link
		// address" to get the canonical URL (useful for sharing in
		// other tools that handle their own auth).
		const onClick = (e: MouseEvent) => {
			// Let modifier-clicks (cmd/ctrl/middle-click) through —
			// power users sometimes want the raw URL in a new tab even
			// though it'll 401 there. Alt/Option triggers a download
			// instead of open-in-tab.
			if (e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) return;
			e.preventDefault();
			void openOrDownload(caseId, fileId, label, e.altKey);
		};
		a.addEventListener('click', onClick);
		clickHandlers.push({ el: a, fn: onClick });
	});

	return () => {
		for (const url of createdUrls) URL.revokeObjectURL(url);
		for (const { el, fn } of clickHandlers) el.removeEventListener('click', fn);
	};
};

const openOrDownload = async (
	caseId: number,
	fileId: number,
	filename: string,
	asDownload: boolean
): Promise<void> => {
	const fetched = await CaseDatastoreService.fetchFileBlobUrl(caseId, fileId);
	if (!fetched) {
		// Best-effort signal. Surface a console error here rather than
		// a toast — the helper has no Svelte/toast context to pull from
		// and the calling MarkDownPreview is a leaf component.
		console.error('[datastore] failed to fetch file', { caseId, fileId });
		return;
	}

	if (asDownload) {
		const a = document.createElement('a');
		a.href = fetched.url;
		a.download = fetched.filename ?? filename;
		a.rel = 'noopener';
		document.body.appendChild(a);
		a.click();
		a.remove();
		// Revoke immediately — the browser's download has copied the
		// bytes by the time the click handler returns.
		URL.revokeObjectURL(fetched.url);
		return;
	}

	const w = window.open(fetched.url, '_blank', 'noopener');
	setTimeout(() => URL.revokeObjectURL(fetched.url), 60_000);
	if (!w) {
		console.warn('[datastore] pop-up blocked');
	}
};

