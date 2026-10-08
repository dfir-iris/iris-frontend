/**
 * Strict rendering profile for markdown IRIS did not get from a person:
 * AI workflow output (suggestion bodies, …) that a prompt injection in an
 * alert or note can steer.
 *
 * The shared `MarkDownPreview` profile trusts analyst content and keeps
 * forms, images, styles and arbitrary links. Here the goal is that an
 * attacker-chosen string cannot fake IRIS UI (a "session expired, re-enter
 * your password" form), beacon out through an image, or hide where a link
 * goes. Kept as a separate profile so the shared one is not weakened.
 */
import DOMPurify, { type Config } from 'dompurify';
import { converter } from './converter';
import { normalizeLegacyContent } from './legacy-content';

/** `/path` (not `//host` or `/\host`), `#anchor`, or `https:`. Nothing else. */
export const UNTRUSTED_ALLOWED_URI_REGEXP = /^(?:\/(?![/\\])|#|https:)/i;

export const UNTRUSTED_MARKDOWN_PURIFY_CONFIG: Config = {
	FORBID_TAGS: [
		'form',
		'input',
		'button',
		'textarea',
		'select',
		'option',
		'img',
		'style',
		'iframe',
		'object',
		'embed',
		'svg',
		'math',
		'video',
		'audio',
		'source',
		'link',
		'meta',
		'base'
	],
	FORBID_ATTR: ['style', 'id', 'name', 'class', 'srcset', 'action', 'formaction', 'target'],
	ALLOWED_URI_REGEXP: UNTRUSTED_ALLOWED_URI_REGEXP,
	ALLOW_DATA_ATTR: false,
	ALLOW_ARIA_ATTR: false
};

const EXTERNAL_REL = 'noopener noreferrer nofollow';

function escapeHtml(text: string): string {
	return text
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

/** Same test the browser would apply after dropping whitespace / controls. */
function isAllowedHref(href: string): boolean {
	// eslint-disable-next-line no-control-regex
	const strip = /[\u0000-\u0020\u00a0\u1680\u180e\u2000-\u2029\u205f\u3000\ufeff]/g;
	const compact = href.replace(strip, '');
	return UNTRUSTED_ALLOWED_URI_REGEXP.test(compact);
}

/**
 * Post-pass over sanitized anchors: internal links stay plain, external
 * (`https:`) ones open in a new tab with `rel=noopener noreferrer nofollow`
 * and show their full URL next to the text, so the label cannot disguise
 * the destination.
 */
function hardenLinks(root: ParentNode): void {
	for (const a of Array.from(root.querySelectorAll('a'))) {
		const href = a.getAttribute('href');
		if (href === null) continue;
		if (!isAllowedHref(href)) {
			a.removeAttribute('href');
			continue;
		}
		if (!/^https:/i.test(href.trim())) continue;
		a.setAttribute('target', '_blank');
		a.setAttribute('rel', EXTERNAL_REL);
		const text = (a.textContent ?? '').trim();
		if (text !== href.trim()) {
			a.after(a.ownerDocument.createTextNode(` (${href.trim()})`));
		}
	}
}

/**
 * Markdown → HTML under the strict profile. Without a DOM (SSR) the
 * input comes back as escaped text rather than unsanitized HTML.
 */
export function sanitizeUntrustedMarkdown(markdown: string | null | undefined): string {
	const source = markdown ?? '';
	if (!source) return '';
	if (!DOMPurify.isSupported) return `<p>${escapeHtml(source)}</p>`;
	const html = converter.makeHtml(normalizeLegacyContent(source));
	const body = DOMPurify.sanitize(html, {
		...UNTRUSTED_MARKDOWN_PURIFY_CONFIG,
		RETURN_DOM: true
	}) as HTMLElement;
	hardenLinks(body);
	return body.innerHTML;
}
