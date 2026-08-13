<!--
  Case timeline events that reference the asset.

  Always case-scoped: alerts have no timeline. Like the sightings tab,
  the rows are already restricted to cases the viewer can open, so an
  empty list carries no information about what exists elsewhere.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { Button } from '$lib/components/ui/button';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { ManagedAssetsService } from '$lib/services/managed-assets.service';
	import { mediumDateTimeFormatter } from '$lib/utils/time-formatter';
	import type { ManagedAssetTimelineEntry } from '$lib/types/resources/managed-asset';

	type Props = { assetId: number };
	let { assetId }: Props = $props();

	const PER_PAGE = 25;

	let page = $state(1);
	let total = $state(0);
	let lastPage = $state(1);
	let rows = $state<ManagedAssetTimelineEntry[]>([]);
	let loading = $state(false);
	let error = $state<string | null>(null);

	const load = async () => {
		loading = true;
		error = null;
		try {
			const res = await ManagedAssetsService.timeline(assetId, { page, per_page: PER_PAGE });
			if (res.ok && res.data && typeof res.data !== 'string') {
				rows = res.data.data;
				total = res.data.total;
				lastPage = res.data.last_page ?? 1;
			} else {
				rows = [];
				error = res.error?.message ?? 'Failed to load the timeline';
			}
		} finally {
			loading = false;
		}
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

	// `event_color` is operator-supplied (it comes straight from the case
	// timeline), so it goes into an inline style rather than a class name
	// and is only used when it looks like a hex colour.
	const dotStyle = (color: string | null | undefined) =>
		color && /^#[0-9a-fA-F]{3,8}$/.test(color) ? `background-color: ${color}` : '';

	onMount(load);
</script>

<div class="flex flex-col gap-3">
	<p class="text-right text-xs tabular-nums text-muted-foreground">{total} visible event(s)</p>

	{#if loading && rows.length === 0}
		<div class="space-y-2">
			{#each [1, 2, 3, 4] as n (n)}
				<Skeleton class="h-12 w-full" />
			{/each}
		</div>
	{:else if error}
		<p class="py-6 text-center text-xs text-destructive">{error}</p>
	{:else if rows.length === 0}
		<p class="py-6 text-center text-xs text-muted-foreground">
			No timeline events you have access to.
		</p>
	{:else}
		<ol class="relative flex flex-col gap-4 border-l pl-4">
			{#each rows as event (event.event_id)}
				<li class="relative">
					<span
						class="absolute -left-[1.3125rem] top-1.5 h-2.5 w-2.5 rounded-full border border-background bg-primary"
						style={dotStyle(event.event_color)}
					></span>
					<div class="flex items-baseline justify-between gap-3">
						<span class="text-xs font-medium">{event.event_title ?? 'Untitled event'}</span>
						<span class="shrink-0 text-2xs tabular-nums text-muted-foreground">
							{formatDate(event.event_date)}
							{#if event.event_tz}<span class="ml-1">{event.event_tz}</span>{/if}
						</span>
					</div>
					{#if event.event_content}
						<p class="mt-1 whitespace-pre-wrap text-2xs text-muted-foreground">
							{event.event_content}
						</p>
					{/if}
					<div class="mt-1 flex items-center gap-2 text-2xs text-muted-foreground">
						<a href={`/case/${event.case_id}`} class="text-primary hover:underline">
							{event.case_name ?? `Case #${event.case_id}`}
						</a>
						{#if event.event_tags}
							<span>· {event.event_tags}</span>
						{/if}
					</div>
				</li>
			{/each}
		</ol>

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
