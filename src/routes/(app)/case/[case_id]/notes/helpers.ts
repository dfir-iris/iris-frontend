import { goto } from '$app/navigation';
import { page } from '$app/state';
import type { CaseNotesContext } from '$lib/contexts/case-notes.context.svelte';

export const getNoteUrl = (noteId?: number) => {
	const url = new URL(page.url);

	return `${url.origin}/case/${page.params.case_id}/notes/${noteId}`;
};

export const newNote = async (notes: CaseNotesContext, folderId?: number) => {
	if (notes.list.tree.length === 0) {
		await notes.loadTree();
	}

	const targetFolderId = folderId ?? notes.ui.selectedFolderId ?? notes.list.tree[0]?.id ?? null;

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
