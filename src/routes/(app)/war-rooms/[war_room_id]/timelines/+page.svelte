<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { Plus, Pencil, Trash2 } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Checkbox } from '$lib/components/ui/checkbox';
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
		WarRoomTimelinesService,
		type WarRoomTimeline,
		type WarRoomTimelineEvent
	} from '$lib/services/war-room-timelines.service';
	import { safeHexColor } from '$lib/utils/color';

	const warRoomId = $derived(Number(page.params.war_room_id));

	let timelines = $state<WarRoomTimeline[]>([]);
	let events = $state<WarRoomTimelineEvent[]>([]);
	let loading = $state(true);

	let selectedIds = $state<Set<number>>(new Set());

	let addOpen = $state(false);
	let newName = $state('');
	let newColor = $state('#3b82f6');
	let saving = $state(false);

	let editingId = $state<number | null>(null);
	let editingName = $state('');
	let editingColor = $state('#3b82f6');

	let entryOpen = $state(false);
	let entryTimelineId = $state<number | null>(null);
	let entryTitle = $state('');
	let entryContent = $state('');
	let entryDate = $state('');

	const load = async () => {
		loading = true;
		const tl = await WarRoomTimelinesService.list(warRoomId);
		if (tl.ok && Array.isArray(tl.data)) {
			timelines = tl.data;
		}
		const ev = await WarRoomTimelinesService.listEvents(warRoomId, {
			timelineIds: selectedIds.size ? Array.from(selectedIds) : undefined
		});
		if (ev.ok && Array.isArray(ev.data)) {
			events = ev.data;
		}
		loading = false;
	};

	onMount(load);

	const toggleSelect = (id: number) => {
		const next = new Set(selectedIds);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		selectedIds = next;
		load();
	};

	const showAll = () => {
		selectedIds = new Set();
		load();
	};

	const submitCreate = async () => {
		const name = newName.trim();
		if (!name) return;
		saving = true;
		const res = await WarRoomTimelinesService.create(warRoomId, {
			name,
			color: newColor || null
		});
		saving = false;
		if (res.ok && res.data && typeof res.data !== 'string') {
			timelines = [...timelines, res.data as WarRoomTimeline];
			addOpen = false;
			newName = '';
		} else {
			toast({ title: 'Could not create timeline', variant: 'destructive' });
		}
	};

	const startEdit = (t: WarRoomTimeline) => {
		editingId = t.timeline_id;
		editingName = t.name;
		editingColor = t.color ?? '#3b82f6';
	};

	const submitEdit = async () => {
		if (editingId == null) return;
		saving = true;
		const original = timelines.find((t) => t.timeline_id === editingId);
		const body: { name?: string; color?: string | null } = {};
		if (original?.name !== editingName.trim()) body.name = editingName.trim();
		if ((original?.color ?? null) !== editingColor) body.color = editingColor;
		if (Object.keys(body).length === 0) {
			editingId = null;
			saving = false;
			return;
		}
		const res = await WarRoomTimelinesService.update(warRoomId, editingId, body);
		saving = false;
		if (res.ok && res.data && typeof res.data !== 'string') {
			const next = res.data as WarRoomTimeline;
			timelines = timelines.map((t) => (t.timeline_id === editingId ? next : t));
			editingId = null;
		} else {
			toast({ title: 'Could not update timeline', variant: 'destructive' });
		}
	};

	const removeTimeline = async (t: WarRoomTimeline) => {
		if (t.is_default) return;
		if (!confirm(`Delete timeline "${t.name}"?`)) return;
		const res = await WarRoomTimelinesService.remove(warRoomId, t.timeline_id);
		if (res.ok) {
			timelines = timelines.filter((x) => x.timeline_id !== t.timeline_id);
			selectedIds.delete(t.timeline_id);
			selectedIds = new Set(selectedIds);
			load();
		}
	};

	const openEntry = (t: WarRoomTimeline) => {
		entryTimelineId = t.timeline_id;
		entryTitle = '';
		entryContent = '';
		entryDate = new Date().toISOString().slice(0, 16);
		entryOpen = true;
	};

	const submitEntry = async () => {
		if (entryTimelineId == null) return;
		const title = entryTitle.trim();
		if (!title) return;
		saving = true;
		const res = await WarRoomTimelinesService.addEvent(warRoomId, entryTimelineId, {
			title,
			content: entryContent.trim() || null,
			event_date: entryDate || null
		});
		saving = false;
		if (res.ok) {
			entryOpen = false;
			load();
		}
	};

	const fmtDate = (iso: string | null) => {
		if (!iso) return '';
		try {
			return new Date(iso).toLocaleString();
		} catch {
			return iso;
		}
	};

	const tlById = $derived(new Map(timelines.map((t) => [t.timeline_id, t])));
