<!--
  Live preview pane. Debounced render of the current draft definition
  against /api/v2/custom-dashboards/<uuid>/render. Read-only: drop is
  disabled, no editor controls in the preview cards. Collapses cleanly
  so it doesn't eat editor screen space when not needed.
-->
<script lang="ts">
	import { ChevronDownIcon, ChevronUpIcon, RefreshCwIcon } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card';
	import { Chart, WidgetTable } from '$lib/components/ui/chart';
	import {
		CustomDashboardsService,
		type DashboardDefinition,
		type RenderedSection,
		type RenderedWidget
	} from '$lib/services/custom-dashboards.service';

	type Props = {
		uuid: string;
		definition: DashboardDefinition;
		expanded?: boolean;
		onExpandedChange?: (next: boolean) => void;
	};

	let { uuid, definition, expanded = $bindable(true), onExpandedChange }: Props = $props();

	let widgets: RenderedWidget[] = $state([]);
	let sections: RenderedSection[] = $state([]);
	let loading = $state(false);
	let error: string | null = $state(null);
	let lastRenderedAt: string | null = $state(null);
	let renderTimer: ReturnType<typeof setTimeout> | null = null;

	// Trigger debounced render whenever the definition changes (or the
	// pane is opened).
	$effect(() => {
		void definition; // create dep
		if (!expanded) return;
		if (renderTimer) clearTimeout(renderTimer);
		renderTimer = setTimeout(() => {
			void renderNow();
		}, 600);
	});

	async function renderNow() {
		loading = true;
		error = null;
		try {
			const response = await CustomDashboardsService.render(uuid, { definition });
			if (response.ok && response.data) {
				widgets = response.data.widgets ?? [];
				sections = response.data.sections ?? [];
				lastRenderedAt = new Date().toLocaleTimeString();
			} else {
				error = response.error?.message ?? 'Render failed.';
			}
		} catch (e) {
			error = (e as Error).message;
		}
		loading = false;
	}

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

	function widgetColor(widget: RenderedWidget): string | undefined {
		const c = (widget.options as Record<string, unknown> | undefined)?.color;
		return typeof c === 'string' && c.trim() ? c.trim() : undefined;
	}

	function widgetPalette(widget: RenderedWidget): string[] | undefined {
		const p = (widget.options as Record<string, unknown> | undefined)?.palette;
		if (Array.isArray(p)) return p.map((x) => String(x)).filter(Boolean);
		if (typeof p === 'string' && p.trim()) {
			return p.split(',').map((s) => s.trim()).filter(Boolean);
		}
		return undefined;
	}

	function resolveKpiColor(widget: RenderedWidget): string | undefined {
		const base = widgetColor(widget);
		const numeric = typeof widget.value === 'number' ? widget.value : null;
		const thresholds = (widget.options as Record<string, unknown> | undefined)?.thresholds;
		if (numeric === null || !Array.isArray(thresholds)) return base;
		for (const raw of thresholds) {
			if (typeof raw !== 'object' || raw === null) continue;
			const t = raw as { op?: string; value?: number | string; color?: string };
			const cmpValue = typeof t.value === 'number' ? t.value : Number(t.value);
			if (!Number.isFinite(cmpValue) || typeof t.color !== 'string') continue;
			const hit =
				(t.op === 'gte' && numeric >= cmpValue) ||
				(t.op === 'gt' && numeric > cmpValue) ||
				(t.op === 'lte' && numeric <= cmpValue) ||
				(t.op === 'lt' && numeric < cmpValue) ||
				(t.op === 'eq' && numeric === cmpValue);
			if (hit) return t.color;
		}
		return base;
	}

	function toggle() {
		const next = !expanded;
		expanded = next;
		onExpandedChange?.(next);
	}
</script>

<Card>
	<CardHeader class="flex flex-row items-center justify-between gap-2">
		<CardTitle class="text-base">Live preview</CardTitle>
		<div class="flex items-center gap-2 text-xs text-muted-foreground">
			{#if expanded}
				{#if loading}
					<span class="flex items-center gap-1"><RefreshCwIcon class="size-3 animate-spin" /> rendering…</span>
				{:else if lastRenderedAt}
					<span>last rendered {lastRenderedAt}</span>
				{/if}
				<Button variant="ghost" size="icon" onclick={renderNow} title="Render now">
					<RefreshCwIcon class="size-4" />
				</Button>
			{/if}
			<Button variant="ghost" size="icon" onclick={toggle} title={expanded ? 'Collapse' : 'Expand'}>
				{#if expanded}
					<ChevronUpIcon class="size-4" />
				{:else}
					<ChevronDownIcon class="size-4" />
				{/if}
			</Button>
		</div>
	</CardHeader>
	{#if expanded}
		<CardContent class="flex flex-col gap-4">
			{#if error}
				<div class="rounded border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
					{error}
				</div>
			{/if}

			{#snippet widgetCard(widget: RenderedWidget)}
				{#if widget.chart_type === 'number' || widget.chart_type === 'percentage'}
					{@const kpiColor = resolveKpiColor(widget)}
					<Card class={`border-muted ${sizeClass(widget)}`}>
						<CardHeader class="pb-1">
							<CardTitle class="text-xs font-medium text-muted-foreground">{widget.name}</CardTitle>
						</CardHeader>
						<CardContent class="text-xl font-semibold" style={kpiColor ? `color: ${kpiColor};` : ''}>
							{widget.error ? '—' : formatValue(widget)}
						</CardContent>
					</Card>
				{:else if widget.error}
					<Card class={`border-muted ${sizeClass(widget)}`}>
						<CardHeader><CardTitle class="text-sm">{widget.name}</CardTitle></CardHeader>
						<CardContent class="text-xs text-destructive">{widget.error}</CardContent>
					</Card>
				{:else if widget.chart_type === 'table'}
					<Card class={`border-muted ${sizeClass(widget)}`}>
						<CardHeader><CardTitle class="text-sm">{widget.name}</CardTitle></CardHeader>
						<CardContent class="max-h-[280px] overflow-auto">
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
					<Card class={`border-muted ${sizeClass(widget)}`}>
						<CardHeader><CardTitle class="text-sm">{widget.name}</CardTitle></CardHeader>
						<CardContent>
							<Chart
								type={(widget.chart_type as 'bar' | 'line' | 'pie' | 'timechart') ?? 'bar'}
								labels={widget.labels ?? widget.display_labels ?? []}
								datasets={widget.datasets ?? []}
								height={220}
								color={widgetColor(widget)}
								palette={widgetPalette(widget)}
							/>
						</CardContent>
					</Card>
				{/if}
			{/snippet}

			{#if sections.length > 0}
				{#each sections as section, sIdx (section.id ?? sIdx)}
					<section class="flex flex-col gap-2">
						{#if section.title}
							<h3 class="text-sm font-semibold text-muted-foreground">{section.title}</h3>
						{/if}
						<div class="grid grid-cols-1 gap-3 md:grid-cols-6 lg:grid-cols-12">
							{#each section.widgets as widget, wIdx (wIdx)}
								{@render widgetCard(widget)}
							{/each}
						</div>
					</section>
				{/each}
			{:else if widgets.length > 0}
				<div class="grid grid-cols-1 gap-3 md:grid-cols-6 lg:grid-cols-12">
					{#each widgets as widget, idx (idx)}
						{@render widgetCard(widget)}
					{/each}
				</div>
			{:else if !loading}
				<p class="text-sm text-muted-foreground">No widgets to render.</p>
			{/if}
		</CardContent>
	{/if}
</Card>
