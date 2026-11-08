<!--
	Sidebar for the per-case named-timeline picker.

	Renders the list of timelines registered against the current case
	with a multi-select checkbox in front of each row. The host page
	owns the selected ids — this component just emits change events
	when the user toggles a checkbox or adds/edits/deletes a timeline.

	Empty selection means "show all events" (i.e. no timeline filter).

	With `onDropEvents`, every timeline is a drop target for events
	dragged from the search view: a plain drop moves them there, an
	Alt-drop adds them and keeps the timelines they were already on.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Plus, Pencil, Trash2 } from 'lucide-svelte';
	import type { CaseTimeline } from '$lib/services/case-timelines.service';
	import { Button } from '$lib/components/ui/button';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { Input } from '$lib/components/ui/input';
	import { EVENTS_DRAG_MIME, decodeDraggedEvents } from '../search-helpers';

	type Props = {
		timelines: CaseTimeline[];
		selectedIds: Set<number>;
		loading?: boolean;
		onToggle: (timelineId: number) => void;
		onSelectAll: () => void;
		onCreate: (body: { name: string; color: string | null }) => Promise<void>;
		onUpdate: (timelineId: number, body: { name?: string; color?: string | null }) => Promise<void>;
		onRemove: (timelineId: number) => Promise<void>;
		canEdit?: boolean;
		onDropEvents?: (timelineId: number, eventIds: number[], mode: 'move' | 'add') => void;
		/** Rendered under the list, which then only takes part of the height. */
		footer?: Snippet;
	};

	let {
		timelines,
		selectedIds,
		loading = false,
		onToggle,
		onSelectAll,
		onCreate,
		onUpdate,
		onRemove,
		canEdit = true,
		onDropEvents,
		footer
	}: Props = $props();

	let dropTargetId = $state<number | null>(null);
	let dropMode = $state<'move' | 'add'>('move');

	const acceptsDrop = (e: DragEvent): boolean =>
		!!onDropEvents && canEdit && !!e.dataTransfer?.types.includes(EVENTS_DRAG_MIME);

	const onDragOver = (e: DragEvent, timelineId: number) => {
		if (!acceptsDrop(e) || !e.dataTransfer) return;
		e.preventDefault();
		dropMode = e.altKey ? 'add' : 'move';
		e.dataTransfer.dropEffect = e.altKey ? 'copy' : 'move';
		dropTargetId = timelineId;
	};

	const onDragLeave = (e: DragEvent, timelineId: number) => {
		const next = e.relatedTarget as Node | null;
		if (next && (e.currentTarget as HTMLElement).contains(next)) return;
		if (dropTargetId === timelineId) dropTargetId = null;
	};

	const onDrop = (e: DragEvent, timelineId: number) => {
		dropTargetId = null;
		if (!acceptsDrop(e) || !e.dataTransfer) return;
		e.preventDefault();
		const ids = decodeDraggedEvents(e.dataTransfer.getData(EVENTS_DRAG_MIME));
		if (ids.length) onDropEvents?.(timelineId, ids, e.altKey ? 'add' : 'move');
	};

	let addingOpen = $state(false);
	let newName = $state('');
	let newColor = $state('#3b82f6');
	let editingId = $state<number | null>(null);
	let editingName = $state('');
	let editingColor = $state<string>('#3b82f6');
	let saving = $state(false);

	const submitCreate = async () => {
		const name = newName.trim();
		if (!name) return;
		saving = true;
		try {
			await onCreate({ name, color: newColor || null });
			newName = '';
			addingOpen = false;
		} finally {
			saving = false;
		}
	};

	const startEdit = (t: CaseTimeline) => {
		editingId = t.timeline_id;
		editingName = t.name;
		// Color picker needs a valid hex string — fall back to a neutral
		// blue if the timeline has never been tinted.
		editingColor = t.color ?? '#3b82f6';
	};

	const cancelEdit = () => {
		editingId = null;
	};

	const submitEdit = async () => {
		if (editingId == null) return;
		const name = editingName.trim();
		if (!name) {
			editingId = null;
			return;
		}
		saving = true;
		try {
			const original = timelines.find((t) => t.timeline_id === editingId);
			const body: { name?: string; color?: string | null } = {};
			if (original?.name !== name) body.name = name;
			// Send color even when unchanged-but-non-null is the same — the
			// backend treats null as "no change" so we only ship the field
			// when it actually differs.
			if ((original?.color ?? null) !== editingColor) body.color = editingColor;
			if (Object.keys(body).length > 0) {
				await onUpdate(editingId, body);
			}
			editingId = null;
		} finally {
			saving = false;
		}
	};
</script>

