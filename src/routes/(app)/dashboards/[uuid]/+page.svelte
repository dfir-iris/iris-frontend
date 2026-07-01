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
	import { Chart, WidgetTable } from '$lib/components/ui/chart';
	import {
		CustomDashboardsService,
		safeCssColor,
		safeCssPalette,
		type CustomDashboard,
		type RenderedSection,
		type RenderedWidget
	} from '$lib/services/custom-dashboards.service';

	let dashboard: CustomDashboard | null = $state(null);
	let widgets: RenderedWidget[] = $state([]);
	let renderedSections: RenderedSection[] = $state([]);
	let loading = $state(true);
	let error: string | null = $state(null);

	let filterStart = $state('');
	let filterEnd = $state('');

	const uuid = $derived(page.params.uuid);

	// Preset time ranges mirror the old jQuery UI's quick-pick chips.
	// Each preset writes both start and end as ISO datetime-local strings
	// (YYYY-MM-DDTHH:mm) so the existing Input bindings pick them up and
	// the backend receives them verbatim through the render endpoint.
	const TIME_PRESETS = [
		{ label: 'Last 15 minutes', minutes: 15 },
		{ label: 'Last hour', minutes: 60 },
		{ label: 'Last 12 hours', minutes: 60 * 12 },
		{ label: 'Last 7 days', minutes: 60 * 24 * 7 },
		{ label: 'Last 30 days', minutes: 60 * 24 * 30 },
		{ label: 'Last 90 days', minutes: 60 * 24 * 90 },
		{ label: 'Last 6 months', minutes: 60 * 24 * 182 },
		{ label: 'Last 1 year', minutes: 60 * 24 * 365 },
		{ label: 'Last 2 years', minutes: 60 * 24 * 365 * 2 },
		{ label: 'Last 5 years', minutes: 60 * 24 * 365 * 5 },
	] as const;

	function toLocalInputString(d: Date): string {
		const pad = (n: number) => String(n).padStart(2, '0');
		return (
			`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
			`T${pad(d.getHours())}:${pad(d.getMinutes())}`
		);
	}

	function applyPreset(minutes: number) {
		const end = new Date();
		const start = new Date(end.getTime() - minutes * 60 * 1000);
		filterStart = toLocalInputString(start);
		filterEnd = toLocalInputString(end);
		render();
	}

	function resetFilters() {
		filterStart = '';
		filterEnd = '';
		render();
	}

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
			renderedSections = response.data.sections ?? [];
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

	function widgetColor(widget: RenderedWidget): string | undefined {
		return safeCssColor((widget.options as Record<string, unknown> | undefined)?.color);
	}

	function widgetPalette(widget: RenderedWidget): string[] | undefined {
		return safeCssPalette((widget.options as Record<string, unknown> | undefined)?.palette);
	}

	function resolveKpiColor(widget: RenderedWidget): string | undefined {
		const base = widgetColor(widget);
		const numeric = typeof widget.value === 'number' ? widget.value : null;
		const thresholds = (widget.options as Record<string, unknown> | undefined)?.thresholds;
		if (numeric === null || !Array.isArray(thresholds)) return base;
		for (const raw of thresholds) {
			if (typeof raw !== 'object' || raw === null) continue;
			const t = raw as { op?: string; value?: number | string; color?: unknown };
			const cmpValue = typeof t.value === 'number' ? t.value : Number(t.value);
			const validatedColor = safeCssColor(t.color);
			if (!Number.isFinite(cmpValue) || !validatedColor) continue;
			const hit =
				(t.op === 'gte' && numeric >= cmpValue) ||
				(t.op === 'gt' && numeric > cmpValue) ||
				(t.op === 'lte' && numeric <= cmpValue) ||
				(t.op === 'lt' && numeric < cmpValue) ||
				(t.op === 'eq' && numeric === cmpValue);
			if (hit) return validatedColor;
		}
		return base;
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

<svelte:head>
	<title>{dashboard?.name ?? 'Dashboard'}</title>
</svelte:head>

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
		<CardContent class="flex flex-col gap-3">
			<div class="flex flex-wrap items-end gap-3">
				<div class="flex flex-col gap-1">
					<Label for="start">Start</Label>
					<Input id="start" type="datetime-local" bind:value={filterStart} />
				</div>
				<div class="flex flex-col gap-1">
					<Label for="end">End</Label>
					<Input id="end" type="datetime-local" bind:value={filterEnd} />
				</div>
				<Button onclick={render}>Apply</Button>
				<Button variant="outline" onclick={resetFilters}>Reset</Button>
			</div>
			<div class="flex flex-col gap-1">
				<span class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
					Preset ranges
				</span>
				<div class="flex flex-wrap gap-1.5">
					{#each TIME_PRESETS as preset (preset.label)}
						<button
							type="button"
							class="rounded-full border border-primary/30 bg-primary/5 px-3 py-1 text-xs text-primary transition hover:bg-primary/10"
							onclick={() => applyPreset(preset.minutes)}
						>
							{preset.label}
						</button>
					{/each}
				</div>
			</div>
		</CardContent>
	</Card>

	{#if error}
		<div class="rounded border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
			{error}
		</div>
	{/if}

	{#snippet widgetCard(widget: RenderedWidget)}
		{#if widget.chart_type === 'number' || widget.chart_type === 'percentage'}
			{@const kpiColor = resolveKpiColor(widget)}
			<Card class={sizeClass(widget)}>
				<CardHeader class="pb-1">
					<CardTitle class="text-sm font-medium text-muted-foreground">
						{widget.name}
					</CardTitle>
				</CardHeader>
				<CardContent
					class="text-2xl font-semibold"
					style={kpiColor ? `color: ${kpiColor};` : ''}
				>
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
		{:else if widget.chart_type === 'table'}
			<Card class={sizeClass(widget)}>
				<CardHeader>
					<CardTitle>{widget.name}</CardTitle>
				</CardHeader>
				<CardContent class="max-h-[480px] overflow-auto">
					<WidgetTable
						groupHeaders={widget.group_headers}
						valueHeaders={widget.value_headers}
						groupKeys={widget.group_keys}
						valueKeys={widget.value_keys}
						rows={widget.rows as never}
						totals={widget.totals}
						totalLabel={widget.total_label}
						defaultSort={((widget.options ?? {}) as Record<string, unknown>).default_sort as never}
					/>
				</CardContent>
			</Card>
		{:else}
			<Card class={sizeClass(widget)}>
				<CardHeader>
					<CardTitle>{widget.name}</CardTitle>
				</CardHeader>
				<CardContent>
					<Chart
						type={(widget.chart_type as 'bar' | 'line' | 'pie' | 'timechart') ?? 'bar'}
						labels={widget.labels ?? widget.display_labels ?? []}
						datasets={widget.datasets ?? []}
						color={widgetColor(widget)}
						palette={widgetPalette(widget)}
					/>
				</CardContent>
			</Card>
		{/if}
	{/snippet}

	{#if loading}
		<p class="text-sm text-muted-foreground">Loading…</p>
	{:else if renderedSections.length > 0}
		{#each renderedSections as section, sIdx (section.id ?? sIdx)}
			<section class="flex flex-col gap-3">
				{#if section.title || section.description}
					<header class={`flex flex-col gap-0.5 ${section.show_divider && sIdx > 0 ? 'border-t pt-4' : ''}`}>
						{#if section.title}
							<h2 class="text-lg font-semibold">{section.title}</h2>
						{/if}
						{#if section.description}
							<p class="text-xs text-muted-foreground">{section.description}</p>
						{/if}
					</header>
				{:else if section.show_divider && sIdx > 0}
					<hr class="border-t" />
				{/if}
				<div class="grid grid-cols-1 gap-4 md:grid-cols-6 lg:grid-cols-12">
					{#each section.widgets as widget, wIdx (wIdx)}
						{@render widgetCard(widget)}
					{/each}
				</div>
			</section>
		{/each}
	{:else}
		<div class="grid grid-cols-1 gap-4 md:grid-cols-6 lg:grid-cols-12">
			{#each widgets as widget, idx (idx)}
				{@render widgetCard(widget)}
			{/each}
		</div>
	{/if}
</div>
