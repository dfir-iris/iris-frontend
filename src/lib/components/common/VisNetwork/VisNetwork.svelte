<script lang="ts">
	import { onMount } from 'svelte';
	// Use the root entry (which resolves to vis-network/peer) instead of
	// `vis-network/standalone`. The standalone bundle inlines vis-data;
	// the peer build expects it as a separate dependency — which we
	// already ship (see package.json). The dev container's anonymous
	// `/app/node_modules` volume sometimes ends up without a working
	// `./standalone` subpath export after partial reinstalls, which
	// breaks Vite SSR resolution. The other vis-network call-sites in
	// this repo already follow this convention.
	import { Network } from 'vis-network';
	import { DataSet } from 'vis-data';
	import type { Options, IdType, Position } from 'vis-network';
	import type { VisNode, VisEdge } from './types';
	import { releaseWheelToPage, type VisActivatable } from './utils';

	type Props = {
		nodes: VisNode[];
		edges: VisEdge[];
		options?: Options;
		className?: string;
		onClick?: (detail: { nodeId?: IdType }) => void;
		onContextMenu?: (detail: { x: number; y: number; nodeId?: IdType }) => void;
		// Callback fired once the underlying vis-network `Network` is
		// constructed. Consumers use it to drive imperative APIs the
		// declarative props don't cover — `.focus`, `.selectNodes`,
		// `.fit`, physics toggles, etc. Called again with `null` on
		// destroy so the consumer can drop any cached handle.
		onReady?: (network: Network | null) => void;
	};

	type NetworkEvent = {
		pointer: { DOM: Position };
		event?: {
			preventDefault: () => void;
		};
	};

	let {
		nodes,
		edges,
		options = {},
		className = '',
		onClick,
		onContextMenu,
		onReady
	}: Props = $props();

	let container = $state<HTMLDivElement | null>(null);
	let network = $state<Network | null>(null);
	let nodesDataSet = $state<DataSet<VisNode> | null>(null);
	let edgesDataSet = $state<DataSet<VisEdge> | null>(null);

	const hideTooltip = () => {
		container?.querySelectorAll('.vis-tooltip').forEach((element) => {
			if (element instanceof HTMLElement) {
				element.style.display = 'none';
			}
		});
	};

	const showTooltip = () => {
		container?.querySelectorAll('.vis-tooltip').forEach((element) => {
			if (element instanceof HTMLElement) {
				element.style.removeProperty('display');
			}
		});
	};

	onMount(() => {
		if (!container) return;

		nodesDataSet = new DataSet<VisNode>(nodes);
		edgesDataSet = new DataSet<VisEdge>(edges);

		network = new Network(
			container,
			{
				nodes: nodesDataSet,
				edges: edgesDataSet
			},
			options
		);

		const handleClick = (params: NetworkEvent) => {
			showTooltip();
			// Include the clicked node id (or undefined for empty-canvas
			// clicks) so consumers can drive selection panels without
			// wiring the vis-network `selectNode` event separately.
			const nodeId = network?.getNodeAt(params.pointer.DOM);
			onClick?.({ nodeId });
		};

		const handleContext = (params: NetworkEvent) => {
			params.event?.preventDefault();

			hideTooltip();

			const nodeId = network?.getNodeAt(params.pointer.DOM);

			onContextMenu?.({
				...params.pointer.DOM,
				nodeId
			});
		};

		network.on('click', handleClick);
		network.on('oncontext', handleContext);

		const handleMouseLeave = () =>
			releaseWheelToPage(network as (Network & VisActivatable) | null, options.clickToUse);

		container.addEventListener('mouseleave', handleMouseLeave);

		onReady?.(network);

		let resizeTimeout: ReturnType<typeof setTimeout>;

		const observer = new ResizeObserver(() => (resizeTimeout = setTimeout(() => network?.fit())));

		observer.observe(container);

		return () => {
			clearTimeout(resizeTimeout);
			observer.disconnect();
			container?.removeEventListener('mouseleave', handleMouseLeave);
			network?.off('click', handleClick);
			network?.off('oncontext', handleContext);
			network?.destroy();
			network = null;
			nodesDataSet = null;
			edgesDataSet = null;
			onReady?.(null);
		};
	});

	$effect(() => {
		if (!nodesDataSet) return;

		nodesDataSet.clear();
		nodesDataSet.add(nodes);
	});

	$effect(() => {
		if (!edgesDataSet) return;

		edgesDataSet.clear();
		edgesDataSet.add(edges);
	});

	$effect(() => {
		if (!network) return;

		network.setOptions(options);

		showTooltip();
	});
</script>

<div bind:this={container} class="vis-network-host {className}"></div>

<style>
	/*
	  `clickToUse` works by laying a transparent `.vis-overlay` over the
	  canvas that swallows input until the user clicks in. vis-network builds
	  that element at runtime but ships its styling separately, in
	  `vis-util/.../activator.css` — and the root `vis-network` entry we
	  import (deliberately, see the note at the top of this file) pulls in no
	  CSS at all. Unstyled, the overlay is a statically positioned, zero-height
	  div that covers nothing, so the wheel reaches the canvas and the graph
	  zooms the moment the pointer crosses it while the page is being
	  scrolled. Restore just the rules the overlay needs rather than importing
	  the full vis stylesheet, which would also restyle tooltips and ship
	  bootstrap overrides.
	*/
	.vis-network-host :global(.vis-overlay) {
		position: absolute;
		inset: 0;
		z-index: 10;
	}

	/* The overlay is invisible, so signal that a click is needed to interact
	   — otherwise the swallowed first click just reads as an unresponsive
	   graph. */
	.vis-network-host :global(.vis-overlay)::after {
		content: 'Click to interact';
		position: absolute;
		bottom: 0.5rem;
		left: 50%;
		transform: translateX(-50%);
		padding: 0.125rem 0.5rem;
		border: 1px solid hsl(var(--border));
		border-radius: 9999px;
		background: hsl(var(--background));
		color: hsl(var(--muted-foreground));
		font-size: 0.6875rem;
		line-height: 1rem;
		white-space: nowrap;
		opacity: 0;
		transition: opacity 150ms ease;
	}

	.vis-network-host :global(.vis-overlay):hover::after {
		opacity: 1;
	}

	/* Active-state ring, themed instead of vis's hardcoded blue. */
	.vis-network-host :global(.vis-network.vis-active) {
		box-shadow: 0 0 0 2px hsl(var(--primary) / 0.4);
	}
</style>
