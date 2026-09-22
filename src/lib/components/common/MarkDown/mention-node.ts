import Mention from '@tiptap/extension-mention';
import type { SuggestionOptions } from '@tiptap/suggestion';
import type { MentionItem } from './MentionList.svelte';
import {
	MENTION_CHIP_BASE_CLASSES,
	MENTION_KINDS,
	mentionKindStyle,
	type MentionKind
} from './mention-kinds';

/**
 * Build a Mention node for one trigger character. Tiptap's extension-mention
 * registers a single suggestion config per node instance, so each *trigger*
 * gets its own node name — `userMention` for `@`, `caseMention` for `#`.
 * Several kinds ride one node (`caseMention` accepts asset / ioc / note /
 * task / datastore / alert) and are told apart by `data-kind`; a second node
 * bound to the same trigger char would double-fire its suggestion plugin.
 *
 * Appearance is not decided here — `./mention-kinds` owns the kind→colour
 * and kind→icon-path table shared with `Chip.svelte`, `MentionPopover` and
 * the read-only preview sweep.
 *
 * Markdown round-trip. Tiptap-markdown serializes unknown nodes by their HTML
 * representation (markdown-it loads with html: true), so the chip renders as
 * a `<span data-mention …>` and parseHTML reads the same shape back. Stored
 * notes look like:
 *
 *   <span data-mention data-kind="user" data-id="42" data-label="John Doe">@John Doe</span>
 */

export const createMentionNode = (
	name: string,
	defaultKind: MentionKind,
	suggestion: Omit<SuggestionOptions<MentionItem>, 'editor'>,
	acceptedKinds: MentionKind[] = [defaultKind]
) =>
	Mention.extend({
		name,
		addAttributes() {
			return {
				id: {
					default: null,
					parseHTML: (el) => el.getAttribute('data-id'),
					renderHTML: (attrs) => (attrs.id ? { 'data-id': String(attrs.id) } : {})
				},
				label: {
					default: null,
					parseHTML: (el) =>
						el.getAttribute('data-label') ?? el.textContent?.replace(/^[@#!&%]/, ''),
					renderHTML: (attrs) => (attrs.label ? { 'data-label': String(attrs.label) } : {})
				},
				kind: {
					default: defaultKind,
					parseHTML: (el) => {
						const k = el.getAttribute('data-kind') ?? defaultKind;
						return MENTION_KINDS.includes(k as MentionKind) ? k : defaultKind;
					},
					renderHTML: (attrs) => ({ 'data-kind': attrs.kind ?? defaultKind })
				}
			};
		},
		parseHTML() {
			// Each node type parses any `<span data-mention>` whose data-kind
			// is in its accepted set. This routes saved chips back to the
			// right node type so suggestion configs don't get confused.
			return [
				{
					tag: 'span[data-mention]',
					getAttrs: (el) => {
						if (!(el instanceof HTMLElement)) return false;
						const k = (el.getAttribute('data-kind') ?? defaultKind) as MentionKind;
						return acceptedKinds.includes(k) ? null : false;
					}
				}
			];
		},
		renderHTML({ node, HTMLAttributes }) {
			const kind = ((node.attrs.kind as string) ?? defaultKind) as MentionKind;
			const label = (node.attrs.label as string) ?? '';
			const { chipClass, iconPath } = mentionKindStyle(kind);
			return [
				'span',
				{
					...HTMLAttributes,
					'data-mention': '',
					role: 'button',
					tabindex: '0',
					class: `${MENTION_CHIP_BASE_CLASSES} ${chipClass}`
				},
				[
					'svg',
					{
						class: 'mention-chip-icon',
						xmlns: 'http://www.w3.org/2000/svg',
						width: '10',
						height: '10',
						viewBox: '0 0 24 24',
						fill: 'none',
						stroke: 'currentColor',
						'stroke-width': '2',
						'stroke-linecap': 'round',
						'stroke-linejoin': 'round',
						'aria-hidden': 'true'
					},
					['path', { d: iconPath }]
				],
				['span', { class: 'mention-chip-label' }, label]
			];
		}
	}).configure({
		suggestion,
		HTMLAttributes: {
			class: 'mention-chip'
		}
	});
