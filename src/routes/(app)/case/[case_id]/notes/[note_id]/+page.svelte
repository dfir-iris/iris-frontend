<script lang="ts">
	import { getContext } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { CASE_NOTES_CTX, type CaseNotesContext } from '$lib/contexts/case-notes.context.svelte';
	import MarkDownEditor from '$lib/components/common/MarkDown/MarkDownEditor.svelte';
	import NoteHeader from './note-header.svelte';

	const notes = getContext<CaseNotesContext>(CASE_NOTES_CTX);
	const note = $derived(notes.byId[Number(page.params.note_id)]);

	$effect(() => {
		notes.loadTree();
	});

	const saveNote = async () => {
		await notes.patchNote(note.note_id, {
			note_title: note.note_title,
			note_content: note.note_content
		});
	};
</script>

<div class="flex h-full w-full grow flex-col gap-y-8 bg-white px-4 pt-2 dark:bg-black/80">
	{#if note}
		<NoteHeader
			{note}
			onSaveNote={saveNote}
			onDeleteNote={() => {
				notes.removeNote(note.note_id);

				goto(`/case/${page.params.case_id}/notes`);
			}}
		/>

		<MarkDownEditor
			value={note.note_content ?? ''}
			onChange={(v) => (note.note_content = v)}
			onSave={saveNote}
		/>
	{/if}
</div>
