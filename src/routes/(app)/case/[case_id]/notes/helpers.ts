import { goto } from '$app/navigation';
import { page } from '$app/state';
import type { CaseNotesContext } from '$lib/contexts/case-notes.context.svelte';
import { collectLockedFolderIds } from '$lib/utils/note-mirror';

export const getNoteUrl = (noteId?: number) => {
	const url = new URL(page.url);

	return `${url.origin}/case/${page.params.case_id}/notes/${noteId}`;
};

export const newNote = async (notes: CaseNotesContext, folderId?: number) => {
	if (notes.list.tree.length === 0) {
		await notes.loadTree();
	}

	// Never create inside a locked war-room mirror folder (the backend
	// refuses it): skip locked candidates, falling back to the first
	// unlocked top-level folder.
	const locked = collectLockedFolderIds(notes.list.tree);
	const usable = (id: number | null | undefined) => (id != null && !locked.has(id) ? id : null);
	const targetFolderId =
		usable(folderId) ??
		usable(notes.ui.selectedFolderId) ??
		notes.list.tree.find((f) => !locked.has(f.id))?.id ??
		null;

	if (targetFolderId === null) return;

	const note = await notes.createNote({
		note_title: 'New note',
		note_content: '',
		directory_id: targetFolderId
	});

	if (note) {
		await goto(getNoteUrl(note.note_id));
	}
};
