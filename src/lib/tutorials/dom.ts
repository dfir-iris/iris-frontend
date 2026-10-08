import { anchorSelector } from './logic';

/** Marks the tutorial's own UI so dialogs don't treat clicks on it as "outside". */
export const TUTORIAL_UI_ATTR = 'data-tutorial-ui';

export const isTutorialUiTarget = (target: EventTarget | null): boolean =>
	target instanceof Element && target.closest(`[${TUTORIAL_UI_ATTR}]`) !== null;

const isVisible = (el: Element): boolean => {
	const rect = el.getBoundingClientRect();
	return rect.width > 0 && rect.height > 0;
};

/**
 * First visible element for an anchor. Several can match (an "Attach
 * cases" button in the header and another in the empty state); hidden
 * ones are skipped. Unless `visibleOnly`, falls back to the first match
 * so a field scrolled out of a dialog can still be filled.
 */
export const findAnchor = (
	anchor: string,
	{ root = document, visibleOnly = false }: { root?: ParentNode; visibleOnly?: boolean } = {}
): Element | null => {
	let matches: Element[];
	try {
		matches = [...root.querySelectorAll(anchorSelector(anchor))];
	} catch {
		return null;
	}
	const visible = matches.find(isVisible);
	if (visible || visibleOnly) return visible ?? null;
	return matches[0] ?? null;
};

/** First anchor of the list that is on screen. */
export const findFirstAnchor = (anchors: string[]): Element | null => {
	for (const anchor of anchors) {
		const el = findAnchor(anchor, { visibleOnly: true });
		if (el) return el;
	}
	return null;
};

/** The fillable control at or inside the anchor (Input wrappers, labels…). */
const fillTarget = (el: Element): HTMLInputElement | HTMLTextAreaElement | null => {
	if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return el;
	return el.querySelector('input, textarea');
};

/**
 * Sets a value the way typing would, so Svelte bindings (`bind:value`
 * listens to `input`, some fields to `change`) pick it up.
 */
export const fillElement = (el: Element, value: string | boolean): boolean => {
	const target = fillTarget(el);
	if (!target) return false;

	if (
		target instanceof HTMLInputElement &&
		(target.type === 'checkbox' || target.type === 'radio')
	) {
		if (target.checked !== Boolean(value)) target.click();
		return true;
	}

	const proto =
		target instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
	Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(target, String(value));
	target.dispatchEvent(new Event('input', { bubbles: true }));
	target.dispatchEvent(new Event('change', { bubbles: true }));
	target.focus();
	return true;
};
