import type { Note, NoteFolder } from '$lib/types/resources/note';

/** A case note mirrored from a war room. Mirrors are read-only. */
export const isMirroredNote = (note: Partial<Note> | null | undefined): boolean =>
	!!note && (note.mirror != null || note.mirror_source_note_id != null);

/** The locked "War room · <name>" directory that holds mirrors. */
export const isLockedNoteFolder = (folder: Partial<NoteFolder> | null | undefined): boolean =>
	!!folder && folder.mirror_war_room_id != null;

/** Title used for the editable fork of a mirrored note. */
export const localCopyTitle = (title: string | null | undefined): string =>
	`${(title ?? '').trim() || 'Untitled note'} (copy)`;

/** First top-level directory a normal note may live in (skips locked ones). */
export const firstUnlockedFolder = (folders: NoteFolder[]): NoteFolder | undefined =>
	folders.find((folder) => !isLockedNoteFolder(folder));

/** Where to open the war-room source of a mirrored note. */
export const mirrorSourceUrl = (note: Partial<Note> | null | undefined): string | null => {
	if (!note) return null;
	const warRoomId = note.mirror?.war_room_id ?? note.mirror_war_room_id ?? null;
	const sourceId = note.mirror?.source_note_id ?? note.mirror_source_note_id ?? null;
	if (warRoomId == null) return null;
	return sourceId != null
		? `/war-rooms/${warRoomId}/notes/${sourceId}`
		: `/war-rooms/${warRoomId}/notes`;
};

/** Ids of locked folders and every folder nested under one. */
export const collectLockedFolderIds = (folders: NoteFolder[]): Set<number> => {
	const out = new Set<number>();
	const walk = (nodes: NoteFolder[], inherited: boolean) => {
		for (const folder of nodes) {
			const locked = inherited || isLockedNoteFolder(folder);
			if (locked) out.add(folder.id);
			walk(folder.subdirectories ?? [], locked);
		}
	};
	walk(folders, false);
	return out;
};
