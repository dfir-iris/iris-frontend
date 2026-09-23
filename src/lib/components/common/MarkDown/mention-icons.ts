/**
 * Lucide glyph per mention kind, for the consumers that render Svelte
 * components — the suggestion list, `Chip.svelte` and `MentionPopover`.
 *
 * Split out of `./mention-kinds` on purpose: the tiptap node in
 * `mention-node.ts` renders through a ProseMirror DOM spec and only ever
 * wants the raw path data, so it must be able to import the colour table
 * without pulling `lucide-svelte` in behind it. The two files are expected
 * to stay key-for-key identical — `MENTION_KIND_ICON` is typed against
 * `MentionKind`, so adding a kind to one and forgetting the other is a
 * type error rather than a missing glyph at runtime.
 */

import {
	BellIcon,
	BoxIcon,
	ClipboardListIcon,
	DatabaseIcon,
	FileTextIcon,
	ShieldAlertIcon,
	UserIcon,
	UsersIcon
} from 'lucide-svelte';
import { isMentionKind, type MentionKind } from './mention-kinds';

const MENTION_KIND_ICON: Record<MentionKind, typeof UserIcon> = {
	user: UserIcon,
	team: UsersIcon,
	asset: BoxIcon,
	ioc: ShieldAlertIcon,
	note: FileTextIcon,
	task: ClipboardListIcon,
	datastore: DatabaseIcon,
	alert: BellIcon
};

/**
 * Same `user` fallback as `mentionKindStyle`, for the same reason: the kind
 * may have come off a `data-kind` attribute rather than our own enum.
 */
export const mentionKindIcon = (kind: string | null | undefined): typeof UserIcon =>
	isMentionKind(kind) ? MENTION_KIND_ICON[kind] : MENTION_KIND_ICON.user;
