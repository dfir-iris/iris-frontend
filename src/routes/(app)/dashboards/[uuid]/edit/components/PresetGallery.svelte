<!--
  Preset gallery. Triggered from a section header. Lists widgets from
  /api/v2/custom-dashboards/presets; clicking one calls back with the
  preset definition so the parent appends a copy to the active section.
-->
<script lang="ts">
	import { LayersIcon } from 'lucide-svelte';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card';
	import { Badge } from '$lib/components/ui/badge';
	import {
		CustomDashboardsService,
		type DashboardWidget
	} from '$lib/services/custom-dashboards.service';

	type Props = {
		open: boolean;
		onPick: (widget: DashboardWidget) => void;
		onOpenChange: (open: boolean) => void;
	};

	let { open = $bindable(false), onPick, onOpenChange }: Props = $props();

	let presets: DashboardWidget[] = $state([]);
	let loading = $state(false);
	let error: string | null = $state(null);

	async function load() {
		if (presets.length > 0) return;
		loading = true;
		error = null;
		const response = await CustomDashboardsService.getPresets();
		if (response.ok && Array.isArray(response.data)) {
			presets = response.data;
		} else {
			error = response.error?.message ?? 'Failed to load presets.';
		}
		loading = false;
	}

	$effect(() => {
		if (open) load();
	});

	function pick(widget: DashboardWidget) {
		// Deep-copy so subsequent picks don't share state with this preset.
		onPick(structuredClone($state.snapshot(widget)) as DashboardWidget);
		onOpenChange(false);
	}
</script>

<Dialog.Root bind:open onOpenChange={(v) => onOpenChange(v)}>
	<Dialog.Content class="max-w-3xl">
		<Dialog.Header>
			<Dialog.Title>Insert from preset</Dialog.Title>
			<Dialog.Description>
				Backend-curated widget templates. Picking one appends a copy to the current section.
			</Dialog.Description>
		</Dialog.Header>

		{#if loading}
			<p class="text-sm text-muted-foreground">Loading…</p>
		{:else if error}
			<div class="rounded border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
				{error}
			</div>
		{:else if presets.length === 0}
			<p class="text-sm text-muted-foreground">No presets available.</p>
		{:else}
			<div class="grid max-h-[55vh] grid-cols-1 gap-3 overflow-y-auto pr-1 sm:grid-cols-2">
				{#each presets as preset, idx (idx)}
					<button
						type="button"
						class="text-left"
						onclick={() => pick(preset)}
					>
						<Card class="transition hover:border-primary">
							<CardHeader class="pb-1">
								<CardTitle class="flex items-center justify-between gap-2 text-sm">
									<span class="flex items-center gap-1 truncate">
										<LayersIcon class="size-3 shrink-0" />
										{preset.name}
									</span>
									<Badge variant="secondary">{preset.chart_type}</Badge>
								</CardTitle>
							</CardHeader>
							<CardContent class="flex flex-wrap gap-1 text-xs text-muted-foreground">
								{#each preset.fields ?? [] as f (f.alias ?? `${f.table}.${f.column}`)}
									<Badge variant="outline">
										{f.table}.{f.column}{f.aggregation ? ` · ${f.aggregation}` : ''}
									</Badge>
								{/each}
							</CardContent>
						</Card>
					</button>
				{/each}
			</div>
		{/if}

		<Dialog.Footer>
			<Button variant="outline" onclick={() => onOpenChange(false)}>Close</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
