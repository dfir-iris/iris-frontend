<!--
  Drag bar between a side panel and the canvas. `side` is where the panel
  sits relative to the bar: dragging away from it widens the panel. The
  width is kept in localStorage under `storageKey`; double-click restores
  `initial`, and the arrow keys nudge it.
-->
<script lang="ts">
	import { onMount } from 'svelte';

	type Props = {
		width: number;
		side: 'left' | 'right';
		storageKey: string;
		initial: number;
		min?: number;
		max?: number;
		label?: string;
	};

	let {
		width = $bindable(),
		side,
		storageKey,
		initial,
		min = 160,
		max = 900,
		label = 'Resize the panel'
	}: Props = $props();

	const STEP = 16;
	let dragging = $state(false);
	let startX = 0;
	let startWidth = 0;

	// Never wider than most of the window, so the canvas stays usable
	const upper = () => Math.max(min, Math.min(max, Math.round(window.innerWidth * 0.6)));
	const clamp = (value: number) => Math.min(upper(), Math.max(min, Math.round(value)));

	function save() {
		localStorage.setItem(storageKey, String(width));
	}

	onMount(() => {
		const stored = Number(localStorage.getItem(storageKey));
		if (stored) width = clamp(stored);
	});

	function onPointerDown(event: PointerEvent) {
		if (event.button !== 0) return;
		event.preventDefault();
		(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
		dragging = true;
		startX = event.clientX;
		startWidth = width;
		document.body.style.userSelect = 'none';
		document.body.style.cursor = 'col-resize';
	}

	function onPointerMove(event: PointerEvent) {
		if (!dragging) return;
		const delta = event.clientX - startX;
		width = clamp(startWidth + (side === 'left' ? delta : -delta));
	}

	function onPointerUp(event: PointerEvent) {
		if (!dragging) return;
		dragging = false;
		(event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
		document.body.style.userSelect = '';
		document.body.style.cursor = '';
		save();
	}

	function onKeyDown(event: KeyboardEvent) {
		const grow = side === 'left' ? 'ArrowRight' : 'ArrowLeft';
		const shrink = side === 'left' ? 'ArrowLeft' : 'ArrowRight';
		if (event.key !== grow && event.key !== shrink) return;
		event.preventDefault();
		width = clamp(width + (event.key === grow ? STEP : -STEP));
		save();
	}

	function reset() {
		width = clamp(initial);
		save();
	}
</script>

<button
	type="button"
	aria-label={label}
	title={`${label} (double-click to reset)`}
	class={`relative z-10 w-1 shrink-0 cursor-col-resize touch-none border-0 p-0 transition-colors hover:bg-primary/40 focus-visible:bg-primary/40 focus-visible:outline-none ${
		dragging ? 'bg-primary/60' : ''
	}`}
	onpointerdown={onPointerDown}
	onpointermove={onPointerMove}
	onpointerup={onPointerUp}
	onpointercancel={onPointerUp}
	onkeydown={onKeyDown}
	ondblclick={reset}
	data-testid={`wf-resize-${storageKey}`}
></button>
