<script lang="ts">
	import { getContext } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { CASE_NOTES_CTX, type CaseNotesContext } from '$lib/contexts/case-notes.context.svelte';
	import MarkDownEditor from '$lib/components/common/MarkDown/MarkDownEditor.svelte';
	import NoteHeader from './note-header.svelte';

	const notes = getContext<CaseNotesContext>(CASE_NOTES_CTX);
	const noteId = $derived(Number(page.params.note_id));
	const note = $derived(notes.byId[noteId]);

	// Collaboration / save-state tracking, mirroring the case summary behavior.
	let draftContent = $state('');
	let baseContent = $state('');
	let saving = $state(false);
	let lastError = $state<string | null>(null);
	let savedAt = $state(0);
	let typingUser = $state<string | null>(null);
	let typingTimeout: ReturnType<typeof setTimeout> | null = null;

	let dirty = $derived(draftContent !== baseContent);

	// Track which note we've initialized content for, so switching notes
	// resets the draft/base without clobbering in-progress edits on the same note.
	let loadedForNoteId = $state<number | undefined>(undefined);

	// When the route's note id changes, reset draft state and fetch the
	// full note from the API. The tree listing doesn't always surface the
	// freshest content (another user may have saved since the tree was
	// loaded), so we always refetch on navigation to avoid showing stale
	// content from a sibling note.
	$effect(() => {
		const id = noteId;
		if (!Number.isFinite(id)) return;
		if (id === loadedForNoteId) return;

		loadedForNoteId = id;
		baseContent = '';
		draftContent = '';
		lastError = null;
		typingUser = null;

		notes.getNote(id).then((fresh) => {
			// Guard against a second navigation racing us — only apply if
			// we're still viewing the same note.
			if (loadedForNoteId !== id) return;
			if (!fresh) return;

			baseContent = fresh.note_content ?? '';
			draftContent = baseContent;
		});
	});

	const saveNote = async () => {
		if (!note) return;

		saving = true;
		lastError = null;

		try {
			const result = await notes.patchNote(note.note_id, {
				note_title: note.note_title,
				note_content: draftContent
			});

			if (result) {
				baseContent = draftContent;
				savedAt = Date.now();
			} else {
				lastError = 'Failed to save note';
			}
		} catch (e) {
			lastError = e instanceof Error ? e.message : 'Failed to save note';
		} finally {
			saving = false;
		}
	};

	const handleRemoteSave = (content: string) => {
		draftContent = content;
		baseContent = content;
		note.note_content = content;
	};

	const handleRemoteChange = (user: string) => {
		typingUser = user;
		if (typingTimeout) clearTimeout(typingTimeout);
		typingTimeout = setTimeout(() => (typingUser = null), 2000);
	};
</script>

<div class="flex h-full min-h-0 w-full flex-col bg-white dark:bg-black/80">
	{#if note}
		<div class="shrink-0 px-6 pt-4">
			<NoteHeader
				{note}
				{dirty}
				{saving}
				{lastError}
				{typingUser}
				onSaveNote={saveNote}
				onDeleteNote={() => {
					notes.removeNote(note.note_id);

					goto(`/case/${page.params.case_id}/notes`);
				}}
			/>
		</div>

		<div class="note-content-scroll min-h-0 flex-1 overflow-y-auto px-6 pb-6 pt-4">
			{#key note.note_id}
				<MarkDownEditor
					value={draftContent}
					onChange={(v) => {
						draftContent = v;
						note.note_content = v;
					}}
					onSave={saveNote}
					caseId={Number(page.params.case_id)}
					noteId={note.note_id}
					collabMode="note"
					{savedAt}
					onRemoteSave={handleRemoteSave}
					onRemoteChange={handleRemoteChange}
				/>
			{/key}
		</div>
	{/if}
</div>

<style>
	.note-content-scroll {
		scrollbar-width: thin;
		scrollbar-color: transparent transparent;
		transition: scrollbar-color 0.2s ease;
	}

	.note-content-scroll:hover {
		scrollbar-color: hsl(var(--muted-foreground) / 0.35) transparent;
	}

	.note-content-scroll::-webkit-scrollbar {
		width: 8px;
	}

	.note-content-scroll::-webkit-scrollbar-track {
		background: transparent;
	}

	.note-content-scroll::-webkit-scrollbar-thumb {
		background-color: transparent;
		border-radius: 999px;
		transition: background-color 0.2s ease;
	}

	.note-content-scroll:hover::-webkit-scrollbar-thumb {
		background-color: hsl(var(--muted-foreground) / 0.35);
	}

	.note-content-scroll::-webkit-scrollbar-thumb:hover {
		background-color: hsl(var(--muted-foreground) / 0.55);
	}
</style>
