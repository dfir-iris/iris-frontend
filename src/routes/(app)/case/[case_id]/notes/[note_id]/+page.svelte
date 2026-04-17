<script lang="ts">
	import { setContext } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import {
		CASE_NOTES_CTX,
		createCaseNotesContext,
		type CaseNotesContext
	} from '$lib/contexts/case-notes.context.svelte';
	import MarkDownEditor from '$lib/components/common/MarkDown/MarkDownEditor.svelte';
	import { getNoteUrl } from '../helpers';
	import NoteHeader from './note-header.svelte';

	const notes = createCaseNotesContext(() => Number(page.params.case_id));
	const note = $derived(notes.byId[Number(page.params.note_id)]);

	setContext<CaseNotesContext>(CASE_NOTES_CTX, notes);

	$effect(() => {
		notes.loadTree();
	});
</script>

<div class="flex h-full w-full grow flex-col gap-y-8 px-4 pt-2">
	{#if note}
		<NoteHeader
			{note}
			onDeleteNote={() => {
				notes.removeNote(note.note_id);

				goto(getNoteUrl(notes.list.noteIds[0]));
			}}
		/>

		<MarkDownEditor
			value={note.note_content ?? ''}
			onChange={(v) => (note.note_content = v)}
			onSave={() => notes.patchNote(note.note_id, { note_content: note.note_content })}
		/>
	{/if}
</div>
