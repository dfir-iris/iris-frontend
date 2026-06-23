/**
 * Markdown stored in IRIS often embeds datastore images like
 *
 *     ![](/api/v2/cases/3056/datastore/files/5853)
 *
 * which renders as a raw `<img>`. Because that endpoint is gated by a
 * bearer token (see `app/blueprints/rest/v2/cases.py`), the browser's
 * direct `<img src>` fetch — which carries cookies but NOT
 * `Authorization` — gets a 401 every time.
 *
 * This module sweeps a rendered HTML container, finds each datastore
 * `<img>`, fetches the file through the bearer-authenticated
 * `CaseDatastoreService.fetchFileBlobUrl()`, and swaps the `src` for a
 * transient blob URL. It's idempotent (already-rewritten images carry a
 * data-flag and are skipped) and revokes its blob URLs when the
 * container is torn down or re-rendered.
 *
 * Usage:
 *
 *     onMount(() => authenticateDatastoreImages(containerEl));
 *     $effect(() => { authenticateDatastoreImages(containerEl); });
 *
 * Returns a disposer that revokes every blob URL it created.
 */

import { CaseDatastoreService } from '$lib/services/case-datastore.service';

// Match both relative paths and absolute URLs pointing at the v2
// datastore endpoint. The case id and file id are the two capture
// groups.
const DATASTORE_PATH_RE = /\/api\/v2\/cases\/(\d+)\/datastore\/files\/(\d+)(?:\?|#|$)/;

const PROCESSED_ATTR = 'data-iris-ds-auth';

export const authenticateDatastoreImages = (
	container: HTMLElement | null | undefined
): (() => void) => {
	if (!container) return () => {};

	const createdUrls: string[] = [];

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

	return () => {
		for (const url of createdUrls) URL.revokeObjectURL(url);
	};
};
