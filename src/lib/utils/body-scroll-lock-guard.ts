/**
 * Releases a body scroll lock that bits-ui left behind.
 *
 * Every open dialog / menu / popover locks the page by setting
 * `pointer-events: none` and `overflow: hidden` on <body>, and the last
 * one to close puts back the style it saw when the first one opened.
 * bits-ui 1.x captures that style too eagerly: when a layer opens in the
 * frame between another one closing and its reset (a workflow question
 * popping up as the run dialog goes away), it captures the *locked*
 * style, and restores it once it closes in turn. The page then ignores
 * every click. bits-ui 2 fixed it (huntabyte/bits-ui#1639, #2202).
 *
 * The guard watches the body style and, once no layer is open, drops
 * the lock properties left set.
 */

/** Open layers that hold a body lock. */
export const LOCKING_LAYER_SELECTOR = [
	'[role="dialog"]',
	'[role="alertdialog"]',
	'[role="menu"]',
	'[role="listbox"]',
	'[data-popover-content]',
	'[data-select-content]',
	'[data-combobox-content]',
	'[data-link-preview-content]'
]
	.map((s) => `${s}[data-state="open"]`)
	.join(',');

const LOCK_PROPERTIES = [
	'pointer-events',
	'overflow',
	'padding-right',
	'margin-right',
	'--scrollbar-width'
];

/** Lets the lock settle: bits-ui sets it a tick after the layer renders. */
const SETTLE_MS = 100;

/** True when the body is locked although no layer is open. */
export function bodyLockIsStale(doc: Document = document): boolean {
	return (
		doc.body.style.pointerEvents === 'none' && doc.querySelector(LOCKING_LAYER_SELECTOR) === null
	);
}

/** Drops the lock left on the body when no layer is open; true if it did. */
export function releaseStaleBodyLock(doc: Document = document): boolean {
	if (!bodyLockIsStale(doc)) return false;
	for (const prop of LOCK_PROPERTIES) doc.body.style.removeProperty(prop);
	if (doc.body.style.length === 0) doc.body.removeAttribute('style');
	return true;
}

/** Starts the guard; returns its stop function. */
export function watchBodyScrollLock(doc: Document = document): () => void {
	let timer: ReturnType<typeof setTimeout> | null = null;
	const check = () => {
		if (timer) clearTimeout(timer);
		timer = setTimeout(() => {
			timer = null;
			releaseStaleBodyLock(doc);
		}, SETTLE_MS);
	};
	const observer = new MutationObserver(check);
	observer.observe(doc.body, { attributes: true, attributeFilter: ['style'] });
	return () => {
		observer.disconnect();
		if (timer) clearTimeout(timer);
	};
}
