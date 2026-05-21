<script lang="ts">
	import 'vis-timeline/styles/vis-timeline-graph2d.min.css';

	import { onMount } from 'svelte';
	import { DataSet } from 'vis-data';
	import { Timeline, type TimelineOptions } from 'vis-timeline';

	export type VisTimelineItem = {
		id: string;
		group?: string;
		start: string;
		content: string;
		title?: string;
		style?: string;
	};

	export type VisTimelineGroup = {
		id: string;
		content: string;
	};

	type Props = {
		items: VisTimelineItem[];
		groups?: VisTimelineGroup[];
		options?: TimelineOptions;
		className?: string;
	};

	let { items, groups = [], options = {}, className = '' }: Props = $props();

	let container = $state<HTMLDivElement | null>(null);
	let timeline = $state<Timeline | null>(null);
	let itemsDataSet = $state<DataSet<VisTimelineItem> | null>(null);

	onMount(() => {
		if (!container) return;

		itemsDataSet = new DataSet<VisTimelineItem>(items);

		if (groups.length > 0) {
			timeline = new Timeline(
				container,
				itemsDataSet,
				new DataSet<VisTimelineGroup>(groups),
				options
			);
		} else {
			timeline = new Timeline(container, itemsDataSet, options);
		}

		requestAnimationFrame(() => timeline?.fit());

		return () => {
			timeline?.destroy();
			timeline = null;
			itemsDataSet = null;
		};
	});

	$effect(() => {
		if (!itemsDataSet || !timeline) return;

		itemsDataSet.clear();
		itemsDataSet.add(items);

		timeline.setOptions(options);

		requestAnimationFrame(() => timeline?.fit());
	});
</script>

<div bind:this={container} class={className}></div>
