<!--
  Dashboard editor. Schema-driven: the column picker, operator picker and
  chart-type picker pull their options from /custom-dashboards/schema, so
  adding a new aggregation or chart type on the backend surfaces here
  automatically. System dashboards short-circuit back to view-mode.
-->
<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { ArrowLeftIcon, SaveIcon, Trash2Icon } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import {
		Card,
		CardContent,
		CardDescription,
		CardHeader,
		CardTitle
	} from '$lib/components/ui/card';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import {
		CustomDashboardsService,
		type CustomDashboard,
		type DashboardSchema,
		type DashboardWidget
	} from '$lib/services/custom-dashboards.service';

	let dashboard: CustomDashboard | null = $state(null);
	let schema: DashboardSchema | null = $state(null);
	let definitionText = $state('');
	let saving = $state(false);
	let error: string | null = $state(null);
	let success: string | null = $state(null);

	const uuid = $derived(page.params.uuid);

	async function load() {
		const detail = await CustomDashboardsService.get(uuid);
		if (!detail.ok || !detail.data) {
			error = detail.error?.message ?? 'Failed to load dashboard.';
			return;
		}
		dashboard = detail.data;
		if (dashboard.is_system) {
			goto(`/dashboards/${uuid}`);
			return;
		}
		definitionText = JSON.stringify(dashboard.definition, null, 2);

		const schemaResp = await CustomDashboardsService.getSchema();
		if (schemaResp.ok && schemaResp.data) schema = schemaResp.data;
	}

	async function save() {
		if (!dashboard) return;
		saving = true;
		error = null;
		success = null;
		let parsed: Record<string, unknown>;
		try {
			parsed = JSON.parse(definitionText);
		} catch (e) {
			error = `Invalid JSON: ${(e as Error).message}`;
			saving = false;
			return;
		}
		const response = await CustomDashboardsService.update(uuid, parsed);
		if (response.ok) {
			success = 'Saved.';
		} else {
			error = response.error?.message ?? 'Failed to save dashboard.';
		}
		saving = false;
	}

	function appendWidget(widget: DashboardWidget) {
		try {
			const parsed = JSON.parse(definitionText);
			parsed.widgets = parsed.widgets ?? [];
			parsed.widgets.push(widget);
			definitionText = JSON.stringify(parsed, null, 2);
		} catch (e) {
			error = `Cannot insert widget — invalid JSON: ${(e as Error).message}`;
		}
	}

	function appendComputedWidget(name: string, label: string) {
		appendWidget({
			name: label,
			chart_type: 'number',
			fields: [{ table: 'computed', column: name, alias: name }]
		});
	}

	$effect(() => {
		if (uuid) load();
	});
</script>

<div class="mx-auto flex w-full max-w-7xl flex-col gap-4 p-6">
	<header class="flex items-end justify-between">
		<div class="flex flex-col gap-1">
			<a href={`/dashboards/${uuid}`} class="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
				<ArrowLeftIcon class="size-3" /> Back to dashboard
			</a>
			<h1 class="text-2xl font-semibold">Edit dashboard</h1>
		</div>
		<Button onclick={save} disabled={saving}>
			<SaveIcon class="size-4" />
			{saving ? 'Saving…' : 'Save'}
		</Button>
	</header>

	{#if error}
		<div class="rounded border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
	{/if}
	{#if success}
		<div class="rounded border border-green-500/40 bg-green-500/10 p-3 text-sm text-green-700">{success}</div>
	{/if}

	<div class="grid grid-cols-1 gap-4 lg:grid-cols-3">
		<Card class="lg:col-span-2">
			<CardHeader>
				<CardTitle>Definition</CardTitle>
				<CardDescription>Edit the JSON definition. Save validates against the backend schema.</CardDescription>
			</CardHeader>
			<CardContent>
				<textarea
					class="w-full rounded border bg-background p-3 font-mono text-xs"
					rows="32"
					bind:value={definitionText}
				></textarea>
			</CardContent>
		</Card>

		<Card>
			<CardHeader>
				<CardTitle>Schema reference</CardTitle>
				<CardDescription>Whitelisted tables, columns, named aggregations and chart types.</CardDescription>
			</CardHeader>
			<CardContent class="flex flex-col gap-3 text-xs">
				{#if schema}
					<div>
						<div class="mb-1 font-semibold uppercase tracking-wider text-muted-foreground">Computed</div>
						<ul class="flex flex-col gap-1">
							{#each schema.named_aggregations as agg (agg.name)}
								<li>
									<button
										type="button"
										class="text-left text-primary underline-offset-4 hover:underline"
										onclick={() => appendComputedWidget(agg.name, agg.label)}
									>
										+ {agg.label}
									</button>
								</li>
							{/each}
						</ul>
					</div>
					<div>
						<div class="mb-1 font-semibold uppercase tracking-wider text-muted-foreground">Tables</div>
						<ul class="flex flex-col gap-1">
							{#each schema.tables as table (table)}
								<li>
									<details>
										<summary class="cursor-pointer">{table}</summary>
										<ul class="ml-3 mt-1 flex flex-col gap-0.5 text-muted-foreground">
											{#each schema.columns[table] ?? [] as col (col)}
												<li>{col}</li>
											{/each}
										</ul>
									</details>
								</li>
							{/each}
						</ul>
					</div>
					<div>
						<div class="mb-1 font-semibold uppercase tracking-wider text-muted-foreground">Chart types</div>
						<div>{schema.chart_types.join(', ')}</div>
					</div>
					<div>
						<div class="mb-1 font-semibold uppercase tracking-wider text-muted-foreground">Aggregations</div>
						<div>{schema.aggregations.join(', ')}</div>
					</div>
					<div>
						<div class="mb-1 font-semibold uppercase tracking-wider text-muted-foreground">Operators</div>
						<div>{schema.operators.join(', ')}</div>
					</div>
				{:else}
					<p class="text-muted-foreground">Loading schema…</p>
				{/if}
			</CardContent>
		</Card>
	</div>
</div>
