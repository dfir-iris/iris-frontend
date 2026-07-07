<!--
  War-room notes. Same UX shape as the case-side notes:

    * Resizable left pane with note list + search + new-note button.
    * Right pane: editable title, ID/UUID, save state badge, action
      toolbar (save / copy link / copy md link / download / delete),
      and the same MarkDownEditor case notes use.

  Folders / drag-drop / revisions aren't implemented yet at the
  backend level — they're the only deltas from the case experience.
  The visual chrome is identical so an operator switching between
  case and war-room notes doesn't have to relearn anything.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import {
		DownloadIcon,
		FilePlusIcon,
		FileSymlinkIcon,
		FileText,
		ForwardIcon,
		Loader2,
		SaveIcon,
		SearchIcon,
		TrashIcon,
		XIcon
	} from 'lucide-svelte';
	import { goto } from '$app/navigation';
	import { Button } from '$lib/components/ui/button';
	import Badge from '$lib/components/ui/badge/badge.svelte';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import * as Resizable from '$lib/components/ui/resizable/index.js';
	import {
		Tooltip,
		TooltipContent,
		TooltipProvider,
		TooltipTrigger
	} from '$lib/components/ui/tooltip';
	import ConfirmationDialog from '$lib/components/ui/dialog/ConfirmationDialog.svelte';
	import { toast } from '$lib/components/ui/toast';
	import { MarkDownEditor } from '$lib/components/common/MarkDown';
	import { stripMentionChipsForExport } from '$lib/components/common/MarkDown/export';
	import NotesRenameDialog from '../../../case/[case_id]/notes/components/notes-rename-dialog.svelte';
	import {
		WarRoomNotesService,
		type WarRoomNote
	} from '$lib/services/war-room-notes.service';

	const warRoomId = $derived(Number(page.params.war_room_id));

	let notes = $state<WarRoomNote[]>([]);
	let loading = $state(true);
	let selectedId = $state<number | null>(null);

	let searchTerm = $state('');
	let searchDebounceTimer: number | undefined;
	let visibleSearchTerm = $state('');

	let creating = $state(false);
	let saving = $state(false);
	let dirty = $state(false);
	let lastError = $state<string | null>(null);
	let draftContent = $state('');
	let savedAtMs = $state<number | undefined>(undefined);

	let showRename = $state(false);
	let showConfirmDelete = $state(false);

	// Layout sizing tuned to match the case notes pane sizes so the
	// operator's spatial muscle memory carries over.
	const defaultSidebarSize = 22;
	const minSidebarSize = 12;
	const maxSidebarSize = 50;

	const load = async () => {
		loading = true;
		const res = await WarRoomNotesService.list(warRoomId);
		if (res.ok && Array.isArray(res.data)) {
			notes = res.data;
			if (notes.length > 0 && selectedId == null) {
				selectedId = notes[0].note_id;
			}
		}
		loading = false;
	};

	onMount(load);

	const selected = $derived(notes.find((n) => n.note_id === selectedId) ?? null);

	$effect(() => {
		// Sync the editor draft to the selected note. Without this guard
		// the draft from one note would bleed into the next on click.
		if (selected) {
			draftContent = selected.content ?? '';
			dirty = false;
			lastError = null;
			savedAtMs = selected.updated_at
				? new Date(selected.updated_at).getTime()
				: undefined;
		} else {
			draftContent = '';
			dirty = false;
			savedAtMs = undefined;
		}
	});

	// Debounced search. The list is flat & in-memory so we don't even
	// need a network round-trip — applies the filter on the next tick.
	$effect(() => {
		const term = searchTerm;
		clearTimeout(searchDebounceTimer);
		searchDebounceTimer = window.setTimeout(() => {
			visibleSearchTerm = term;
		}, 200);
	});

	const filteredNotes = $derived.by(() => {
		const q = visibleSearchTerm.trim().toLowerCase();
		if (!q) return notes;
		return notes.filter(
			(n) =>
				n.title.toLowerCase().includes(q) ||
				(n.content ?? '').toLowerCase().includes(q)
		);
	});

	const clearSearch = () => {
		searchTerm = '';
		visibleSearchTerm = '';
	};

	const newNote = async () => {
		creating = true;
		const res = await WarRoomNotesService.create(warRoomId, {
			title: 'New note',
			content: ''
		});
		creating = false;
		if (res.ok && res.data && typeof res.data !== 'string') {
			const next = res.data as WarRoomNote;
			notes = [next, ...notes];
			selectedId = next.note_id;
			showRename = true; // open the rename dialog right away
		} else {
			toast({ title: 'Could not create note', variant: 'destructive' });
		}
	};

	const save = async () => {
		if (!selected) return;
		saving = true;
		lastError = null;
		const res = await WarRoomNotesService.update(warRoomId, selected.note_id, {
			content: draftContent
		});
		saving = false;
		if (res.ok && res.data && typeof res.data !== 'string') {
			const next = res.data as WarRoomNote;
			notes = notes.map((n) => (n.note_id === next.note_id ? next : n));
			dirty = false;
			savedAtMs = Date.now();
		} else {
			lastError =
				typeof res.data === 'string'
					? res.data
					: (res.error?.message ?? 'Save failed');
			toast({
				title: 'Could not save',
				description: lastError,
				variant: 'destructive'
			});
		}
	};

	const renameNote = async (name: string) => {
		if (!selected) return;
		const res = await WarRoomNotesService.update(warRoomId, selected.note_id, {
			title: name
		});
		showRename = false;
		if (res.ok && res.data && typeof res.data !== 'string') {
			const next = res.data as WarRoomNote;
			notes = notes.map((n) => (n.note_id === next.note_id ? next : n));
		}
	};

	const deleteNote = async () => {
		if (!selected) return;
		const id = selected.note_id;
		const res = await WarRoomNotesService.remove(warRoomId, id);
		showConfirmDelete = false;
		if (res.ok) {
			notes = notes.filter((n) => n.note_id !== id);
			selectedId = notes[0]?.note_id ?? null;
		} else {
			toast({ title: 'Could not delete note', variant: 'destructive' });
		}
	};

	const onChange = (v: string) => {
		draftContent = v;
		if (selected) {
			selected.content = v;
		}
		dirty = true;
	};

	const getNoteShareUrl = (noteId: number) =>
		`${window.location.origin}/war-rooms/${warRoomId}/notes#${noteId}`;

	const copyShareLink = (noteId: number) => {
		navigator.clipboard
			.writeText(getNoteShareUrl(noteId))
			.then(() => toast({ title: 'Link copied', variant: 'success' }))
			.catch(() =>
				toast({ title: 'Could not copy link', variant: 'destructive' })
			);
	};

	const copyMdLink = (noteId: number) => {
		const note = notes.find((n) => n.note_id === noteId);
		const title = note?.title ?? `Note #${noteId}`;
		navigator.clipboard
			.writeText(`[${title}](${getNoteShareUrl(noteId)})`)
			.then(() => toast({ title: 'Link copied', variant: 'success' }))
			.catch(() =>
				toast({ title: 'Could not copy link', variant: 'destructive' })
			);
	};

	const downloadMarkdown = () => {
		if (!selected) return;
		const safeName =
			(selected.title || 'note')
				.replace(/[^a-zA-Z0-9]+/g, '_')
				.replace(/^_+|_+$/g, '') || 'note';
		const cleanContent = stripMentionChipsForExport(selected.content ?? '');
		const blob = new Blob([cleanContent], {
			type: 'text/markdown;charset=utf-8'
		});
		const url = URL.createObjectURL(blob);
		const link = document.createElement('a');
		link.href = url;
		link.download = `${safeName}.md`;
		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);
		URL.revokeObjectURL(url);
	};

	// Deep-link support: `/war-rooms/<id>/notes#<note_id>` lands on a
	// specific note. Matches the share-link helper above so a pasted
	// link inside the chat or a SitRep navigates straight to the note.
	$effect(() => {
		const hash = page.url.hash.replace('#', '');
		const asNum = Number(hash);
		if (Number.isFinite(asNum) && asNum > 0 && notes.some((n) => n.note_id === asNum)) {
			selectedId = asNum;
		}
	});
