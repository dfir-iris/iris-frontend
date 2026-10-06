/**
 * Note-sharing state for the war-room notes tab. The notes layout owns
 * one instance: the tree reads `index` for its "shared" badges, the
 * note detail view reads `forNote` for its share strip, and every
 * "Share…" entry point calls `openDialog` so a single dialog instance
 * (mounted by the layout) serves the whole tab.
 */
import { getContext } from 'svelte';
import {
	WarRoomNoteSharesService,
	buildNoteShareIndex,
	type NoteShare
} from '$lib/services/war-room-note-shares.service';

export const WAR_ROOM_NOTE_SHARES_CTX = Symbol('war-room-note-shares');

export type NoteShareDialogTarget =
	| { kind: 'note'; id: number; label: string }
	| { kind: 'folder'; id: number; label: string };

export const createWarRoomNoteSharesContext = (getWarRoomId: () => number) => {
	let shares = $state<NoteShare[]>([]);
	let loaded = $state(false);
	let dialogTarget = $state<NoteShareDialogTarget | null>(null);
	let dialogOpen = $state(false);

	const index = $derived(buildNoteShareIndex(shares));

	const load = async () => {
		const warRoomId = getWarRoomId();
		if (!Number.isFinite(warRoomId)) return;
		const res = await WarRoomNoteSharesService.list(warRoomId);
		// Only accept the payload if the room didn't change mid-flight.
		if (getWarRoomId() !== warRoomId) return;
		if (res.ok && Array.isArray(res.data)) shares = res.data;
		loaded = true;
	};

	const reset = () => {
		shares = [];
		loaded = false;
		dialogOpen = false;
		dialogTarget = null;
	};

	return {
		get shares() {
			return shares;
		},
		get loaded() {
			return loaded;
		},
		get index() {
			return index;
		},
		get dialogTarget() {
			return dialogTarget;
		},
		get dialogOpen() {
			return dialogOpen;
		},
		set dialogOpen(value: boolean) {
			dialogOpen = value;
		},
		forNote: (noteId: number) => shares.filter((s) => s.note_id === noteId),
		forFolder: (folderId: number) => shares.filter((s) => s.folder_id === folderId),
		openDialog: (target: NoteShareDialogTarget) => {
			dialogTarget = target;
			dialogOpen = true;
		},
		load,
		reset
	};
};

export type WarRoomNoteSharesContext = ReturnType<typeof createWarRoomNoteSharesContext>;

/** Optional lookup: components reused outside the notes layout get `undefined`. */
export const useWarRoomNoteShares = (): WarRoomNoteSharesContext | undefined =>
	getContext<WarRoomNoteSharesContext | undefined>(WAR_ROOM_NOTE_SHARES_CTX);
