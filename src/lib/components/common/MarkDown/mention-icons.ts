/*
 *  IRIS Source Code
 *  Copyright (C) 2026 - DFIR-IRIS
 *  contact@dfir-iris.org
 *
 *  This program is free software; you can redistribute it and/or
 *  modify it under the terms of the GNU Lesser General Public
 *  License as published by the Free Software Foundation; either
 *  version 3 of the License, or (at your option) any later version.
 *
 *  This program is distributed in the hope that it will be useful,
 *  but WITHOUT ANY WARRANTY; without even the implied warranty of
 *  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU
 *  Lesser General Public License for more details.
 *
 *  You should have received a copy of the GNU Lesser General Public License
 *  along with this program; if not, write to the Free Software Foundation,
 *  Inc., 51 Franklin Street, Fifth Floor, Boston, MA  02110-1301, USA.
 */

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
