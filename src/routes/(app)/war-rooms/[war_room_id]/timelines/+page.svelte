<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { Plus, Pencil, Trash2, Search, X } from 'lucide-svelte';
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

	// Filters (client-side, mirrors case-timeline UX)
	let filterText = $state('');
	let filterFrom = $state('');
	let filterTo = $state('');
	let filterCategory = $state('');

	// Timeline create/edit
	let addOpen = $state(false);
	let newName = $state('');
	let newColor = $state('#3b82f6');
	let saving = $state(false);

	let editingId = $state<number | null>(null);
	let editingName = $state('');
	let editingColor = $state('#3b82f6');

	// Event create/edit — reuse a single dialog with mode flag
	let entryOpen = $state(false);
	let entryMode = $state<'create' | 'edit'>('create');
	let entryEventId = $state<number | null>(null);
	let entryTimelineId = $state<number | null>(null);
	let entryTitle = $state('');
	let entryContent = $state('');
	let entryDate = $state('');
	let entryCategory = $state('');
	let entryColor = $state('');

	// Drag state — track which event is being dragged so the sidebar
	// can show a drop affordance and the drop handler can reparent it.
	let dragEventId = $state<number | null>(null);
	let dragOverTimelineId = $state<number | null>(null);

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

	const openCreateEvent = (t: WarRoomTimeline) => {
		entryMode = 'create';
		entryEventId = null;
		entryTimelineId = t.timeline_id;
		entryTitle = '';
		entryContent = '';
		entryDate = new Date().toISOString().slice(0, 16);
		entryCategory = '';
		entryColor = '';
		entryOpen = true;
	};

	const openEditEvent = (e: WarRoomTimelineEvent) => {
		entryMode = 'edit';
		entryEventId = e.id;
		entryTimelineId = e.timeline_id;
		entryTitle = e.title ?? '';
		entryContent = e.content ?? '';
		entryDate = e.event_date ? e.event_date.slice(0, 16) : '';
		entryCategory = e.category ?? '';
		entryColor = e.color ?? '';
		entryOpen = true;
	};

	const submitEntry = async () => {
		const title = entryTitle.trim();
		if (!title) return;
		saving = true;
		if (entryMode === 'create') {
			if (entryTimelineId == null) {
				saving = false;
				return;
			}
			const res = await WarRoomTimelinesService.addEvent(warRoomId, entryTimelineId, {
				title,
				content: entryContent.trim() || null,
				event_date: entryDate || null,
				category: entryCategory.trim() || null,
				color: entryColor || null
			});
			saving = false;
			if (res.ok) {
				entryOpen = false;
				load();
			} else {
				toast({ title: 'Could not create event', variant: 'destructive' });
			}
		} else {
			if (entryEventId == null) {
				saving = false;
				return;
			}
			const res = await WarRoomTimelinesService.updateEvent(warRoomId, entryEventId, {
				title,
				content: entryContent.trim() || null,
				event_date: entryDate || null,
				category: entryCategory.trim() || null,
				color: entryColor || null
			});
			saving = false;
			if (res.ok && res.data && typeof res.data !== 'string') {
				const next = res.data as WarRoomTimelineEvent;
				events = events.map((x) => (x.id === next.id ? next : x));
				entryOpen = false;
			} else {
				toast({ title: 'Could not update event', variant: 'destructive' });
			}
		}
	};

	const removeEvent = async (e: WarRoomTimelineEvent) => {
		if (!confirm('Delete this event?')) return;
		const res = await WarRoomTimelinesService.removeEvent(warRoomId, e.id);
		if (res.ok) {
			events = events.filter((x) => x.id !== e.id);
		}
	};

	// Drag-and-drop: move an event to another timeline.
	//
	// We use HTML5 native DnD so we don't pull in a library for one
	// feature. The dataTransfer payload is just the event id as text,
	// and `dragEventId` mirrors it so Svelte reactivity can highlight
	// drop targets during the drag.
	const onDragStart = (ev: DragEvent, e: WarRoomTimelineEvent) => {
		dragEventId = e.id;
		if (ev.dataTransfer) {
			ev.dataTransfer.effectAllowed = 'move';
			ev.dataTransfer.setData('text/plain', String(e.id));
		}
	};

	const onDragEnd = () => {
		dragEventId = null;
		dragOverTimelineId = null;
	};

	const onTimelineDragOver = (ev: DragEvent, timelineId: number) => {
		if (dragEventId == null) return;
		const e = events.find((x) => x.id === dragEventId);
		if (!e || e.timeline_id === timelineId) return;
		ev.preventDefault();
		if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'move';
		dragOverTimelineId = timelineId;
	};

	const onTimelineDrop = async (ev: DragEvent, timelineId: number) => {
		if (dragEventId == null) return;
		ev.preventDefault();
		const eventId = dragEventId;
		const draggedEvent = events.find((x) => x.id === eventId);
		dragEventId = null;
		dragOverTimelineId = null;
		if (!draggedEvent || draggedEvent.timeline_id === timelineId) return;
		const res = await WarRoomTimelinesService.updateEvent(warRoomId, eventId, {
			timeline_id: timelineId
		});
		if (res.ok && res.data && typeof res.data !== 'string') {
			const next = res.data as WarRoomTimelineEvent;
			events = events.map((x) => (x.id === next.id ? next : x));
			toast({ title: 'Event moved' });
		} else {
			toast({ title: 'Could not move event', variant: 'destructive' });
		}
	};

	const clearFilters = () => {
		filterText = '';
		filterFrom = '';
		filterTo = '';
		filterCategory = '';
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

	const filteredEvents = $derived.by(() => {
		const needle = filterText.trim().toLowerCase();
		const cat = filterCategory.trim().toLowerCase();
		const from = filterFrom ? new Date(filterFrom).getTime() : null;
		const to = filterTo ? new Date(filterTo).getTime() : null;
		return events.filter((e) => {
			if (needle) {
				const hay = (
					(e.title ?? '') +
					' ' +
					(e.content ?? '') +
					' ' +
					(e.category ?? '')
				).toLowerCase();
				if (!hay.includes(needle)) return false;
			}
			if (cat) {
				if (!e.category || !e.category.toLowerCase().includes(cat)) return false;
			}
			if (from != null || to != null) {
				const ts = e.event_date ? new Date(e.event_date).getTime() : NaN;
				if (Number.isNaN(ts)) return false;
				if (from != null && ts < from) return false;
				if (to != null && ts > to) return false;
			}
			return true;
		});
	});

	const filtersActive = $derived(
		Boolean(filterText || filterCategory || filterFrom || filterTo)
	);
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
						{@const isDropTarget = dragOverTimelineId === t.timeline_id}
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
									role="group"
									class="flex items-center gap-2 rounded-sm px-2 py-1 transition-colors hover:bg-muted/50"
									class:bg-muted={checked}
									class:ring-2={isDropTarget}
									class:ring-primary={isDropTarget}
									ondragover={(e) => onTimelineDragOver(e, t.timeline_id)}
									ondragleave={() => (dragOverTimelineId = null)}
									ondrop={(e) => onTimelineDrop(e, t.timeline_id)}
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
											onclick={() => openCreateEvent(t)}
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
				{#if dragEventId != null}
					<p class="px-3 py-2 text-2xs italic text-muted-foreground">
						Drop on a timeline to move the event.
					</p>
				{/if}
			{/if}
		</div>
	</aside>

	<div class="flex h-full flex-col overflow-hidden">
		<!-- Filter bar — search/category/date range, mirrors the case-timeline UX. -->
		<div class="flex flex-wrap items-center gap-2 border-b bg-card/20 px-4 py-2">
			<div class="relative">
				<Search class="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
				<Input
					value={filterText}
					oninput={(e) => (filterText = (e.target as HTMLInputElement).value)}
					placeholder="Search title/content/category…"
					class="h-8 w-64 pl-7 text-xs"
				/>
			</div>
			<Input
				value={filterCategory}
				oninput={(e) => (filterCategory = (e.target as HTMLInputElement).value)}
				placeholder="Category"
				class="h-8 w-36 text-xs"
			/>
			<label class="flex items-center gap-1 text-2xs text-muted-foreground">
				From
				<Input
					type="datetime-local"
					value={filterFrom}
					oninput={(e) => (filterFrom = (e.target as HTMLInputElement).value)}
					class="h-8 w-44 text-xs"
				/>
			</label>
			<label class="flex items-center gap-1 text-2xs text-muted-foreground">
				To
				<Input
					type="datetime-local"
					value={filterTo}
					oninput={(e) => (filterTo = (e.target as HTMLInputElement).value)}
					class="h-8 w-44 text-xs"
				/>
			</label>
			{#if filtersActive}
				<Button variant="ghost" size="sm" class="h-8" onclick={clearFilters}>
					<X class="mr-1 h-3 w-3" /> Clear
				</Button>
			{/if}
			<span class="ml-auto text-2xs text-muted-foreground">
				{filteredEvents.length} / {events.length} events
			</span>
		</div>

		<div class="flex-1 overflow-y-auto p-6">
			{#if loading}
				<Skeleton class="h-32 w-full" />
			{:else if events.length === 0}
				<div class="flex h-full flex-col items-center justify-center gap-2 text-center text-muted-foreground">
					<p class="text-sm">No events on the selected timelines yet.</p>
				</div>
			{:else if filteredEvents.length === 0}
				<div class="flex h-full flex-col items-center justify-center gap-2 text-center text-muted-foreground">
					<p class="text-sm">No events match the current filters.</p>
				</div>
			{:else}
				<ol class="relative ml-2 border-l">
					{#each filteredEvents as e (e.id)}
						{@const tl = tlById.get(e.timeline_id)}
						{@const safeColor = safeHexColor(e.color ?? tl?.color ?? null)}
						{@const isDragging = dragEventId === e.id}
						<li class="mb-4 ml-4">
							<span
								class="absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full border border-background"
								style:background-color={safeColor ?? '#94a3b8'}
								aria-hidden="true"
							></span>
							<div
								role="article"
								draggable="true"
								ondragstart={(ev) => onDragStart(ev, e)}
								ondragend={onDragEnd}
								class="group/event cursor-grab rounded-md border bg-card/40 px-3 py-2 active:cursor-grabbing"
								class:opacity-50={isDragging}
							>
								<div class="flex items-center justify-between gap-2">
									<p class="text-sm font-medium">{e.title ?? '(no title)'}</p>
									<div class="flex items-center gap-2">
										<span class="text-2xs text-muted-foreground">{fmtDate(e.event_date)}</span>
										<div class="hidden items-center gap-0.5 group-hover/event:flex">
											<Button
												size="icon"
												variant="ghost"
												class="h-6 w-6"
												onclick={() => openEditEvent(e)}
												aria-label="Edit event"
											>
												<Pencil class="h-3 w-3" />
											</Button>
											<Button
												size="icon"
												variant="ghost"
												class="h-6 w-6 text-destructive hover:text-destructive"
												onclick={() => removeEvent(e)}
												aria-label="Delete event"
											>
												<Trash2 class="h-3 w-3" />
											</Button>
										</div>
									</div>
								</div>
								<div class="flex flex-wrap items-center gap-1.5">
									{#if tl}
										<span class="text-2xs uppercase tracking-wider text-muted-foreground">{tl.name}</span>
									{/if}
									{#if e.category}
										<span class="rounded border bg-muted/60 px-1.5 py-px text-[10px] font-medium uppercase tracking-wider">
											{e.category}
										</span>
									{/if}
								</div>
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
			<DialogTitle>{entryMode === 'create' ? 'New timeline entry' : 'Edit timeline entry'}</DialogTitle>
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
			<div class="flex items-center gap-2">
				<Input
					value={entryCategory}
					oninput={(e) => (entryCategory = (e.target as HTMLInputElement).value)}
					placeholder="Category (optional)"
					class="flex-1"
				/>
				<input
					type="color"
					value={entryColor || '#3b82f6'}
					oninput={(e) => (entryColor = (e.target as HTMLInputElement).value)}
					class="h-8 w-12 cursor-pointer rounded border bg-transparent p-0"
					title="Event color"
				/>
				{#if entryColor}
					<Button
						size="icon"
						variant="ghost"
						class="h-8 w-8"
						onclick={() => (entryColor = '')}
						aria-label="Clear color"
					>
						<X class="h-3.5 w-3.5" />
					</Button>
				{/if}
			</div>
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
				{saving ? 'Saving…' : entryMode === 'create' ? 'Save' : 'Update'}
			</Button>
		</DialogFooter>
	</DialogContent>
</Dialog>
