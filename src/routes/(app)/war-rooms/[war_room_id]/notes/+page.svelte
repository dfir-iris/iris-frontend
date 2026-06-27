<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { Plus, Trash2, Pencil, FileText } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import {
		Dialog,
		DialogContent,
		DialogFooter,
		DialogHeader,
		DialogTitle
	} from '$lib/components/ui/dialog';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { toast } from '$lib/components/ui/toast';
	import {
		WarRoomNotesService,
		type WarRoomNote
	} from '$lib/services/war-room-notes.service';

	const warRoomId = $derived(Number(page.params.war_room_id));

	let notes = $state<WarRoomNote[]>([]);
	let loading = $state(true);
	let selectedId = $state<number | null>(null);

	let editorOpen = $state(false);
	let saving = $state(false);
	let editTitle = $state('');
	let editContent = $state('');
	let editingNoteId = $state<number | null>(null);

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

	const openCreate = () => {
		editingNoteId = null;
		editTitle = '';
		editContent = '';
		editorOpen = true;
	};

	const openEdit = (n: WarRoomNote) => {
		editingNoteId = n.note_id;
		editTitle = n.title;
		editContent = n.content ?? '';
		editorOpen = true;
	};

	const save = async () => {
		const title = editTitle.trim();
		if (!title) return;
		saving = true;
		const res = editingNoteId
			? await WarRoomNotesService.update(warRoomId, editingNoteId, {
					title,
					content: editContent
				})
			: await WarRoomNotesService.create(warRoomId, {
					title,
					content: editContent
				});
		saving = false;
		if (res.ok && res.data && typeof res.data !== 'string') {
			const next = res.data as WarRoomNote;
			notes = editingNoteId
				? notes.map((n) => (n.note_id === editingNoteId ? next : n))
				: [next, ...notes];
			selectedId = next.note_id;
			editorOpen = false;
		} else {
			toast({ title: 'Could not save note', variant: 'destructive' });
		}
	};

	const remove = async (n: WarRoomNote) => {
		if (!confirm(`Delete note "${n.title}"?`)) return;
		const res = await WarRoomNotesService.remove(warRoomId, n.note_id);
		if (res.ok) {
			notes = notes.filter((x) => x.note_id !== n.note_id);
			if (selectedId === n.note_id) {
				selectedId = notes[0]?.note_id ?? null;
			}
		}
	};
</script>

<div class="grid h-full grid-cols-[260px_1fr] overflow-hidden">
	<aside class="flex flex-col border-r bg-card/30">
		<div class="flex items-center justify-between gap-2 border-b p-3">
			<h2 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
				Notes
			</h2>
			<Button size="icon" variant="ghost" class="h-6 w-6" onclick={openCreate}>
				<Plus class="h-3.5 w-3.5" />
			</Button>
		</div>
		<div class="flex-1 overflow-y-auto">
			{#if loading}
				<div class="flex flex-col gap-1 p-2">
					{#each Array(3) as _}
						<Skeleton class="h-10 w-full" />
					{/each}
				</div>
			{:else if notes.length === 0}
				<p class="p-3 text-xs text-muted-foreground">No notes yet.</p>
			{:else}
				<ul>
					{#each notes as n (n.note_id)}
						{@const active = selectedId === n.note_id}
						<li>
							<button
								type="button"
								class={[
									'flex w-full items-start gap-2 px-3 py-2 text-left transition-colors',
									active ? 'bg-primary/10' : 'hover:bg-muted/50'
								]}
								onclick={() => (selectedId = n.note_id)}
							>
								<FileText class="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
								<div class="min-w-0 flex-1">
									<p class="truncate text-sm font-medium">{n.title}</p>
									{#if n.updated_at}
										<p class="text-2xs text-muted-foreground">
											{new Date(n.updated_at).toLocaleString()}
										</p>
									{/if}
								</div>
							</button>
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	</aside>

	<div class="flex h-full min-h-0 flex-col">
		{#if !selected}
			<div class="flex h-full items-center justify-center text-sm text-muted-foreground">
				Select a note or create a new one.
			</div>
		{:else}
			<header class="flex items-center justify-between gap-2 border-b px-4 py-3">
				<div class="min-w-0">
					<h3 class="truncate text-base font-semibold">{selected.title}</h3>
					{#if selected.updated_at}
						<p class="text-2xs text-muted-foreground">
							Updated {new Date(selected.updated_at).toLocaleString()}
						</p>
					{/if}
				</div>
				<div class="flex items-center gap-1">
					<Button size="icon" variant="ghost" class="h-7 w-7" onclick={() => openEdit(selected)} aria-label="Edit">
						<Pencil class="h-3.5 w-3.5" />
					</Button>
					<Button
						size="icon"
						variant="ghost"
						class="h-7 w-7 text-destructive hover:text-destructive"
						onclick={() => remove(selected)}
						aria-label="Delete"
					>
						<Trash2 class="h-3.5 w-3.5" />
					</Button>
				</div>
			</header>
			<div class="flex-1 overflow-y-auto px-4 py-3 text-sm">
				{#if selected.content}
					<pre class="whitespace-pre-wrap break-words font-sans">{selected.content}</pre>
				{:else}
					<p class="text-muted-foreground">No content.</p>
				{/if}
			</div>
		{/if}
	</div>
</div>

<Dialog bind:open={editorOpen}>
	<DialogContent class="sm:max-w-2xl">
		<DialogHeader>
			<DialogTitle>{editingNoteId ? 'Edit note' : 'New note'}</DialogTitle>
		</DialogHeader>
		<div class="flex flex-col gap-3 py-2">
			<div>
				<label class="text-xs font-medium text-muted-foreground" for="note-title">
					Title
				</label>
				<Input
					id="note-title"
					value={editTitle}
					oninput={(e) => (editTitle = (e.target as HTMLInputElement).value)}
					class="mt-1"
				/>
			</div>
			<div>
				<label class="text-xs font-medium text-muted-foreground" for="note-content">
					Content (markdown supported)
				</label>
				<textarea
					id="note-content"
					value={editContent}
					oninput={(e) => (editContent = (e.target as HTMLTextAreaElement).value)}
					rows="14"
					class="mt-1 w-full rounded-md border bg-background p-2 text-sm font-mono"
				></textarea>
			</div>
		</div>
		<DialogFooter>
			<Button variant="ghost" onclick={() => (editorOpen = false)} disabled={saving}>
				Cancel
			</Button>
			<Button onclick={save} disabled={saving || !editTitle.trim()}>
				{saving ? 'Saving…' : 'Save'}
			</Button>
		</DialogFooter>
	</DialogContent>
</Dialog>
