/**
 * The single kind→appearance table behind every mention chip.
 *
 * This used to be copy-pasted four ways — `KIND_STYLE` in `mention-node.ts`,
 * `colorFor` in `Chip.svelte`, `styleFor` in `MentionPopover.svelte` and the
 * suggestion-list icons — which meant adding a kind was four edits in four
 * files that silently drifted apart (`Chip.svelte` never learned about
 * `team`, for one). Everything now reads from here, so a new kind is one
 * entry plus its lucide glyph in `./mention-icons`.
 *
 * Deliberately free of Svelte and lucide imports: `mention-node.ts` is a
 * plain TS module handed to tiptap's schema, and it renders its chip as a
 * ProseMirror DOM spec — raw SVG path data, not a component. The lucide
 * component per kind lives in the sibling `./mention-icons` so importing
 * this table never drags the icon pack into the editor bundle.
 */

export type MentionKind =
	| 'user'
	| 'team'
	| 'asset'
	| 'ioc'
	| 'note'
	| 'task'
	| 'datastore'
	| 'alert';

export type MentionKindStyle = {
	/** Background + text colour of the inline chip itself. */
	chipClass: string;
	/** Background of the round glyph bubble in `MentionPopover`. */
	popoverBgClass: string;
	/**
	 * Glyph colour in `MentionPopover`. One shade lighter than the chip's
	 * text because it sits on a saturated bubble rather than on the page.
	 */
	popoverFgClass: string;
	/**
	 * Lucide-style stroke path sized for a 24x24 viewBox. Multi-subpath
	 * strings are valid SVG path data — each `M` starts a new subpath — so
	 * one `<path d>` is enough for even the multi-stroke glyphs.
	 */
	iconPath: string;
};

export const MENTION_KIND_STYLE: Record<MentionKind, MentionKindStyle> = {
	user: {
		chipClass: 'bg-blue-500/15 text-blue-700 dark:text-blue-300',
		popoverBgClass: 'bg-blue-500/15',
		popoverFgClass: 'text-blue-600 dark:text-blue-300',
		iconPath: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2 M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z'
	},
	team: {
		chipClass: 'bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-300',
		popoverBgClass: 'bg-fuchsia-500/15',
		popoverFgClass: 'text-fuchsia-600 dark:text-fuchsia-300',
		iconPath:
			'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M22 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75'
	},
	asset: {
		chipClass: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
		popoverBgClass: 'bg-amber-500/15',
		popoverFgClass: 'text-amber-600 dark:text-amber-300',
		iconPath:
			'M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z'
	},
	ioc: {
		chipClass: 'bg-red-500/15 text-red-700 dark:text-red-300',
		popoverBgClass: 'bg-red-500/15',
		popoverFgClass: 'text-red-600 dark:text-red-300',
		iconPath: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z M12 9v4 M12 17h.01'
	},
	note: {
		chipClass: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
		popoverBgClass: 'bg-emerald-500/15',
		popoverFgClass: 'text-emerald-600 dark:text-emerald-300',
		iconPath:
			'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M16 13H8 M16 17H8 M10 9H8'
	},
	task: {
		chipClass: 'bg-violet-500/15 text-violet-700 dark:text-violet-300',
		popoverBgClass: 'bg-violet-500/15',
		popoverFgClass: 'text-violet-600 dark:text-violet-300',
		iconPath:
			'M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2 M15 2H9a1 1 0 0 0-1 1v2a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V3a1 1 0 0 0-1-1z M9 14l2 2 4-4'
	},
	datastore: {
		chipClass: 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-300',
		popoverBgClass: 'bg-cyan-500/15',
		popoverFgClass: 'text-cyan-600 dark:text-cyan-300',
		iconPath:
			'M12 8c4.418 0 8-1.343 8-3s-3.582-3-8-3-8 1.343-8 3 3.582 3 8 3z M4 5v6c0 1.657 3.582 3 8 3s8-1.343 8-3V5 M4 11v6c0 1.657 3.582 3 8 3s8-1.343 8-3v-6'
	},
	alert: {
		chipClass: 'bg-orange-500/15 text-orange-700 dark:text-orange-300',
		popoverBgClass: 'bg-orange-500/15',
		popoverFgClass: 'text-orange-600 dark:text-orange-300',
		iconPath: 'M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9 M10.3 21a1.94 1.94 0 0 0 3.4 0'
	}
};

export const MENTION_KINDS = Object.keys(MENTION_KIND_STYLE) as MentionKind[];

export const isMentionKind = (value: string | null | undefined): value is MentionKind =>
	value != null && Object.prototype.hasOwnProperty.call(MENTION_KIND_STYLE, value);

/**
 * Appearance for a kind read off a `data-kind` attribute, i.e. a string that
 * has been round-tripped through markdown and may well be garbage or a kind
 * written by a newer backend. Falls back to `user` — the same fallback the
 * tiptap node uses — so an unknown kind renders as a plain chip instead of
 * throwing halfway through a ProseMirror render.
 */
export const mentionKindStyle = (kind: string | null | undefined): MentionKindStyle =>
	isMentionKind(kind) ? MENTION_KIND_STYLE[kind] : MENTION_KIND_STYLE.user;

/**
 * Trigger character a chip of this kind is authored with, and which the
 * stored markup carries in its text body. Mirrors the strip pattern in
 * `mention-node.ts`'s `label` parseHTML.
 */
export const mentionTriggerChar = (kind: MentionKind): '@' | '#' =>
	kind === 'user' || kind === 'team' ? '@' : '#';

/**
 * Classes every chip carries regardless of kind. Kept next to the colour
 * table so the tiptap node, `Chip.svelte` and the preview sweep can't drift
 * on padding/typography either. The layout rules behind `.mention-chip`
 * itself live in `src/app.css`.
 */
export const MENTION_CHIP_BASE_CLASSES =
	'mention-chip mention-chip-clickable inline-flex items-center gap-0.5 rounded px-1 py-0 text-xs font-medium cursor-pointer';
