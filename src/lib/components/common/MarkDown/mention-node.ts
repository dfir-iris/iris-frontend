import Mention from '@tiptap/extension-mention';
import type { SuggestionOptions } from '@tiptap/suggestion';
import type { MentionItem, MentionKind } from './MentionList.svelte';

/**
 * Build a Mention node for one trigger character. Tiptap's extension-mention
 * registers a single suggestion config per node instance, so each mention type
 * (user / asset / ioc / note / task) gets its own node name and trigger char.
 * They share rendering and markdown round-trip rules.
 *
 * Markdown round-trip. Tiptap-markdown serializes unknown nodes by their HTML
 * representation (markdown-it loads with html: true), so the chip renders as
 * a `<span data-mention …>` and parseHTML reads the same shape back. Stored
 * notes look like:
 *
 *   <span data-mention data-kind="user" data-id="42" data-label="John Doe">@John Doe</span>
 */

type StyleSpec = {
	colorClass: string;
	iconPath: string;
};

// Lucide-style stroke paths sized for 24x24 viewBox. Multi-subpath strings
// are valid SVG path data (space-separated M sequences each start a subpath).
const KIND_STYLE: Record<MentionKind, StyleSpec> = {
	user: {
		colorClass: 'bg-blue-500/15 text-blue-700 dark:text-blue-300',
		iconPath: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2 M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z'
	},
	team: {
		colorClass: 'bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-300',
		iconPath:
			'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M22 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75'
	},
	asset: {
		colorClass: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
		iconPath:
			'M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z'
	},
	ioc: {
		colorClass: 'bg-red-500/15 text-red-700 dark:text-red-300',
		iconPath: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z M12 9v4 M12 17h.01'
	},
	note: {
		colorClass: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
		iconPath:
			'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M16 13H8 M16 17H8 M10 9H8'
	},
	task: {
		colorClass: 'bg-violet-500/15 text-violet-700 dark:text-violet-300',
		iconPath:
			'M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2 M15 2H9a1 1 0 0 0-1 1v2a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V3a1 1 0 0 0-1-1z M9 14l2 2 4-4'
	},
	datastore: {
		colorClass: 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-300',
		iconPath:
			'M12 8c4.418 0 8-1.343 8-3s-3.582-3-8-3-8 1.343-8 3 3.582 3 8 3z M4 5v6c0 1.657 3.582 3 8 3s8-1.343 8-3V5 M4 11v6c0 1.657 3.582 3 8 3s8-1.343 8-3v-6'
	}
};

const ALL_KINDS = Object.keys(KIND_STYLE) as MentionKind[];

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
						return ALL_KINDS.includes(k as MentionKind) ? k : defaultKind;
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
			const { colorClass, iconPath } = KIND_STYLE[kind] ?? KIND_STYLE.user;
			return [
				'span',
				{
					...HTMLAttributes,
					'data-mention': '',
					role: 'button',
					tabindex: '0',
					class: `mention-chip mention-chip-clickable inline-flex items-center gap-0.5 rounded px-1 py-0 text-xs font-medium cursor-pointer ${colorClass}`
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
