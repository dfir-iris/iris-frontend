<script lang="ts">
	import { onMount } from 'svelte';
	import { Network } from 'vis-network';
	import { DataSet } from 'vis-data';
	import type { Options } from 'vis-network';

	type Node = Record<string, unknown>;
	type Edge = Record<string, unknown>;

	type Props = {
		nodes: Node[];
		edges: Edge[];
		options?: Options;
		className?: string;
	};

	let { nodes, edges, options = {}, className = '' }: Props = $props();

	let container = $state<HTMLDivElement | null>(null);
	let network = $state<Network | null>(null);
	let nodesDataSet = $state<DataSet<Node> | null>(null);
	let edgesDataSet = $state<DataSet<Edge> | null>(null);

	onMount(() => {
		if (!container) return;

		nodesDataSet = new DataSet<Node>(nodes);
		edgesDataSet = new DataSet<Edge>(edges);

		network = new Network(
			container,
			{
				nodes: nodesDataSet,
				edges: edgesDataSet
			},
			options
		);

		let resizeTimeout: ReturnType<typeof setTimeout>;

		const observer = new ResizeObserver(() => (resizeTimeout = setTimeout(() => network?.fit())));

		observer.observe(container);

		return () => {
			clearTimeout(resizeTimeout);
			observer.disconnect();
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
	});
</script>

<div bind:this={container} class={className}></div>