</script>

<div class="grid h-full w-full grid-cols-[240px_minmax(0,1fr)] overflow-hidden">
	<aside class="flex flex-col border-r bg-card/30 text-xs">
		<header class="flex items-center justify-between border-b px-3 py-2">
			<h3 class="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
				Timelines
			</h3>
			<Button size="icon" variant="ghost" class="h-6 w-6" onclick={() => (addOpen = true)}>
				<Plus class="h-3 w-3" />
			</Button>
		</header>

		<div class="flex items-center border-b px-3 py-2">
			<button
				type="button"
				class="text-2xs text-muted-foreground transition-colors hover:text-foreground"
				onclick={showAll}
			>
				{selectedIds.size === 0 ? 'Showing all' : 'Show all'}
			</button>
		</div>

		<div class="flex-1 overflow-y-auto py-1">
			{#if loading}
				<div class="px-3 py-4 text-center text-2xs text-muted-foreground">Loading…</div>
			{:else if timelines.length === 0}
				<div class="px-3 py-4 text-center text-2xs text-muted-foreground">
					No timelines yet.
				</div>
			{:else}
				<ul class="flex flex-col gap-0.5">
					{#each timelines as t (t.timeline_id)}
						{@const checked = selectedIds.has(t.timeline_id)}
						{@const safeColor = safeHexColor(t.color)}
						<li class="group">
							{#if editingId === t.timeline_id}
								<div class="flex flex-col gap-1 px-2 py-1.5">
									<Input
										value={editingName}
										oninput={(e) => (editingName = (e.target as HTMLInputElement).value)}
										class="h-6 text-xs"
									/>
									<div class="flex items-center gap-1">
										<input
											type="color"
											bind:value={editingColor}
											class="h-6 w-8 cursor-pointer rounded border bg-transparent p-0"
										/>
										<Button size="sm" class="h-6 flex-1 text-2xs" disabled={saving} onclick={submitEdit}>
											Save
										</Button>
										<Button
											size="sm"
											variant="ghost"
											class="h-6 px-2 text-2xs"
											disabled={saving}
											onclick={() => (editingId = null)}
										>
											Cancel
										</Button>
									</div>
								</div>
							{:else}
								<div
									class="flex items-center gap-2 rounded-sm px-2 py-1 transition-colors hover:bg-muted/50"
									class:bg-muted={checked}
								>
									<Checkbox
										{checked}
										onCheckedChange={() => toggleSelect(t.timeline_id)}
										aria-label={`Toggle ${t.name}`}
									/>
									{#if safeColor}
										<span
											class="h-2 w-2 shrink-0 rounded-full"
											style:background-color={safeColor}
											aria-hidden="true"
										></span>
									{/if}
									<span class="min-w-0 flex-1 truncate" title={t.name}>{t.name}</span>
									{#if t.is_default}
										<span class="shrink-0 rounded border bg-muted/60 px-1 text-[9px] uppercase tracking-wider text-muted-foreground">
											Default
										</span>
									{/if}
									<div class="hidden shrink-0 items-center gap-0.5 group-hover:flex">
										<Button
											size="icon"
											variant="ghost"
											class="h-5 w-5"
											onclick={() => openEntry(t)}
											aria-label={`Add event to ${t.name}`}
										>
											<Plus class="h-3 w-3" />
										</Button>
										<Button
											size="icon"
											variant="ghost"
											class="h-5 w-5"
											onclick={() => startEdit(t)}
											aria-label={`Edit ${t.name}`}
										>
											<Pencil class="h-2.5 w-2.5" />
										</Button>
										{#if !t.is_default}
											<Button
												size="icon"
												variant="ghost"
												class="h-5 w-5 text-destructive hover:text-destructive"
												onclick={() => removeTimeline(t)}
												aria-label={`Delete ${t.name}`}
											>
												<Trash2 class="h-2.5 w-2.5" />
											</Button>
										{/if}
									</div>
								</div>
							{/if}
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	</aside>

	<div class="h-full overflow-y-auto p-6">
		{#if loading}
			<Skeleton class="h-32 w-full" />
		{:else if events.length === 0}
			<div class="flex h-full flex-col items-center justify-center gap-2 text-center text-muted-foreground">
				<p class="text-sm">No events on the selected timelines yet.</p>
			</div>
		{:else}
			<ol class="relative ml-2 border-l">
				{#each events as e (e.id)}
					{@const tl = tlById.get(e.timeline_id)}
					{@const safeColor = safeHexColor(e.color ?? tl?.color ?? null)}
					<li class="mb-4 ml-4">
						<span
							class="absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full border border-background"
							style:background-color={safeColor ?? '#94a3b8'}
							aria-hidden="true"
						></span>
						<div class="rounded-md border bg-card/40 px-3 py-2">
							<div class="flex items-center justify-between gap-2">
								<p class="text-sm font-medium">{e.title ?? '(no title)'}</p>
								<span class="text-2xs text-muted-foreground">{fmtDate(e.event_date)}</span>
							</div>
							{#if tl}
								<p class="text-2xs uppercase tracking-wider text-muted-foreground">{tl.name}</p>
							{/if}
							{#if e.content}
								<p class="mt-1 whitespace-pre-wrap break-words text-xs">{e.content}</p>
							{/if}
							{#if e.case_id}
								<a href={`/case/${e.case_id}`} class="mt-1 inline-block text-2xs text-primary hover:underline">
									Case #{e.case_id}
								</a>
							{/if}
						</div>
					</li>
				{/each}
			</ol>
		{/if}
	</div>
</div>

<Dialog bind:open={addOpen}>
	<DialogContent>
		<DialogHeader>
			<DialogTitle>New timeline</DialogTitle>
		</DialogHeader>
		<div class="flex flex-col gap-3 py-2">
			<Input
				value={newName}
				oninput={(e) => (newName = (e.target as HTMLInputElement).value)}
				placeholder="Timeline name"
			/>
			<input
				type="color"
				bind:value={newColor}
				class="h-8 w-16 cursor-pointer rounded border bg-transparent p-0"
			/>
		</div>
		<DialogFooter>
			<Button variant="ghost" onclick={() => (addOpen = false)} disabled={saving}>
				Cancel
			</Button>
			<Button onclick={submitCreate} disabled={saving || !newName.trim()}>
				{saving ? 'Creating…' : 'Create'}
			</Button>
		</DialogFooter>
	</DialogContent>
</Dialog>

<Dialog bind:open={entryOpen}>
	<DialogContent>
		<DialogHeader>
			<DialogTitle>New timeline entry</DialogTitle>
		</DialogHeader>
		<div class="flex flex-col gap-3 py-2">
			<Input
				value={entryTitle}
				oninput={(e) => (entryTitle = (e.target as HTMLInputElement).value)}
				placeholder="Title"
			/>
			<Input
				type="datetime-local"
				value={entryDate}
				oninput={(e) => (entryDate = (e.target as HTMLInputElement).value)}
			/>
			<textarea
				value={entryContent}
				oninput={(e) => (entryContent = (e.target as HTMLTextAreaElement).value)}
				placeholder="Notes (optional)"
				rows="5"
				class="w-full rounded-md border bg-background p-2 text-sm"
			></textarea>
		</div>
		<DialogFooter>
			<Button variant="ghost" onclick={() => (entryOpen = false)} disabled={saving}>
				Cancel
			</Button>
			<Button onclick={submitEntry} disabled={saving || !entryTitle.trim()}>
				{saving ? 'Saving…' : 'Save'}
			</Button>
		</DialogFooter>
	</DialogContent>
</Dialog>
