<!--
  Event-count histogram of the search view.

  One bar per bucket the backend computed — about 120 over the window,
  so plain DOM is enough and keeps the drag precise. Dragging across the
  bars zooms on the window they cover; double-clicking a bar zooms on
  that bar alone. The host owns the range: this only reports it.
-->
<script lang="ts">
	import { XIcon, ZoomOutIcon } from 'lucide-svelte';
	import { formatDateTime } from '$lib/utils/time-formatter';
	import type { CaseTimelineHistogram } from '$lib/services/case-timeline.service';
	import { bucketsRange, formatInterval, serverDateMs } from '../search-helpers';

	type Props = {
		histogram: CaseTimelineHistogram | null;
		loading?: boolean;
		/** Label of the current window, e.g. "Last 7 days"; null when it is all time. */
		rangeLabel?: string | null;
		onZoom: (range: { start: string; end: string }) => void;
		onClearRange?: () => void;
	};

	let { histogram, loading = false, rangeLabel = null, onZoom, onClearRange }: Props = $props();

	const buckets = $derived(histogram?.buckets ?? []);
	const interval = $derived(histogram?.interval_seconds ?? 1);
	const max = $derived(buckets.reduce((m, b) => Math.max(m, b.count), 0));

	let barsEl = $state<HTMLDivElement | null>(null);
	let dragFrom = $state<number | null>(null);
	let dragTo = $state<number | null>(null);
	let hovered = $state<number | null>(null);

	const indexAt = (clientX: number): number => {
		if (!barsEl || !buckets.length) return 0;
		const rect = barsEl.getBoundingClientRect();
		const ratio = (clientX - rect.left) / Math.max(rect.width, 1);
		return Math.min(buckets.length - 1, Math.max(0, Math.floor(ratio * buckets.length)));
	};

	const inDrag = (i: number): boolean =>
		dragFrom !== null &&
		dragTo !== null &&
		i >= Math.min(dragFrom, dragTo) &&
		i <= Math.max(dragFrom, dragTo);

	const onPointerDown = (e: PointerEvent) => {
		if (e.button !== 0 || !buckets.length) return;
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
		dragFrom = indexAt(e.clientX);
		dragTo = dragFrom;
	};

	const onPointerMove = (e: PointerEvent) => {
		hovered = indexAt(e.clientX);
		if (dragFrom !== null) dragTo = hovered;
	};

	const onPointerUp = () => {
		const from = dragFrom;
		const to = dragTo;
		dragFrom = null;
		dragTo = null;
		// A click is not a zoom; double-click is the one-bar gesture.
		if (from === null || to === null || from === to) return;
		const range = bucketsRange(buckets, interval, from, to);
		if (range) onZoom(range);
	};

	const onDoubleClick = (e: MouseEvent) => {
		const i = indexAt(e.clientX);
		const range = bucketsRange(buckets, interval, i, i);
		if (range) onZoom(range);
	};

	// Day-wide bars are labelled by day, anything finer to the second.
	const label = (value: string): string =>
		interval >= 86400
			? formatDateTime(value, { year: 'numeric', month: 'short', day: 'numeric' })
			: formatDateTime(value, {
					month: 'short',
					day: 'numeric',
					hour: '2-digit',
					minute: '2-digit',
					second: interval < 60 ? '2-digit' : undefined
				});

	const bucketEnd = (start: string): string =>
		new Date(serverDateMs(start) + interval * 1000).toISOString();

	const ticks = $derived.by(() => {
		if (buckets.length < 2) return buckets.map((b, i) => ({ i, label: label(b.start) }));
		const step = Math.max(1, Math.floor(buckets.length / 4));
		const picked: { i: number; label: string }[] = [];
		for (let i = 0; i < buckets.length; i += step)
			picked.push({ i, label: label(buckets[i].start) });
		return picked;
	});

	const hoveredBucket = $derived(hovered !== null ? buckets[hovered] : undefined);
</script>

<div class="border-b border-border bg-card px-4 pb-2 pt-1.5">
	<div class="flex items-center gap-2 text-2xs text-muted-foreground">
		<span class="font-medium tabular-nums text-foreground">
			{(histogram?.total ?? 0).toLocaleString()}
			{histogram?.total === 1 ? 'event' : 'events'}
		</span>
		{#if rangeLabel}
			<span class="truncate">· {rangeLabel}</span>
			{#if onClearRange}
				<button
					type="button"
					class="inline-flex items-center gap-0.5 rounded px-1 hover:bg-muted hover:text-foreground"
					onclick={onClearRange}
					aria-label="Clear the time range"
				>
					<XIcon class="size-3" /> clear
				</button>
			{/if}
		{/if}
		<span class="ml-auto flex items-center gap-2">
			{#if hoveredBucket}
				<span class="tabular-nums">
					{label(hoveredBucket.start)} → {label(bucketEnd(hoveredBucket.start))}:
					<span class="font-medium text-foreground">{hoveredBucket.count}</span>
				</span>
			{:else if buckets.length}
				<span class="hidden items-center gap-1 sm:inline-flex">
					<ZoomOutIcon class="size-3" /> drag to zoom · double-click a bar
				</span>
			{/if}
			{#if histogram && buckets.length}
				<span class="tabular-nums">{formatInterval(interval)} per bar</span>
			{/if}
		</span>
	</div>

	<div
		bind:this={barsEl}
		class={[
			'relative mt-1 flex h-20 cursor-crosshair select-none items-end gap-px',
			loading && 'opacity-50'
		]}
		role="img"
		aria-label="Events over time"
		onpointerdown={onPointerDown}
		onpointermove={onPointerMove}
		onpointerup={onPointerUp}
		onpointercancel={() => {
			dragFrom = null;
			dragTo = null;
		}}
		onpointerleave={() => (hovered = null)}
		ondblclick={onDoubleClick}
	>
		{#if !buckets.length}
			<div class="flex h-full w-full items-center justify-center text-2xs text-muted-foreground">
				{loading ? 'Loading…' : 'No events in this window'}
			</div>
		{:else}
			{#each buckets as bucket, i (bucket.start)}
				<div
					class={[
						'relative h-full min-w-0 flex-1',
						inDrag(i) && 'bg-primary/15',
						hovered === i && dragFrom === null && 'bg-muted'
					]}
				>
					{#if bucket.count > 0}
						<div
							class={[
								'absolute inset-x-0 bottom-0 rounded-t-[1px]',
								inDrag(i) ? 'bg-primary' : 'bg-primary/60'
							]}
							style="height: {Math.max(4, (bucket.count / max) * 100)}%"
						></div>
					{/if}
				</div>
			{/each}
		{/if}
	</div>

	{#if buckets.length}
		<div
			class="relative mt-0.5 h-3.5 overflow-hidden text-[10px] tabular-nums text-muted-foreground"
		>
			{#each ticks as tick (tick.i)}
				<span
					class="absolute top-0 whitespace-nowrap"
					style="left: {(tick.i / buckets.length) * 100}%"
				>
					{tick.label}
				</span>
			{/each}
		</div>
	{/if}
</div>
