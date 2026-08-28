<!--
  War-room note detail panel. Structural mirror of the case-notes
  `NoteDetailView` — reads the note from the war-room-notes context,
  drives the collaborative markdown editor, forwards restore events
  back to the header so the editor state can be reseeded.

  Diverges from the case version on: prop shape (`warRoomId` +
  `noteId` instead of `caseId`), context (`WAR_ROOM_NOTES_CTX`),
  field names (`title`/`content` instead of `note_title`/`note_content`),
  and MarkDownEditor `collabMode="war-room-note"` so the Yjs room
  key routes to a war-room-specific channel.
-->
<script lang="ts">
	import { getContext } from 'svelte';
	import {
		WAR_ROOM_NOTES_CTX,
		type WarRoomNotesContext
	} from '$lib/contexts/war-room-notes.context.svelte';
	import MarkDownEditor from '$lib/components/common/MarkDown/MarkDownEditor.svelte';
	import NoteHeader from './note-header.svelte';

	let {
		warRoomId: _warRoomId,
		noteId,
		onAfterDelete
	}: {
		warRoomId: number;
		noteId: number;
		onAfterDelete?: () => void;
	} = $props();

	const notes = getContext<WarRoomNotesContext>(WAR_ROOM_NOTES_CTX);
	const note = $derived(notes.byId[noteId]);

	// War rooms don't (yet) have a per-user access-level check like
	// cases — every member of a war room can edit its notes. If we
	// gain a read-only role later, wire it into `canEdit` here.
	const canEdit = true;

	let draftContent = $state('');
	let baseContent = $state('');
	let saving = $state(false);
	let lastError = $state<string | null>(null);
	let savedAt = $state(0);
	let typingUser = $state<string | null>(null);
	let typingTimeout: ReturnType<typeof setTimeout> | null = null;

	let dirty = $derived(draftContent !== baseContent);

	// Track which note we've initialised for so navigating between
	// notes resets the draft/base without clobbering in-progress edits
	// on the same note.
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

			baseContent = fresh.content ?? '';
			draftContent = baseContent;
		});
	});

	const saveNote = async () => {
		if (!note) return;

		saving = true;
		lastError = null;

		try {
			const result = await notes.patchNote(note.note_id, {
				title: note.title,
				content: draftContent
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
		if (note) note.content = content;
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

	const handleRestoredRevision = (fresh: { content?: string | null }) => {
		// The revisions dialog wrote the new content into the context,
		// but the editor pane reads from local `draftContent` — sync
		// so what the user sees matches what was restored.
		const next = fresh.content ?? '';
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
				{canEdit}
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
						note.content = v;
					}}
					onSave={saveNote}
					warRoomNoteId={note.note_id}
					collabMode="war-room-note"
					{savedAt}
					onRemoteSave={handleRemoteSave}
					onRemoteChange={handleRemoteChange}
					readOnly={!canEdit}
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
