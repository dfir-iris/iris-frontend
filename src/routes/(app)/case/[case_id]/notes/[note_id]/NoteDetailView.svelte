<!--
  Note detail panel. Renders the note header + the collaborative markdown
  editor for one note. Used by:
    - the note route page  (/case/:case_id/notes/:note_id)
    - the NoteDetailDialog (modal opened from mention chips)

  Save/draft/collab state lives here so the surrounding shell stays dumb.
-->
<script lang="ts">
	import { getContext } from 'svelte';
	import { CASE_NOTES_CTX, type CaseNotesContext } from '$lib/contexts/case-notes.context.svelte';
	import MarkDownEditor from '$lib/components/common/MarkDown/MarkDownEditor.svelte';
	import NoteHeader from './note-header.svelte';

	let {
		caseId,
		noteId,
		onAfterDelete
	}: {
		caseId: number;
		noteId: number;
		onAfterDelete?: () => void;
	} = $props();

	const notes = getContext<CaseNotesContext>(CASE_NOTES_CTX);
	const note = $derived(notes.byId[noteId]);

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
		if (note) note.note_content = content;
	};

	const handleRemoteChange = (user: string) => {
		typingUser = user;
		if (typingTimeout) clearTimeout(typingTimeout);
		typingTimeout = setTimeout(() => (typingUser = null), 2000);
	};

	const handleDelete = async () => {
		if (!note) return;
		await notes.removeNote(note.note_id);
		onAfterDelete?.();
	};

	const handleRestoredRevision = (fresh: { note_content?: string }) => {
		// The revisions dialog already pushed the new content into the
		// case-notes context, so `note.note_content` is reactive. The
		// editor pane reads from `draftContent` though, which isn't
		// reactive against the note — sync it explicitly so the
		// markdown body the user sees matches what was restored.
		const next = fresh.note_content ?? '';
		baseContent = next;
		draftContent = next;
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
				onDeleteNote={handleDelete}
				onRestoreRevision={handleRestoredRevision}
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
					{caseId}
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
