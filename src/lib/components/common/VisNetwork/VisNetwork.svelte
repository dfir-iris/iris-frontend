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

		const handleMouseLeave = () => {
			// Re-show the clickToUse overlay so the graph releases scroll
			// control back to the page until the user clicks into it again.
			if (options.clickToUse) {
				network?.setOptions({ clickToUse: true });
			}
		};

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

<div bind:this={container} class={className}></div>
