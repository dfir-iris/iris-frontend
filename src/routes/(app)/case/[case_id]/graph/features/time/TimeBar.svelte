<!--
  Time bar over the bottom of the canvas: a histogram of the relations by
  `first_seen`, a two-handle brush filtering the graph to a time range, and
  the replay controls (edges revealed in `first_seen` order, nodes appearing
  with their first edge).
-->
<script lang="ts">
	import {
		PauseIcon,
		PlayIcon,
		SkipBackIcon,
		SkipForwardIcon,
		SquareIcon,
		XIcon
	} from 'lucide-svelte';
	import { formatDateTime } from '$lib/utils/time-formatter';
	import type { CaseGraphState } from '../../lib/graph-state.svelte';
	import { histogram } from '../../lib/time';
	import { getGraphFeatures } from '../context';
	import { REPLAY_SPEEDS } from '../time.svelte';

	let { graph }: { graph: CaseGraphState } = $props();

	const { time } = getGraphFeatures();

	const HOUR = 3_600_000;

	/** Display bounds; a single instant is padded so the handles can move. */
	const lo = $derived(
		time.bounds ? time.bounds.min - (time.bounds.max === time.bounds.min ? HOUR : 0) : 0
	);
	const hi = $derived(
		time.bounds ? time.bounds.max + (time.bounds.max === time.bounds.min ? HOUR : 0) : 1
	);
	const span = $derived(Math.max(1, hi - lo));

	const bars = $derived(
		time.bounds ? histogram(graph.edges, { min: lo, max: hi }, 60) : ([] as number[])
	);
	const peak = $derived(Math.max(1, ...bars));

	// Draft values while dragging, committed on the next frame.
	let draft = $state<{ from: number; to: number } | null>(null);
	const from = $derived(draft?.from ?? time.range?.from ?? lo);
	const to = $derived(draft?.to ?? time.range?.to ?? hi);

	const frac = (t: number) => Math.max(0, Math.min(1, (t - lo) / span)) * 100;

	let track = $state<HTMLDivElement | null>(null);
	let dragging = $state<'from' | 'to' | null>(null);
	let raf = 0;

	const timeAt = (clientX: number) => {
		const r = track?.getBoundingClientRect();
		if (!r || r.width === 0) return lo;
		return lo + Math.max(0, Math.min(1, (clientX - r.left) / r.width)) * span;
	};

	const commit = (f: number, t: number) => {
		draft = { from: f, to: t };
		cancelAnimationFrame(raf);
		raf = requestAnimationFrame(() => {
			time.setRange(Math.round(f), Math.round(t));
			draft = null;
		});
	};

	const move = (which: 'from' | 'to', t: number) => {
		if (which === 'from') commit(Math.min(t, to), to);
		else commit(from, Math.max(t, from));
	};

	const onHandleDown = (which: 'from' | 'to', e: PointerEvent) => {
		e.stopPropagation();
		dragging = which;
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
	};

	const onHandleMove = (e: PointerEvent) => {
		if (dragging) move(dragging, timeAt(e.clientX));
	};

	const onTrackDown = (e: PointerEvent) => {
		const t = timeAt(e.clientX);
		if (time.step !== null) {
			time.seek(t);
			return;
		}
		move(Math.abs(t - from) <= Math.abs(t - to) ? 'from' : 'to', t);
	};

	const onHandleKey = (which: 'from' | 'to', e: KeyboardEvent) => {
		const value = which === 'from' ? from : to;
		const small = span / 100;
		const big = span / 10;
		let next: number | null = null;
		if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next = value - small;
		else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') next = value + small;
		else if (e.key === 'PageDown') next = value - big;
		else if (e.key === 'PageUp') next = value + big;
		else if (e.key === 'Home') next = lo;
		else if (e.key === 'End') next = hi;
		if (next === null) return;
		e.preventDefault();
		move(which, Math.max(lo, Math.min(hi, next)));
	};

	const label = (t: number) => formatDateTime(new Date(t));
	const replayLabel = $derived(
		time.frame?.current
			? `${time.step} / ${time.order.length} · ${time.frame.at !== null ? label(time.frame.at) : ''}`
			: `0 / ${time.order.length}`
	);
</script>

