/**
 * Bridges war-room chat bodies into the shared markdown renderer.
 *
 * `<ChatMessageBody>` used to hand-parse a message into segments because
 * the composer's attachment references (`[IOC "x"](/case/1/iocs/2)`) and
 * `@mentions` have to render as interactive Svelte chips, not links.
 * Markdown output is an HTML string, so components can't be interleaved
 * into it directly.
 *
 * The way round it is two passes:
 *
 *  1. Before conversion, swap each composer reference for an empty
 *     `<span data-iris-chip=…>` placeholder. Showdown passes inline HTML
 *     through untouched and DOMPurify keeps `data-*`, so the placeholder
 *     survives into the rendered DOM with its metadata intact.
 *  2. After conversion, walk the rendered DOM: mark `@mentions` in text
 *     nodes (skipping code spans and links, which markdown owns), then
 *     mount a real component into every placeholder.
 *
 * Mentions deliberately are NOT done in pass 1: a pre-pass over the raw
 * source can't tell an `@name` in prose from one inside a code fence.
 */

const HTML_ESCAPES: Record<string, string> = {
	'&': '&amp;',
	'<': '&lt;',
	'>': '&gt;',
	'"': '&quot;'
};

const escapeAttr = (value: string): string => value.replace(/[&<>"]/g, (c) => HTML_ESCAPES[c]);

/** Composer-emitted resource reference: `[Event "Foo"](/case/123/timeline)`. */
const ATTACH_RE = /\[(Event|IOC|Asset|Task) "([^"]+)"\]\((\/[^)\s]+)\)/g;

/**
 * Datastore reference emitted when the operator picks a file with `#`.
 * Both ids come out of the href so the chip can hit the authenticated
 * content endpoint without a second round-trip.
 */
const DATASTORE_RE =
	/\[(Image|File) "([^"]+)"\]\((\/api\/v2\/war-rooms\/(\d+)\/datastore\/(\d+)\/content)\)/g;

/**
 * Any `data-iris-*` the author typed by hand. Stripped before we insert
 * our own: DOMPurify keeps `data-*` attributes, so without this an
 * operator could hand-write a span that renders as a genuine-looking IOC
 * chip pointing anywhere they like.
 */
const AUTHORED_MARKER_RE = /\sdata-iris-[\w-]*\s*=\s*("[^"]*"|'[^']*'|[^\s>]*)/gi;

/**
 * `@handle` at a word boundary. The negative lookbehind keeps the `@` in
 * an email address from matching. Handles are alphanumeric plus `._-`,
 * matching what the composer inserts off `user_login`.
 */
const MENTION_RE = /(?<![A-Za-z0-9._-])@([A-Za-z0-9._-]+)/g;

/** Elements whose text is markdown's business, not ours. */
const OPAQUE_TAGS = new Set(['A', 'CODE', 'PRE', 'SCRIPT', 'STYLE', 'TEXTAREA']);

/**
 * Rewrite a raw chat body into the markdown source handed to
 * `<MarkDownPreview>`, with composer references reduced to placeholders.
 */
export const toMarkdownSource = (body: string): string => {
	if (!body) return '';

	return body
		.replace(AUTHORED_MARKER_RE, '')
		.replace(
			DATASTORE_RE,
			(_match, kind: string, label: string, _href: string, warRoomId: string, fileId: string) =>
				`<span data-iris-chip="datastore" data-kind="${kind === 'Image' ? 'image' : 'file'}"` +
				` data-label="${escapeAttr(label)}" data-war-room="${warRoomId}" data-file="${fileId}"></span>`
		)
		.replace(
			ATTACH_RE,
			(_match, type: string, label: string, href: string) =>
				`<span data-iris-chip="resource" data-type="${type.toLowerCase()}"` +
				` data-label="${escapeAttr(label)}" data-href="${escapeAttr(href)}"></span>`
		);
};

/**
 * Replace every `@handle` in `root`'s text with an empty placeholder the
 * caller can mount a chip into. Skips text that markdown already claimed
 * (link labels, code) and placeholders from a previous run, so calling
 * this twice on the same tree is a no-op.
 */
export const markMentions = (root: HTMLElement): void => {
	const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
	const targets: Text[] = [];

	// Collect first, mutate after — replacing nodes mid-walk invalidates
	// the walker's position.
	let node: Node | null;
	while ((node = walker.nextNode()) !== null) {
		const text = node as Text;
		if (!text.data.includes('@')) continue;

		let parent = text.parentElement;
		let opaque = false;
		while (parent && parent !== root) {
			if (
				OPAQUE_TAGS.has(parent.tagName) ||
				parent.hasAttribute('data-iris-chip') ||
				parent.hasAttribute('data-iris-mention')
			) {
				opaque = true;
				break;
			}
			parent = parent.parentElement;
		}
		if (!opaque) targets.push(text);
	}

	for (const text of targets) {
		const source = text.data;
		const fragment = document.createDocumentFragment();
		let cursor = 0;

		MENTION_RE.lastIndex = 0;
		let match: RegExpExecArray | null;
		while ((match = MENTION_RE.exec(source)) !== null) {
			if (match.index > cursor) {
				fragment.appendChild(document.createTextNode(source.slice(cursor, match.index)));
			}
			const holder = document.createElement('span');
			holder.setAttribute('data-iris-mention', match[1]);
			fragment.appendChild(holder);
			cursor = match.index + match[0].length;
		}

		if (cursor === 0) continue;
		if (cursor < source.length) {
			fragment.appendChild(document.createTextNode(source.slice(cursor)));
		}
		text.replaceWith(fragment);
	}
};

export type ResourceChipType = 'event' | 'ioc' | 'asset' | 'task';

const RESOURCE_TYPES = new Set<ResourceChipType>(['event', 'ioc', 'asset', 'task']);

export const isResourceChipType = (value: string | null): value is ResourceChipType =>
	value !== null && RESOURCE_TYPES.has(value as ResourceChipType);

/**
 * Only same-origin absolute paths, which is all the composer ever emits.
 * Anything else came from hand-written markdown and doesn't get to drive
 * a navigation.
 */
export const isSafeChipHref = (href: string | null): href is string =>
	typeof href === 'string' && href.startsWith('/') && !href.startsWith('//');
