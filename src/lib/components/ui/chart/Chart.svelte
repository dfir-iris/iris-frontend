<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';

	export interface ChartProps {
		type: 'bar' | 'line' | 'pie';
		labels: string[];
		datasets: Array<{ label: string; data: number[] }>;
		height?: number;
	}

	let { type, labels, datasets, height = 320 }: ChartProps = $props();

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
			return {
				tooltip: { trigger: 'item' },
				legend: {
					type: 'scroll',
					orient: 'vertical',
					right: 0,
					top: 'middle',
					textStyle: { fontSize: 11 }
				},
				series: [
					{
						type: 'pie',
						radius: ['45%', '70%'],
						center: ['38%', '50%'],
						avoidLabelOverlap: true,
						data,
						label: { show: true, formatter: '{b}: {c}' }
					}
				]
			};
		}

		const showLegend = datasets.length > 1;
		return {
			tooltip: { trigger: 'axis' },
			legend: showLegend
				? { type: 'scroll', bottom: 0, textStyle: { fontSize: 11 } }
				: { show: false },
			grid: { left: 40, right: 16, top: 16, bottom: showLegend ? 40 : 24, containLabel: true },
			xAxis: {
				type: 'category',
				data: labels,
				axisLabel: { interval: 0, rotate: labels.length > 6 ? 30 : 0, fontSize: 11 }
			},
			yAxis: { type: 'value' },
			series: datasets.map((d) => ({ name: d.label, type, data: d.data, smooth: type === 'line' }))
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
