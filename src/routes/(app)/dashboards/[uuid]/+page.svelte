<!--
  Dashboard view. Loads the dashboard definition, posts /render with the
  filter bar values, and lays the returned widgets out into ECharts /
  KPI tiles. System dashboards hide the Edit button.
-->
<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { Edit2Icon, ArrowLeftIcon } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Chart } from '$lib/components/ui/chart';
	import {
		CustomDashboardsService,
		type CustomDashboard,
		type RenderedWidget
	} from '$lib/services/custom-dashboards.service';

	let dashboard: CustomDashboard | null = $state(null);
	let widgets: RenderedWidget[] = $state([]);
	let loading = $state(true);
	let error: string | null = $state(null);

	let filterStart = $state('');
	let filterEnd = $state('');

	const uuid = $derived(page.params.uuid);

	async function load() {
		loading = true;
		error = null;
		const detail = await CustomDashboardsService.get(uuid);
		if (!detail.ok || !detail.data) {
			error = detail.error?.message ?? 'Failed to load dashboard.';
			loading = false;
			return;
		}
		dashboard = detail.data;
		await render();
		loading = false;
	}

	async function render() {
		if (!dashboard) return;
		const body = {
			definition: dashboard.definition,
			timeframe: {
				start: filterStart || undefined,
				end: filterEnd || undefined
			}
		};
		const response = await CustomDashboardsService.render(uuid, body);
		if (response.ok && response.data) {
			widgets = response.data.widgets;
		} else {
			error = response.error?.message ?? 'Failed to render dashboard.';
		}
	}

	// Map the widget's persisted size hint to a Tailwind col-span class. The
	// view-page grid is 12 columns at lg and 6 at md so the same size hints
	// degrade reasonably on smaller screens.
	function sizeClass(widget: RenderedWidget): string {
		const layout = (widget.layout ?? {}) as Record<string, unknown>;
		const size = String(layout.widget_size ?? '').toLowerCase();
		if (size === 'full') return 'md:col-span-6 lg:col-span-12';
		if (size === 'half') return 'md:col-span-3 lg:col-span-6';
		if (size === 'third') return 'md:col-span-2 lg:col-span-4';
		if (size === 'kpi' || size === 'quarter') return 'md:col-span-2 lg:col-span-3';
		if (widget.chart_type === 'number' || widget.chart_type === 'percentage') return 'md:col-span-2 lg:col-span-3';
		return 'md:col-span-3 lg:col-span-6';
	}

	function formatValue(widget: RenderedWidget): string {
		if (widget.formatted_value) return widget.formatted_value;
		const v = widget.value;
		if (v === null || v === undefined) return '—';
		return typeof v === 'number' ? v.toLocaleString() : String(v);
	}

	$effect(() => {
		if (uuid) load();
	});
</script>

<div class="mx-auto flex w-full max-w-screen-2xl flex-col gap-6 p-6">
	<header class="flex items-end justify-between">
		<div class="flex flex-col gap-1">
			<a href="/dashboards" class="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
				<ArrowLeftIcon class="size-3" /> All dashboards
			</a>
			<h1 class="text-2xl font-semibold">{dashboard?.name ?? '…'}</h1>
			{#if dashboard?.description}
				<p class="text-sm text-muted-foreground">{dashboard.description}</p>
			{/if}
		</div>
		{#if dashboard && !dashboard.is_system}
			<Button variant="outline" onclick={() => goto(`/dashboards/${uuid}/edit`)}>
				<Edit2Icon class="size-4" />
				Edit
			</Button>
		{/if}
	</header>

	<Card>
		<CardHeader>
			<CardTitle class="text-sm">Filters</CardTitle>
		</CardHeader>
		<CardContent class="flex flex-wrap gap-3">
			<div>
				<Label for="start">Start</Label>
				<Input id="start" type="datetime-local" bind:value={filterStart} />
			</div>
			<div>
				<Label for="end">End</Label>
				<Input id="end" type="datetime-local" bind:value={filterEnd} />
			</div>
			<div class="flex items-end">
				<Button onclick={render}>Apply</Button>
			</div>
		</CardContent>
	</Card>

	{#if error}
		<div class="rounded border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
			{error}
		</div>
	{/if}

	{#if loading}
		<p class="text-sm text-muted-foreground">Loading…</p>
	{:else}
		<div class="grid grid-cols-1 gap-4 md:grid-cols-6 lg:grid-cols-12">
			{#each widgets as widget, idx (idx)}
				{#if widget.chart_type === 'number' || widget.chart_type === 'percentage'}
					<Card class={sizeClass(widget)}>
						<CardHeader class="pb-1">
							<CardTitle class="text-sm font-medium text-muted-foreground">
								{widget.name}
							</CardTitle>
						</CardHeader>
						<CardContent class="text-2xl font-semibold">
							{widget.error ? '—' : formatValue(widget)}
						</CardContent>
					</Card>
				{:else if widget.error}
					<Card class={sizeClass(widget)}>
						<CardHeader>
							<CardTitle>{widget.name}</CardTitle>
						</CardHeader>
						<CardContent class="text-sm text-destructive">{widget.error}</CardContent>
					</Card>
				{:else}
					<Card class={sizeClass(widget)}>
						<CardHeader>
							<CardTitle>{widget.name}</CardTitle>
						</CardHeader>
						<CardContent>
							<Chart
								type={(widget.chart_type as 'bar' | 'line' | 'pie') ?? 'bar'}
								labels={widget.labels ?? widget.display_labels ?? []}
								datasets={widget.datasets ?? []}
							/>
						</CardContent>
					</Card>
				{/if}
			{/each}
		</div>
	{/if}
</div>