<aside class="flex w-56 shrink-0 flex-col border-r bg-card/40 text-xs" aria-label="Timelines">
	<header class="flex items-center justify-between gap-2 border-b px-3 py-2">
		<div class="flex items-center gap-2">
			<h3 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
				Timelines
			</h3>
			{#if timelines.length > 0}
				<span class="text-2xs tabular-nums text-muted-foreground">{timelines.length}</span>
			{/if}
		</div>
		{#if canEdit}
			<Button
				size="icon"
				variant="ghost"
				class="h-6 w-6"
				onclick={() => (addingOpen = !addingOpen)}
				aria-label="Add timeline"
			>
				<Plus size={12} />
			</Button>
		{/if}
	</header>

	{#if addingOpen && canEdit}
		<div class="flex flex-col gap-2 border-b px-3 py-2">
			<Input
				value={newName}
				oninput={(e) => (newName = (e.target as HTMLInputElement).value)}
				placeholder="Timeline name"
				class="h-7 text-xs"
			/>
			<div class="flex items-center gap-2">
				<input
					type="color"
					bind:value={newColor}
					class="h-6 w-8 cursor-pointer rounded border bg-transparent p-0"
					aria-label="Timeline color"
				/>
				<Button
					size="sm"
					class="h-7 flex-1 text-xs"
					disabled={saving || !newName.trim()}
					onclick={submitCreate}
				>
					Create
				</Button>
			</div>
		</div>
	{/if}

	<div class="flex items-center gap-2 border-b px-3 py-2">
		<button
			type="button"
			class="text-2xs text-muted-foreground transition-colors hover:text-foreground"
			onclick={onSelectAll}
		>
			{selectedIds.size === 0 ? 'Showing all' : 'Show all'}
		</button>
	</div>

	<div class={['overflow-y-auto py-1', footer ? 'max-h-[40%] shrink-0' : 'flex-1']}>
		{#if loading}
			<div class="px-3 py-4 text-center text-2xs text-muted-foreground">Loading…</div>
		{:else if timelines.length === 0}
			<div class="px-3 py-4 text-center text-2xs text-muted-foreground">No timelines yet.</div>
		{:else}
			<ul class="flex flex-col gap-0.5">
				{#each timelines as t (t.timeline_id)}
					{@const checked = selectedIds.has(t.timeline_id)}
					<li
						class="group"
						ondragover={(e) => onDragOver(e, t.timeline_id)}
						ondragleave={(e) => onDragLeave(e, t.timeline_id)}
						ondrop={(e) => onDrop(e, t.timeline_id)}
					>
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
										aria-label="Timeline color"
									/>
									<Button
										size="sm"
										class="h-6 flex-1 text-2xs"
										disabled={saving || !editingName.trim()}
										onclick={submitEdit}
									>
										Save
									</Button>
									<Button
										size="sm"
										variant="ghost"
										class="h-6 px-2 text-2xs"
										disabled={saving}
										onclick={cancelEdit}
									>
										Cancel
									</Button>
								</div>
							</div>
						{:else}
							<div
								class={[
									'flex items-center gap-2 rounded-sm px-2 py-1 transition-colors hover:bg-muted/50',
									checked && 'bg-muted',
									dropTargetId === t.timeline_id && 'bg-primary/15 ring-1 ring-inset ring-primary'
								]}
							>
								<Checkbox
									{checked}
									onCheckedChange={() => onToggle(t.timeline_id)}
									aria-label={`Toggle ${t.name}`}
								/>
								{#if t.color}
									<span
										class="h-2 w-2 shrink-0 rounded-full"
										style={`background-color: ${t.color};`}
										aria-hidden="true"
									></span>
								{/if}
								<span class="min-w-0 flex-1 truncate" title={t.name}>{t.name}</span>
								{#if dropTargetId === t.timeline_id}
									<span class="shrink-0 text-[9px] uppercase tracking-wider text-primary">
										{dropMode === 'add' ? 'Add' : 'Move'}
									</span>
								{/if}
								{#if t.is_default}
									<span
										class="shrink-0 rounded border border-border bg-muted/60 px-1 text-[9px] uppercase tracking-wider text-muted-foreground"
									>
										Default
									</span>
								{/if}
								{#if canEdit}
									<div class="hidden shrink-0 items-center gap-0.5 group-hover:flex">
										<Button
											size="icon"
											variant="ghost"
											class="h-5 w-5"
											onclick={() => startEdit(t)}
											aria-label={`Edit ${t.name}`}
										>
											<Pencil size={10} />
										</Button>
										{#if !t.is_default}
											<Button
												size="icon"
												variant="ghost"
												class="h-5 w-5 text-destructive hover:text-destructive"
												onclick={() => onRemove(t.timeline_id)}
												aria-label={`Delete ${t.name}`}
											>
												<Trash2 size={10} />
											</Button>
										{/if}
									</div>
								{/if}
							</div>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
	</div>

	{#if onDropEvents && canEdit && timelines.length}
		<p class="border-t px-3 py-1.5 text-[10px] leading-snug text-muted-foreground">
			Drop events on a timeline to move them, hold Alt to add them.
		</p>
	{/if}

	{#if footer}
		<div class="flex min-h-0 flex-1 flex-col border-t">
			{@render footer()}
		</div>
	{/if}
</aside>
