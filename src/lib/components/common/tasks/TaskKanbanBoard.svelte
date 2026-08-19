<!--
  Generic kanban board.

  Deliberately knows nothing about *which* model it is showing: case
  tasks and war-room tasks have different shapes (multi-assignee vs
  single, nested `status` object vs flat `status_id`), and the alerts
  triage board groups a third model by severity *or* status, so the
  caller supplies accessors and a `card` snippet and keeps ownership of
  its own state. What lives here is only what every board needs to agree
  on — column layout, drag mechanics, drop targeting and the in-flight
  indicator while a move is being persisted.

  Drag uses the native HTML5 API, matching the reparent drag already in
  the war-room task list and the notes tree. Native DnD gives nothing to
  keyboard users, so a focused card can also be moved with
  Ctrl/Cmd + ArrowLeft / ArrowRight.
-->
<script lang="ts" module>
	// Declared here only so ESLint's `no-undef` can see the name — the
	// real `T` comes from the `generics` attribute below. Same shim as
	// ui/data-table/flex-render.svelte.
	type T = unknown;
</script>

<script lang="ts" generics="T">
	import type { Snippet } from 'svelte';
	import type { KanbanColumn } from './kanban-types';

	type Props = {
		columns: KanbanColumn[];
		items: T[];
		idOf: (item: T) => number;
		columnIdOf: (item: T) => number | null;
		/**
		 * Persist a move. Awaited so the board can dim the card until the
		 * server has answered; the caller owns the optimistic update and
		 * any rollback.
		 */
		onMove: (item: T, toColumnId: number | null) => unknown;
		/** Click / Enter / Space on a card — typically opens the task. */
		onActivate?: (item: T) => void;
		card: Snippet<[T]>;
		/** Rendered inside every empty column body. */
		emptyLabel?: string;
		/**
		 * Noun for a single card, used in its accessible name
		 * (`"<itemLabel> <id>"`). Cards render arbitrary caller markup,
		 * so without this a screen reader announces every board — tasks,
		 * alerts — as "Task <n>".
		 */
		itemLabel?: string;
		/**
		 * `'scroll'` (default) pins columns to a fixed width and lets the
		 * board scroll sideways — right for a board sharing a page with
		 * other panels. `'fill'` spreads the columns evenly across the
		 * available width and loosens the spacing, for a board that owns
		 * its page (the alerts triage queue).
		 */
		layout?: 'scroll' | 'fill';
	};

	let {
		columns,
		items,
		idOf,
		columnIdOf,
		onMove,
		onActivate,
		card,
		emptyLabel = 'No tasks',
		itemLabel = 'Task',
		layout = 'scroll'
	}: Props = $props();

	const fill = $derived(layout === 'fill');

	// `null` is a valid column id, so buckets are keyed by string.
	const ORPHAN = '__orphan__';
	const colKey = (id: number | null) => (id === null ? '__none__' : String(id));

	let draggingId = $state<number | null>(null);
	let dropKey = $state<string | null>(null);
	let movingId = $state<number | null>(null);
	let root = $state<HTMLDivElement | null>(null);

	const grouped = $derived.by(() => {
		const map = new Map<string, T[]>();
		for (const c of columns) map.set(colKey(c.id), []);
		map.set(ORPHAN, []);

		for (const item of items) {
			const key = colKey(columnIdOf(item));
			// A task pointing at a status that isn't in `columns` (deleted
			// status, or a filtered-down column set) would otherwise vanish
			// from the board with no trace. Park it in a trailing bucket
			// instead — visibly odd beats silently missing.
			(map.get(key) ?? map.get(ORPHAN))!.push(item);
		}
		return map;
	});

	const orphans = $derived(grouped.get(ORPHAN) ?? []);

	const dotClass = (bscolor: string | null | undefined) => {
		switch ((bscolor ?? '').toLowerCase()) {
			case 'danger':
			case 'red':
				return 'bg-red-500';
			case 'warning':
			case 'orange':
				return 'bg-amber-500';
			// Split out of the warning group so a severity ramp
			// (critical → high → medium) doesn't paint two adjacent
			// columns the same amber.
			case 'yellow':
				return 'bg-yellow-500';
			case 'success':
			case 'green':
				return 'bg-emerald-500';
			case 'info':
			case 'primary':
			case 'blue':
				return 'bg-sky-500';
			case 'purple':
			case 'violet':
				return 'bg-violet-500';
			case 'secondary':
			case 'gray':
			case 'grey':
			case 'slate':
				return 'bg-slate-400';
			default:
				return 'bg-muted-foreground/40';
		}
	};

	const findItem = (id: number): T | undefined => items.find((x) => idOf(x) === id);

	const move = async (item: T, toColumnId: number | null) => {
		if (columnIdOf(item) === toColumnId) return;
		movingId = idOf(item);
		try {
			await onMove(item, toColumnId);
		} finally {
			movingId = null;
		}
	};

	const onDragStart = (e: DragEvent, item: T) => {
		if (!e.dataTransfer) return;
		draggingId = idOf(item);
		e.dataTransfer.effectAllowed = 'move';
		// Firefox refuses to start a drag unless data is set on the transfer.
		e.dataTransfer.setData('text/plain', String(idOf(item)));
	};

	const onDragEnd = () => {
		draggingId = null;
		dropKey = null;
	};

	const onDragOver = (e: DragEvent, key: string) => {
		if (draggingId === null) return;
		e.preventDefault();
		if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
		dropKey = key;
	};

	const onDrop = async (e: DragEvent, toColumnId: number | null) => {
		e.preventDefault();
		const id = draggingId;
		draggingId = null;
		dropKey = null;
		if (id === null) return;
		const item = findItem(id);
		if (item) await move(item, toColumnId);
	};

	const onCardKey = async (e: KeyboardEvent, item: T) => {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			onActivate?.(item);
			return;
		}
		// Keyboard equivalent of the drag. Held modifier so plain arrows
		// stay available for scrolling the column.
		if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
		if (!e.ctrlKey && !e.metaKey) return;
		e.preventDefault();
		const current = columns.findIndex((c) => c.id === columnIdOf(item));
		if (current === -1) return;
		const next = columns[current + (e.key === 'ArrowRight' ? 1 : -1)];
		if (!next) return;
		await move(item, next.id);
		// Keep focus on the card so a run of moves doesn't need a re-grab.
		// The element itself is gone — the card is re-created inside the
		// destination column's `{#each}` — so refocus by id once the DOM
		// has caught up.
		const id = idOf(item);
		requestAnimationFrame(() => {
			root?.querySelector<HTMLElement>(`[data-kanban-card="${id}"]`)?.focus();
		});
	};
