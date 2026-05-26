<script lang="ts">
	import { onMount } from 'svelte';
	import { Network, DataSet } from 'vis-network/standalone';
	import type { Options, IdType, Position } from 'vis-network/standalone';
	import type { VisNode, VisEdge } from './types';

	type Props = {
		nodes: VisNode[];
		edges: VisEdge[];
		options?: Options;
		className?: string;
		onClick?: () => void;
		onContextMenu?: (detail: { x: number; y: number; nodeId?: IdType }) => void;
	};

	type NetworkEvent = {
		pointer: { DOM: Position };
		event?: {
			preventDefault: () => void;
		};
	};

	let { nodes, edges, options = {}, className = '', onClick, onContextMenu }: Props = $props();

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

		const handleClick = () => {
			showTooltip();
			onClick?.();
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

		let resizeTimeout: ReturnType<typeof setTimeout>;

		const observer = new ResizeObserver(() => (resizeTimeout = setTimeout(() => network?.fit())));

		observer.observe(container);

		return () => {
			clearTimeout(resizeTimeout);
			observer.disconnect();
			network?.off('click', handleClick);
			network?.off('oncontext', handleContext);
			network?.destroy();
			network = null;
			nodesDataSet = null;
			edgesDataSet = null;
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
