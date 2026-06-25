<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';

	export interface ChartProps {
		type: 'bar' | 'line' | 'pie' | 'timechart';
		labels: string[];
		datasets: Array<{ label: string; data: number[] }>;
		height?: number;
		color?: string;
		palette?: string[];
	}

	let { type: typeProp, labels, datasets, height = 320, color, palette }: ChartProps = $props();
	// Backend's "timechart" is just a line chart with a time x-axis;
	// echarts only knows 'line', so map here.
	const type = $derived(typeProp === 'timechart' ? 'line' : typeProp);
	// Resolved color palette: explicit `palette` wins; otherwise the
	// single-series `color` becomes a one-element palette; else echarts
	// default. Filter blanks so a stray comma doesn't poison the list.
	const resolvedPalette = $derived.by(() => {
		if (Array.isArray(palette) && palette.length > 0) {
			return palette.map((c) => c.trim()).filter(Boolean);
		}
		if (color && color.trim()) return [color.trim()];
		return undefined;
	});

	let container: HTMLDivElement | undefined = $state();
	let instance: unknown = $state(undefined);

	// Legend in ECharts grows downward unbounded by default. For pies with
	// many slices and bars with many categories we cap it to a scrollable
	// strip on the right (pie) or hide it entirely (bar/line with one
	// series — the x-axis already labels everything).
	const option = $derived.by(() => {
		if (type === 'pie') {
			const data = labels.map((label, idx) => ({
				name: label,
				value: datasets[0]?.data?.[idx] ?? 0
			}));
			// High-cardinality pies (many slices) drown in external labels
			// and side-legends. Switch to a horizontal scrollable bottom
			// legend, hide slice labels past ~8 slices, and use tooltip
			// for the detail. Threshold matches what fits in one row of
			// the bottom legend without overflowing the card.
			const dense = data.length > 8;
			return {
				...(resolvedPalette ? { color: resolvedPalette } : {}),
				tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
				legend: {
					type: 'scroll',
					orient: 'horizontal',
					bottom: 0,
					left: 'center',
					width: '90%',
					textStyle: { fontSize: 11 }
				},
				series: [
					{
						type: 'pie',
						radius: ['45%', '70%'],
						center: ['50%', '42%'],
						avoidLabelOverlap: true,
						data,
						label: dense
							? { show: false }
							: { show: true, formatter: '{b}: {c}', fontSize: 11 },
						labelLine: { show: !dense }
					}
				]
			};
		}

		const showLegend = datasets.length > 1;
		const dense = labels.length > 30;
		// For dense category axes (time-bucket charts often hit hundreds of
		// labels) let echarts auto-decimate so we don't paint thousands of
		// overlapping tick labels and reduce the chart to a gray bar.
		const xAxisLabel = dense
			? {
				hideOverlap: true,
				rotate: 30,
				fontSize: 10,
			}
			: {
				interval: 0,
				rotate: labels.length > 6 ? 30 : 0,
				fontSize: 11,
			};
		return {
			...(resolvedPalette ? { color: resolvedPalette } : {}),
			tooltip: { trigger: 'axis' },
			legend: showLegend
				? { type: 'scroll', bottom: 0, textStyle: { fontSize: 11 } }
				: { show: false },
			grid: { left: 40, right: 16, top: 16, bottom: showLegend ? 40 : 24, containLabel: true },
			xAxis: {
				type: 'category',
				data: labels,
				axisLabel: xAxisLabel,
			},
			yAxis: { type: 'value' },
			series: datasets.map((d) => ({
				name: d.label,
				type,
				data: d.data,
				smooth: type === 'line',
				showSymbol: !dense,
			})),
		};
	});

	onMount(() => {
		if (!browser || !container) return;
		let alive = true;
		(async () => {
			const echarts = await import('echarts');
			if (!alive || !container) return;
			instance = echarts.init(container);
			(instance as { setOption: (o: unknown) => void }).setOption(option);
		})();
		const resize = () => {
			(instance as { resize?: () => void } | undefined)?.resize?.();
		};
		window.addEventListener('resize', resize);
		return () => {
			alive = false;
			window.removeEventListener('resize', resize);
			(instance as { dispose?: () => void } | undefined)?.dispose?.();
			instance = undefined;
		};
	});

	$effect(() => {
		const inst = instance as { setOption: (o: unknown) => void } | undefined;
		if (inst) inst.setOption(option);
	});
</script>

<div bind:this={container} style="height: {height}px; width: 100%;"></div>
