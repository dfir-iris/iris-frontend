<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';

	export interface ChartProps {
		type: 'bar' | 'line' | 'pie';
		labels: string[];
		datasets: Array<{ label: string; data: number[] }>;
		height?: number;
	}

	let { type, labels, datasets, height = 280 }: ChartProps = $props();

	let container: HTMLDivElement | undefined = $state();
	let instance: unknown = $state(undefined);

	const option = $derived.by(() => {
		if (type === 'pie') {
			const data = labels.map((label, idx) => ({
				name: label,
				value: datasets[0]?.data?.[idx] ?? 0
			}));
			return {
				tooltip: { trigger: 'item' },
				legend: { bottom: 0 },
				series: [
					{
						type: 'pie',
						radius: ['40%', '70%'],
						data,
						label: { show: true, formatter: '{b}: {c}' }
					}
				]
			};
		}
		return {
			tooltip: { trigger: 'axis' },
			legend: { bottom: 0, data: datasets.map((d) => d.label) },
			xAxis: { type: 'category', data: labels },
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
