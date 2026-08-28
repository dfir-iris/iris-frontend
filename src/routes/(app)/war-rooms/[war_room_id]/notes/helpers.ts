import { goto } from '$app/navigation';
import { page } from '$app/state';
import type { WarRoomNotesContext } from '$lib/contexts/war-room-notes.context.svelte';

export const getNoteUrl = (noteId?: number) => {
	const url = new URL(page.url);

	return `${url.origin}/war-rooms/${page.params.war_room_id}/notes/${noteId}`;
};

export const newNote = async (notes: WarRoomNotesContext, folderId?: number | null) => {
	if (notes.list.tree.length === 0) {
		await notes.loadTree();
	}

	// Prefer explicit folder → currently selected → root (folder_id === null)
	// so notes always land somewhere the user is looking at.
	const targetFolderId =
		folderId ?? (notes.ui.selectedFolderId !== undefined ? notes.ui.selectedFolderId : null);

	const note = await notes.createNote({
		title: 'New note',
		content: '',
		folder_id: targetFolderId
	});

	if (note) {
		await goto(getNoteUrl(note.note_id));
	}
};
