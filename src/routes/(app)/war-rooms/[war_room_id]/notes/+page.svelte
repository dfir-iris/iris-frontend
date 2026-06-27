<!--
  War-room notes. Each note has a rich markdown body authored via the
  same MarkDownEditor the case-side notes use, so headings, tables,
  fenced code, @-user mentions and #-resource mentions all behave the
  same way. Mentions are resolved against the war room's attached
  cases — assets / IOCs / notes / tasks from every attached case roll
  up into a single # search.
-->
<script lang="ts">
	import { onMount, getContext, setContext } from 'svelte';
	import { page } from '$app/state';
	import { Plus, Trash2, FileText, Loader2 } from 'lucide-svelte';
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
	import { MarkDownEditor } from '$lib/components/common/MarkDown';
	import {
		WarRoomNotesService,
		type WarRoomNote
	} from '$lib/services/war-room-notes.service';
	import {
		WarRoomsService,
		type WarRoomCaseAttachment
	} from '$lib/services/war-rooms.service';

	const warRoomId = $derived(Number(page.params.war_room_id));

	let notes = $state<WarRoomNote[]>([]);
	let attachedCases = $state<WarRoomCaseAttachment[]>([]);
	let loading = $state(true);
	let selectedId = $state<number | null>(null);

	let createOpen = $state(false);
	let creating = $state(false);
	let newTitle = $state('');

	let draftContent = $state('');
	let savedAt = $state<number | undefined>(undefined);
	let saving = $state(false);
	let dirty = $state(false);

	const load = async () => {
		loading = true;
		const [notesRes, casesRes] = await Promise.all([
			WarRoomNotesService.list(warRoomId),
			WarRoomsService.listCases(warRoomId)
		]);
		if (notesRes.ok && Array.isArray(notesRes.data)) {
			notes = notesRes.data;
			if (notes.length > 0 && selectedId == null) {
				selectedId = notes[0].note_id;
			}
		}
		if (casesRes.ok && Array.isArray(casesRes.data)) {
			attachedCases = casesRes.data;
		}
		loading = false;
	};

	onMount(load);

	const selected = $derived(notes.find((n) => n.note_id === selectedId) ?? null);

	// Pull the selected note's content into the editor whenever the user
	// switches notes. Without this guard the draft would bleed from one
	// note to the next when the operator clicks a different row.
	$effect(() => {
		if (selected) {
			draftContent = selected.content ?? '';
			dirty = false;
			savedAt = selected.updated_at
				? new Date(selected.updated_at).getTime()
				: undefined;
		} else {
			draftContent = '';
			dirty = false;
			savedAt = undefined;
		}
	});

	const submitCreate = async () => {
		const title = newTitle.trim();
		if (!title) return;
		creating = true;
		const res = await WarRoomNotesService.create(warRoomId, {
			title,
			content: ''
		});
		creating = false;
		if (res.ok && res.data && typeof res.data !== 'string') {
			const next = res.data as WarRoomNote;
			notes = [next, ...notes];
			selectedId = next.note_id;
			createOpen = false;
			newTitle = '';
		} else {
			toast({ title: 'Could not create note', variant: 'destructive' });
		}
	};

	const save = async () => {
		if (!selected) return;
		saving = true;
		const res = await WarRoomNotesService.update(warRoomId, selected.note_id, {
			content: draftContent
		});
		saving = false;
		if (res.ok && res.data && typeof res.data !== 'string') {
			const next = res.data as WarRoomNote;
			notes = notes.map((n) => (n.note_id === next.note_id ? next : n));
			dirty = false;
			savedAt = Date.now();
		} else {
			toast({ title: 'Could not save', variant: 'destructive' });
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

	const onChange = (v: string) => {
		draftContent = v;
		if (selected) {
			selected.content = v;
		}
		dirty = true;
	};
</script>

<div class="grid h-full w-full grid-cols-[260px_minmax(0,1fr)] overflow-hidden">
	<aside class="flex flex-col border-r bg-card/30">
		<div class="flex items-center justify-between gap-2 border-b p-3">
			<h2 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
				Notes
			</h2>
			<Button
				size="icon"
				variant="ghost"
				class="h-6 w-6"
				onclick={() => (createOpen = true)}
			>
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

	<div class="flex h-full min-h-0 min-w-0 flex-col">
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
							{#if dirty}
								· <span class="text-amber-600 dark:text-amber-400">unsaved</span>
							{/if}
						</p>
					{/if}
				</div>
				<div class="flex items-center gap-1">
					<Button
						size="sm"
						onclick={save}
						disabled={saving || !dirty}
						class="gap-1.5"
					>
						{#if saving}
							<Loader2 class="h-3.5 w-3.5 animate-spin" />
						{/if}
						{saving ? 'Saving…' : dirty ? 'Save' : 'Saved'}
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

			<div class="flex-1 overflow-y-auto p-4">
				{#key selected.note_id}
					<MarkDownEditor
						value={draftContent}
						{onChange}
						onSave={save}
						{savedAt}
					/>
				{/key}
			</div>
		{/if}
	</div>
</div>

<Dialog bind:open={createOpen}>
	<DialogContent>
		<DialogHeader>
			<DialogTitle>New note</DialogTitle>
		</DialogHeader>
		<div class="py-2">
			<label class="text-xs font-medium text-muted-foreground" for="note-title">
				Title
			</label>
			<Input
				id="note-title"
				value={newTitle}
				oninput={(e) => (newTitle = (e.target as HTMLInputElement).value)}
				placeholder="e.g. Initial triage notes"
				class="mt-1"
			/>
		</div>
		<DialogFooter>
			<Button
				variant="ghost"
				onclick={() => (createOpen = false)}
				disabled={creating}
			>
				Cancel
			</Button>
			<Button onclick={submitCreate} disabled={creating || !newTitle.trim()}>
				{creating ? 'Creating…' : 'Create note'}
			</Button>
		</DialogFooter>
	</DialogContent>
</Dialog>
