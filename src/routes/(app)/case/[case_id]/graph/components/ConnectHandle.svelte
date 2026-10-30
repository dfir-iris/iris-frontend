<!--
  Drag-to-connect. Hovering a linkable node shows a small handle on its
  top-right corner; dragging it draws a relation preview (cytoscape
  edgehandles) and dropping on another node asks for the relation. The edge
  edgehandles adds is removed straight away — the stored one comes back
  from the API.
-->
<script lang="ts">
	import { onDestroy } from 'svelte';
	import type { Core, EventObject, NodeSingular } from 'cytoscape';
	import { SplineIcon } from 'lucide-svelte';

	interface EdgeHandles {
		start: (node: NodeSingular) => void;
		stop: () => void;
		destroy: () => void;
	}

	interface Props {
		cy: Core | null;
		enabled: boolean;
		canConnect: (sourceId: string, targetId: string) => boolean;
		canStart: (id: string) => boolean;
		onConnect: (sourceId: string, targetId: string) => void;
	}

	let { cy, enabled, canConnect, canStart, onConnect }: Props = $props();

	let hovered = $state<{ id: string; x: number; y: number } | null>(null);
	let drawing = $state(false);
	let hideTimer: ReturnType<typeof setTimeout> | undefined;

	let eh: EdgeHandles | null = null;
	let bound: Core | null = null;

	const place = (node: NodeSingular) => {
		const bb = node.renderedBoundingBox({ includeLabels: false, includeOverlays: false });
		hovered = { id: node.id(), x: bb.x2 - 2, y: bb.y1 - 2 };
	};

	const onOver = (evt: EventObject) => {
		if (drawing || !enabled) return;
		const node = evt.target as NodeSingular;
		if (!canStart(node.id())) return;
		clearTimeout(hideTimer);
		place(node);
	};

	const onOut = () => {
		if (drawing) return;
		clearTimeout(hideTimer);
		// Leave time to reach the handle, which sits on the node border.
		hideTimer = setTimeout(() => (hovered = null), 400);
	};

	const reset = () => {
		if (!drawing) hovered = null;
	};

	const onComplete = (
		_evt: EventObject,
		source: NodeSingular,
		target: NodeSingular,
		added: { remove: () => void }
	) => {
		added?.remove?.();
		drawing = false;
		hovered = null;
		onConnect(source.id(), target.id());
	};

	const onStop = () => {
		drawing = false;
	};

	const onWindowUp = () => {
		if (drawing) eh?.stop();
	};

	const unbind = () => {
		if (!bound) return;
		bound.off('mouseover', 'node', onOver);
		bound.off('mouseout', 'node', onOut);
		bound.off('grab pan zoom', reset);
		bound.off('ehcomplete', onComplete as never);
		bound.off('ehstop', onStop);
		if (!bound.destroyed()) eh?.destroy();
		eh = null;
		bound = null;
	};

	$effect(() => {
		const c = cy;
		if (c === bound) return;
		unbind();
		hovered = null;
		if (!c) return;
		bound = c;
		const factory = (c as unknown as { edgehandles?: (o: object) => EdgeHandles }).edgehandles;
		if (!factory) return;
		eh = factory.call(c, {
			canConnect: (s: NodeSingular, t: NodeSingular) => !s.same(t) && canConnect(s.id(), t.id()),
			edgeParams: () => ({ classes: ['eh-added'] }),
			hoverDelay: 120,
			snap: true,
			snapThreshold: 30,
			noEdgeEventsInDraw: true,
			disableBrowserGestures: true
		});
		c.on('mouseover', 'node', onOver);
		c.on('mouseout', 'node', onOut);
		c.on('grab pan zoom', reset);
		c.on('ehcomplete', onComplete as never);
		c.on('ehstop', onStop);
	});

	$effect(() => {
		if (!enabled) hovered = null;
	});

	onDestroy(() => {
		clearTimeout(hideTimer);
		unbind();
	});

	const start = (e: PointerEvent) => {
		if (!eh || !bound || !hovered) return;
		const node = bound.getElementById(hovered.id);
		if (node.empty()) return;
		e.preventDefault();
		e.stopPropagation();
		clearTimeout(hideTimer);
		drawing = true;
		eh.start(node as NodeSingular);
	};
</script>

<svelte:window onpointerup={onWindowUp} />

{#if hovered && enabled}
	<button
		type="button"
		class="absolute z-10 flex h-5 w-5 -translate-x-1/2 -translate-y-1/2 cursor-crosshair items-center justify-center rounded-full border bg-background text-primary shadow-sm transition-transform hover:scale-125 {drawing
			? 'pointer-events-none opacity-0'
			: ''}"
		style="left: {hovered.x}px; top: {hovered.y}px"
		title="Drag onto another node to link them"
		aria-label="Drag to create a relation"
		onpointerdown={start}
		onpointerenter={() => clearTimeout(hideTimer)}
		onpointerleave={() => {
			if (!drawing) hideTimer = setTimeout(() => (hovered = null), 200);
		}}
	>
		<SplineIcon class="h-3 w-3" />
	</button>
{/if}