</script>

<div
	bind:this={root}
	class={['flex h-full min-h-0 w-full overflow-x-auto pb-2', fill ? 'gap-4' : 'gap-3']}
>
	{#each columns as c (colKey(c.id))}
		{@const key = colKey(c.id)}
		{@const list = grouped.get(key) ?? []}
		{@render columnPanel(c.title, c.bscolor, key, list, c.id, true)}
	{/each}

	{#if orphans.length > 0}
		{@render columnPanel('Unknown status', null, ORPHAN, orphans, null, false)}
	{/if}
</div>

{#snippet columnPanel(
	title: string,
	bscolor: string | null | undefined,
	key: string,
	list: T[],
	columnId: number | null,
	droppable: boolean
)}
	<!--
	  `role="group"` + a label so the column announces itself: the drop
	  handlers below are mouse-only, and a screen reader otherwise reads
	  the cards with no indication of which status they sit under.
	-->
	<section
		role="group"
		aria-label={title}
		class={[
			'flex h-full flex-col rounded-lg border transition-colors',
			// `basis-0` so every column ends up the same width whatever its
			// title length; `min-w-` keeps them readable once there are more
			// columns than the viewport can spread, at which point the row
			// scrolls as usual.
			//
			// A full-width board is mostly column, so the well needs enough
			// tint to read as a container: `muted/20` sits 1% off the page
			// background and the columns dissolve into it.
			fill ? 'min-w-56 flex-1 basis-0 border-border/70 bg-muted/70' : 'w-72 shrink-0 bg-muted/20',
			droppable && dropKey === key && '!border-primary !bg-primary/5'
		]}
		ondragover={(e) => droppable && onDragOver(e, key)}
		ondragleave={() => {
			if (dropKey === key) dropKey = null;
		}}
		ondrop={(e) => droppable && onDrop(e, columnId)}
	>
		<header class={['flex items-center gap-2 border-b', fill ? 'px-4 py-3' : 'px-3 py-2']}>
			<span class={['shrink-0 rounded-full', fill ? 'h-2.5 w-2.5' : 'h-2 w-2', dotClass(bscolor)]}
			></span>
			<h3
				class={[
					'min-w-0 flex-1 truncate font-semibold uppercase tracking-wider',
					fill ? 'text-sm' : 'text-xs'
				]}
			>
				{title}
			</h3>
			<span
				class={[
					'shrink-0 rounded-full bg-muted px-1.5 text-muted-foreground',
					fill ? 'text-xs' : 'text-2xs'
				]}
			>
				{list.length}
			</span>
		</header>

		<div class={['flex min-h-0 flex-1 flex-col overflow-y-auto', fill ? 'gap-3 p-3' : 'gap-2 p-2']}>
			{#each list as item (idOf(item))}
				{@const id = idOf(item)}
				<div
					role="button"
					tabindex="0"
					draggable="true"
					aria-label={`${itemLabel} ${id}`}
					data-kanban-card={id}
					class={[
						'cursor-grab rounded-md border bg-card text-left shadow-sm transition-colors hover:border-primary/40 hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing',
						fill ? 'p-3' : 'p-2',
						draggingId === id && 'opacity-40',
						movingId === id && 'pointer-events-none opacity-60'
					]}
					ondragstart={(e) => onDragStart(e, item)}
					ondragend={onDragEnd}
					onclick={() => onActivate?.(item)}
					onkeydown={(e) => onCardKey(e, item)}
				>
					{@render card(item)}
				</div>
			{:else}
				<p
					class={[
						'px-1 text-center text-muted-foreground',
						fill ? 'py-6 text-xs' : 'py-4 text-2xs'
					]}
				>
					{emptyLabel}
				</p>
			{/each}
		</div>
	</section>
{/snippet}