</script>

<div class="flex h-full w-full">
	<Resizable.PaneGroup direction="horizontal" class="h-full w-full">
		<Resizable.Pane
			defaultSize={defaultSidebarSize}
			minSize={minSidebarSize}
			maxSize={maxSidebarSize}
			class="relative flex h-full min-h-0 flex-col border-r border-border/50"
		>
			<div class="flex flex-row items-center gap-1 px-3 pb-2 pt-3">
				<h2 class="w-full text-lg font-semibold">Notes</h2>
				<Button
					variant="ghost"
					size="icon"
					aria-label="New note"
					title="New note"
					class="h-8 w-8"
					onclick={newNote}
					disabled={creating}
				>
					{#if creating}
						<Loader2 class="h-4 w-4 animate-spin" />
					{:else}
						<FilePlusIcon class="h-4 w-4" />
					{/if}
				</Button>
			</div>

			<div class="px-3 pb-2">
				<div class="relative">
					<SearchIcon
						class="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
					/>
					<input
						type="text"
						placeholder="Search notes…"
						bind:value={searchTerm}
						class="h-9 w-full rounded-md border border-border/50 bg-background pl-7 pr-7 text-sm focus:border-ring focus:outline-none"
					/>
					{#if searchTerm}
						<button
							type="button"
							aria-label="Clear search"
							class="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
							onclick={clearSearch}
						>
							<XIcon class="size-3.5" />
						</button>
					{/if}
				</div>
			</div>

			<div class="notes-list-scroll min-h-0 flex-1 overflow-y-auto px-2 pb-4">
				{#if loading}
					<div class="space-y-2 px-2">
						<Skeleton class="h-7 w-full" />
						<Skeleton class="h-7 w-full" />
						<Skeleton class="h-7 w-full" />
					</div>
				{:else if filteredNotes.length === 0}
					<div class="px-2 py-4 text-center text-xs text-muted-foreground">
						{visibleSearchTerm
							? `No notes match “${visibleSearchTerm}”`
							: 'No notes yet. Create your first.'}
					</div>
				{:else}
					<ul class="space-y-0.5">
						{#each filteredNotes as n (n.note_id)}
							{@const active = selectedId === n.note_id}
							<li>
								<button
									type="button"
									class={[
										'group flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted/60',
										active ? 'bg-muted/80 font-medium' : ''
									]}
									onclick={() => (selectedId = n.note_id)}
								>
									<FileText
										class="mt-0.5 size-3.5 shrink-0 text-muted-foreground group-hover:text-foreground"
									/>
									<span class="min-w-0 flex-1">
										<span class="block truncate">{n.title || 'Untitled note'}</span>
										{#if n.updated_at}
											<span class="block truncate text-2xs text-muted-foreground">
												{new Date(n.updated_at).toLocaleString()}
											</span>
										{/if}
									</span>
								</button>
							</li>
						{/each}
					</ul>
				{/if}
			</div>
		</Resizable.Pane>

		<Resizable.Handle class="bg-transparent hover:bg-border" />

		<Resizable.Pane class="flex h-full min-h-0 flex-col overflow-hidden">
			{#if !selected}
				<div class="flex h-full items-center justify-center text-sm text-muted-foreground">
					Select a note or create a new one.
				</div>
			{:else}
				<!-- Header: title, id/uuid, status badge, action toolbar -->
				<div class="border-b px-6 pb-3 pt-4">
					<div class="flex items-start justify-between gap-4">
						<div class="flex min-w-0 flex-col">
							<div
								role="button"
								tabindex="0"
								title={selected.title}
								class="cursor-pointer truncate rounded-sm px-1 text-xl font-semibold leading-tight transition-colors hover:bg-muted/60"
								onclick={() => (showRename = true)}
								onkeydown={(e) => {
									if (e.key === 'Enter' || e.key === ' ') {
										e.preventDefault();
										showRename = true;
									}
								}}
							>
								{selected.title || 'Untitled note'}
							</div>

							<div class="mt-1 flex items-center gap-2 px-1 text-xs text-muted-foreground">
								<span class="truncate">#{selected.note_id}</span>
								{#if selected.updated_at}
									<span class="opacity-60">·</span>
									<span class="truncate">
										Updated {new Date(selected.updated_at).toLocaleString()}
									</span>
								{/if}
							</div>
						</div>

						<div class="flex items-center gap-2">
							{#if lastError}
								<Badge variant="compromised" class="flex px-2 py-0.5">Error</Badge>
							{:else if saving}
								<Badge variant="destructive" class="flex px-2 py-0.5">Saving…</Badge>
							{:else if dirty}
								<Badge variant="destructive" class="flex px-2 py-0.5">
									Unsaved changes
								</Badge>
							{:else}
								<Badge variant="green" class="flex px-2 py-0.5">Changes saved</Badge>
							{/if}

							<TooltipProvider>
								<Tooltip>
									<TooltipTrigger>
										<Button variant="link" size="xs" onclick={save}>
											<SaveIcon />
										</Button>
									</TooltipTrigger>
									<TooltipContent align="center" side="bottom">Save note</TooltipContent>
								</Tooltip>
							</TooltipProvider>

							<TooltipProvider>
								<Tooltip>
									<TooltipTrigger>
										<Button
											variant="link"
											size="xs"
											onclick={() => copyShareLink(selected.note_id)}
										>
											<ForwardIcon />
										</Button>
									</TooltipTrigger>
									<TooltipContent align="center" side="bottom">
										Copy shared link
									</TooltipContent>
								</Tooltip>
							</TooltipProvider>

							<TooltipProvider>
								<Tooltip>
									<TooltipTrigger>
										<Button
											variant="link"
											size="xs"
											onclick={() => copyMdLink(selected.note_id)}
										>
											<FileSymlinkIcon />
										</Button>
									</TooltipTrigger>
									<TooltipContent align="center" side="bottom">
										Copy MD link
									</TooltipContent>
								</Tooltip>
							</TooltipProvider>

							<TooltipProvider>
								<Tooltip>
									<TooltipTrigger>
										<Button variant="link" size="xs" onclick={downloadMarkdown}>
											<DownloadIcon />
										</Button>
									</TooltipTrigger>
									<TooltipContent align="center" side="bottom">
										Download as MD
									</TooltipContent>
								</Tooltip>
							</TooltipProvider>

							<TooltipProvider>
								<Tooltip>
									<TooltipTrigger>
										<Button
											variant="link"
											size="xs"
											onclick={() => (showConfirmDelete = true)}
										>
											<TrashIcon class="text-red-500" />
										</Button>
									</TooltipTrigger>
									<TooltipContent align="center" side="bottom">Delete note</TooltipContent>
								</Tooltip>
							</TooltipProvider>
						</div>
					</div>
				</div>

				<!-- Editor -->
				<div class="note-content-scroll min-h-0 flex-1 overflow-y-auto px-6 pb-6 pt-4">
					{#key selected.note_id}
						<MarkDownEditor
							value={draftContent}
							{onChange}
							onSave={save}
							savedAt={savedAtMs}
							collabMode="war-room-note"
							warRoomNoteId={selected.note_id}
						/>
					{/key}
				</div>
			{/if}
		</Resizable.Pane>
	</Resizable.PaneGroup>
</div>

<NotesRenameDialog
	bind:open={showRename}
	itemType="note"
	initialValue={selected?.title ?? ''}
	onSubmit={(value) => renameNote(value)}
	onCancel={() => (showRename = false)}
/>

<ConfirmationDialog
	bind:open={showConfirmDelete}
	title="Are you sure?"
	message="You are about to delete this note forever. This cannot be reverted."
	onConfirm={deleteNote}
	onCancel={() => (showConfirmDelete = false)}
/>

<style>
	.notes-list-scroll {
		scrollbar-width: thin;
		scrollbar-color: transparent transparent;
		transition: scrollbar-color 0.2s ease;
	}

	.notes-list-scroll:hover {
		scrollbar-color: hsl(var(--muted-foreground) / 0.35) transparent;
	}

	.notes-list-scroll::-webkit-scrollbar {
		width: 6px;
	}

	.notes-list-scroll::-webkit-scrollbar-track {
		background: transparent;
	}

	.notes-list-scroll::-webkit-scrollbar-thumb {
		background-color: transparent;
		border-radius: 999px;
		transition: background-color 0.2s ease;
	}

	.notes-list-scroll:hover::-webkit-scrollbar-thumb {
		background-color: hsl(var(--muted-foreground) / 0.35);
	}

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

	.note-content-scroll::-webkit-scrollbar-thumb {
		background-color: transparent;
		border-radius: 999px;
		transition: background-color 0.2s ease;
	}

	.note-content-scroll:hover::-webkit-scrollbar-thumb {
		background-color: hsl(var(--muted-foreground) / 0.35);
	}
</style>
