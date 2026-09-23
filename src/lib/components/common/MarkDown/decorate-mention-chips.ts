/**
 * Mention chips authored in the editor are stored with their full class
 * list baked in, because tiptap serialises the node through
 * `mention-node.ts`'s `renderHTML`:
 *
 *     <span data-mention data-kind="note" data-id="7" data-label="Runbook"
 *           class="mention-chip … bg-emerald-500/15 …">…</span>
 *
 * Chips written *by the backend* are not. `create_case_from_alert` and
 * `merge_alert_in_case` append the minimal contract shape — data attributes
 * and nothing else:
 *
 *     <span data-mention data-kind="alert" data-id="106"
 *           data-label="Alert #106">#Alert #106</span>
 *
 * Showdown + DOMPurify happily pass that through (DOMPurify keeps `data-*`
 * by default) but it lands in the preview as unstyled inline text. This
 * module is the read-side compensation: sweep a rendered container and give
 * every bare `span[data-mention]` the same classes and inline glyph the
 * editor would have produced, so both origins render identically and
 * `ChipHoverHost` — which keys off `.mention-chip` — picks them up.
 *
 * Idempotent: `.mention-chip` doubles as the processed marker, so re-running
 * over an already-decorated container is a no-op and an editor-authored chip
 * is never touched.
 *
 * Usage:
 *
 *     $effect(() => decorateMentionChips(containerEl));
 */

import { MENTION_CHIP_BASE_CLASSES, mentionKindStyle } from './mention-kinds';

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Leading trigger character to strip when falling back to the element's own
 * text for a label. Matches `mention-node.ts`'s `label` parseHTML, which has
 * to cope with chips authored before `data-label` was written.
 */
const TRIGGER_CHAR_RE = /^[@#!&%]/;

const buildIcon = (iconPath: string): SVGSVGElement => {
	// Built with createElementNS rather than innerHTML so nothing in this
	// path can ever parse untrusted markup — the sweep runs on content that
	// has been through DOMPurify, but the chip label below is attacker-
	// controlled in principle and we want the whole function to be
	// structurally incapable of injecting.
	const svg = document.createElementNS(SVG_NS, 'svg');
	svg.setAttribute('class', 'mention-chip-icon');
	svg.setAttribute('width', '10');
	svg.setAttribute('height', '10');
	svg.setAttribute('viewBox', '0 0 24 24');
	svg.setAttribute('fill', 'none');
	svg.setAttribute('stroke', 'currentColor');
	svg.setAttribute('stroke-width', '2');
	svg.setAttribute('stroke-linecap', 'round');
	svg.setAttribute('stroke-linejoin', 'round');
	svg.setAttribute('aria-hidden', 'true');

	const path = document.createElementNS(SVG_NS, 'path');
	path.setAttribute('d', iconPath);
	svg.appendChild(path);

	return svg;
};

export const decorateMentionChips = (container: HTMLElement | null | undefined): void => {
	if (!container) return;

	const chips = container.querySelectorAll<HTMLElement>('span[data-mention]');
	chips.forEach((el) => {
		if (el.classList.contains('mention-chip')) return;

		const kind = el.getAttribute('data-kind');
		const { chipClass, iconPath } = mentionKindStyle(kind);

		// `data-label` is authoritative; the text body is the fallback for
		// chips that predate it, and carries the trigger char we don't want
		// duplicated next to the glyph.
		const label = (
			el.getAttribute('data-label') ??
			el.textContent?.replace(TRIGGER_CHAR_RE, '') ??
			''
		).trim();

		// Split on runs of whitespace, not a single space: `classList.add`
		// throws on an empty token or one containing whitespace, so a stray
		// double space or a prettier-introduced line break in either class
		// string would otherwise take the whole preview down.
		el.classList.add(...`${MENTION_CHIP_BASE_CLASSES} ${chipClass}`.split(/\s+/).filter(Boolean));

		// ChipHoverHost and the editor's delegated handlers both reach chips
		// through focus as well as hover, so the keyboard path needs the same
		// role/tabindex the tiptap renderer emits.
		el.setAttribute('role', 'button');
		el.setAttribute('tabindex', '0');
		if (!el.hasAttribute('title')) el.setAttribute('title', label);

		const labelSpan = document.createElement('span');
		labelSpan.className = 'mention-chip-label';
		labelSpan.textContent = label;

		el.replaceChildren(buildIcon(iconPath), labelSpan);
	});
};