{#if time.open}
	<div
		class="absolute bottom-12 left-1/2 z-10 w-[min(44rem,calc(100%-14rem))] -translate-x-1/2 rounded-md border bg-background/95 p-2 text-xs shadow-md backdrop-blur"
		role="group"
		aria-label="Time slider"
	>
		<div class="mb-1.5 flex flex-wrap items-center gap-1.5">
			<button
				type="button"
				class="rounded p-1 hover:bg-accent disabled:opacity-40"
				aria-label="Previous step"
				title="Previous step"
				disabled={!time.order.length || !time.step}
				onclick={() => time.stepBy(-1)}
			>
				<SkipBackIcon class="h-3.5 w-3.5" />
			</button>
			<button
				type="button"
				class="rounded bg-primary p-1 text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
				aria-label={time.playing ? 'Pause the replay' : 'Play the replay'}
				title={time.order.length
					? time.playing
						? 'Pause'
						: 'Replay the relations in first-seen order'
					: 'No dated relation to replay'}
				disabled={!time.order.length}
				onclick={() => time.toggle()}
			>
				{#if time.playing}
					<PauseIcon class="h-3.5 w-3.5" />
				{:else}
					<PlayIcon class="h-3.5 w-3.5" />
				{/if}
			</button>
			<button
				type="button"
				class="rounded p-1 hover:bg-accent disabled:opacity-40"
				aria-label="Next step"
				title="Next step"
				disabled={!time.order.length || (time.step ?? 0) >= time.order.length}
				onclick={() => time.stepBy(1)}
			>
				<SkipForwardIcon class="h-3.5 w-3.5" />
			</button>
			<label class="flex items-center gap-1 text-muted-foreground">
				<span class="sr-only">Replay speed</span>
				<select
					class="h-6 rounded border border-input bg-background px-1 text-xs text-foreground"
					value={String(time.speed)}
					onchange={(e) => time.setSpeed(Number(e.currentTarget.value))}
				>
					{#each REPLAY_SPEEDS as s (s)}
						<option value={String(s)}>{s}×</option>
					{/each}
				</select>
			</label>
			{#if time.step !== null}
				<span class="tabular-nums text-muted-foreground" aria-live="polite">{replayLabel}</span>
				<button
					type="button"
					class="flex items-center gap-1 rounded px-1 py-0.5 hover:bg-accent"
					title="Leave the replay and show every relation"
					onclick={() => time.stop()}
				>
					<SquareIcon class="h-3 w-3" />Stop
				</button>
			{/if}
			<span class="flex-1"></span>
			{#if time.range}
				<button
					type="button"
					class="rounded px-1 py-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
					onclick={() => time.clearRange()}
				>
					Clear range
				</button>
			{/if}
			<button
				type="button"
				class="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
				aria-label="Close the time slider"
				onclick={() => (time.open = false)}
			>
				<XIcon class="h-3.5 w-3.5" />
			</button>
		</div>

		{#if time.bounds}
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div
				bind:this={track}
				class="relative h-10 cursor-crosshair touch-none select-none"
				onpointerdown={onTrackDown}
			>
				<div class="absolute inset-x-0 bottom-0 top-0 flex items-end gap-px" aria-hidden="true">
					{#each bars as count, i (i)}
						<div
							class="flex-1 rounded-t-sm bg-muted-foreground/25"
							style="height: {count ? Math.max(8, (count / peak) * 100) : 0}%"
						></div>
					{/each}
				</div>
				<div
					class="pointer-events-none absolute inset-y-0 rounded-sm bg-primary/15 ring-1 ring-inset ring-primary/40"
					style="left: {frac(from)}%; width: {Math.max(0, frac(to) - frac(from))}%"
				></div>
				{#if time.frame?.at != null}
					<div
						class="pointer-events-none absolute inset-y-0 w-0.5 bg-amber-500"
						style="left: {frac(time.frame.at)}%"
						aria-hidden="true"
					></div>
				{/if}
				{#each [['from', from], ['to', to]] as const as [which, value] (which)}
					<div
						role="slider"
						tabindex="0"
						aria-label={which === 'from' ? 'Range start' : 'Range end'}
						aria-valuemin={lo}
						aria-valuemax={hi}
						aria-valuenow={Math.round(value)}
						aria-valuetext={label(value)}
						title={label(value)}
						class="absolute inset-y-0 z-10 w-2.5 -translate-x-1/2 cursor-ew-resize rounded-sm border border-primary bg-background shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						style="left: {frac(value)}%"
						onpointerdown={(e) => onHandleDown(which, e)}
						onpointermove={onHandleMove}
						onpointerup={() => (dragging = null)}
						onpointercancel={() => (dragging = null)}
						onkeydown={(e) => onHandleKey(which, e)}
					></div>
				{/each}
			</div>
			<div class="mt-1 flex justify-between gap-2 tabular-nums text-muted-foreground">
				<span>{label(from)}</span>
				{#if time.range}
					<span class="text-foreground">Filtered</span>
				{/if}
				<span>{label(to)}</span>
			</div>
		{:else}
			<p class="py-2 text-center text-muted-foreground">No dated object in the graph.</p>
		{/if}
	</div>
{/if}
