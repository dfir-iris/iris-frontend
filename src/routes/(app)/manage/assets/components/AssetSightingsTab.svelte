<!--
  Where the asset has been seen.

  The list only ever contains cases the viewer can open and alerts
  belonging to customers they are a member of — the filtering happens in
  the SQL, so an empty list here means "nothing you can see", which is
  intentionally indistinguishable from "nothing at all".
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { ExternalLinkIcon } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import CompromiseStatusBadge from '$lib/components/ui/badge/compromise-status-badge.svelte';
	import { ManagedAssetsService } from '$lib/services/managed-assets.service';
	import { mediumDateTimeFormatter } from '$lib/utils/time-formatter';
	import type { ManagedAssetSighting, SightingKind } from '$lib/types/resources/managed-asset';

	type Props = { assetId: number };
	let { assetId }: Props = $props();

	const PER_PAGE = 25;

	let kind = $state<SightingKind | null>(null);
	let page = $state(1);
	let total = $state(0);
	let lastPage = $state(1);
	let rows = $state<ManagedAssetSighting[]>([]);
	let loading = $state(false);
	let error = $state<string | null>(null);

	const load = async () => {
		loading = true;
		error = null;
		try {
			const res = await ManagedAssetsService.sightings(assetId, {
				page,
				per_page: PER_PAGE,
				kind: kind ?? undefined
			});
			if (res.ok && res.data && typeof res.data !== 'string') {
				rows = res.data.data;
				total = res.data.total;
				lastPage = res.data.last_page ?? 1;
			} else {
				rows = [];
				error = res.error?.message ?? 'Failed to load sightings';
			}
		} finally {
			loading = false;
		}
	};

	const setKind = (next: SightingKind | null) => {
		kind = next;
		page = 1;
		void load();
	};

	const goToPage = (target: number) => {
		const clamped = Math.min(Math.max(1, target), lastPage || 1);
		if (clamped === page) return;
		page = clamped;
		void load();
	};

	const formatDate = (iso: string | null | undefined) => {
		if (!iso) return '—';
		const parsed = new Date(iso);
		return Number.isNaN(parsed.getTime()) ? iso : mediumDateTimeFormatter(parsed);
	};

	const href = (row: ManagedAssetSighting) =>
		row.kind === 'case' ? `/case/${row.reference_id}` : `/alerts/${row.reference_id}`;

	onMount(load);
</script>

<div class="flex flex-col gap-3">
	<div class="flex items-center justify-between gap-2 text-xs">
		<div class="flex items-center gap-1.5">
			<span class="text-muted-foreground">Show:</span>
			{#each [{ label: 'All', value: null }, { label: 'Cases', value: 'case' }, { label: 'Alerts', value: 'alert' }] as choice (String(choice.value))}
				{@const active = kind === choice.value}
				<button
					type="button"
					aria-pressed={active}
					onclick={() => setKind(choice.value as SightingKind | null)}
					class="rounded-md border px-2 py-1 transition-colors {active
						? 'border-primary/40 bg-primary/10 text-foreground'
						: 'border-border bg-card text-muted-foreground hover:bg-muted/50'}"
				>
					{choice.label}
				</button>
			{/each}
		</div>
		<span class="tabular-nums text-muted-foreground">{total} visible</span>
	</div>

	{#if loading && rows.length === 0}
		<div class="space-y-2">
			{#each [1, 2, 3, 4] as n (n)}
				<Skeleton class="h-9 w-full" />
			{/each}
		</div>
	{:else if error}
		<p class="py-6 text-center text-xs text-destructive">{error}</p>
	{:else if rows.length === 0}
		<p class="py-6 text-center text-xs text-muted-foreground">No sightings you have access to.</p>
	{:else}
		<ul class="flex flex-col gap-2">
			{#each rows as row (`${row.kind}-${row.observation_id}`)}
				<li class="rounded-md border p-3">
					<div class="flex items-start justify-between gap-3">
						<div class="min-w-0">
							<div class="flex items-center gap-2">
								<span
									class="rounded border border-border bg-muted px-1.5 py-0.5 text-2xs uppercase tracking-wide text-muted-foreground"
								>
									{row.kind}
								</span>
								<a
									href={href(row)}
									class="truncate text-xs text-primary hover:underline"
									title={row.reference_name ?? undefined}
								>
									{row.reference_name ?? `#${row.reference_id}`}
									<ExternalLinkIcon size={11} class="inline" />
								</a>
							</div>
							{#if row.observation_description}
								<p class="mt-1 line-clamp-2 text-2xs text-muted-foreground">
									{row.observation_description}
								</p>
							{/if}
							{#if row.observation_tags}
								<p class="mt-1 text-2xs text-muted-foreground">{row.observation_tags}</p>
							{/if}
						</div>
						<div class="flex shrink-0 flex-col items-end gap-1">
							<CompromiseStatusBadge status_id={row.compromise_status_id ?? 3} />
							<span class="text-2xs tabular-nums text-muted-foreground">
								{formatDate(row.seen_at)}
							</span>
						</div>
					</div>
				</li>
			{/each}
		</ul>

		{#if lastPage > 1}
			<div class="flex items-center justify-end gap-2 text-xs">
				<Button
					variant="outline"
					size="sm"
					class="h-7 px-2"
					disabled={loading || page <= 1}
					onclick={() => goToPage(page - 1)}
				>
					Previous
				</Button>
				<span class="tabular-nums text-muted-foreground">Page {page} / {lastPage}</span>
				<Button
					variant="outline"
					size="sm"
					class="h-7 px-2"
					disabled={loading || page >= lastPage}
					onclick={() => goToPage(page + 1)}
				>
					Next
				</Button>
			</div>
		{/if}
	{/if}
</div>
