<!--
  The change log for one asset.

  Append-only and complete: entries survive the deletion of both the
  asset and the acting user, which is why the backend keeps name and
  login snapshots alongside the foreign keys. Automatic registrations
  from cases and alerts are deliberately absent — they are the highest
  volume writes in the system and would bury the human trail; those are
  recorded in the activity log instead.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { Button } from '$lib/components/ui/button';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { ManagedAssetsService } from '$lib/services/managed-assets.service';
	import AssetAuditEntry from './AssetAuditEntry.svelte';
	import type { ManagedAssetAuditEntry } from '$lib/types/resources/managed-asset';

	type Props = { assetId: number };
	let { assetId }: Props = $props();

	const PER_PAGE = 25;

	let page = $state(1);
	let total = $state(0);
	let lastPage = $state(1);
	let rows = $state<ManagedAssetAuditEntry[]>([]);
	let loading = $state(false);
	let error = $state<string | null>(null);

	const load = async () => {
		loading = true;
		error = null;
		try {
			const res = await ManagedAssetsService.audit(assetId, { page, per_page: PER_PAGE });
			if (res.ok && res.data && typeof res.data !== 'string') {
				rows = res.data.data;
				total = res.data.total;
				lastPage = res.data.last_page ?? 1;
			} else {
				rows = [];
				error = res.error?.message ?? 'Failed to load the change log';
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

	onMount(load);
</script>

<div class="flex flex-col gap-3">
	<p class="text-right text-xs tabular-nums text-muted-foreground">{total} entr(ies)</p>

	{#if loading && rows.length === 0}
		<div class="space-y-2">
			{#each [1, 2, 3, 4] as n (n)}
				<Skeleton class="h-14 w-full" />
			{/each}
		</div>
	{:else if error}
		<p class="py-6 text-center text-xs text-destructive">{error}</p>
	{:else if rows.length === 0}
		<p class="py-6 text-center text-xs text-muted-foreground">No changes recorded yet.</p>
	{:else}
		<ul class="flex flex-col gap-2">
			{#each rows as entry (entry.audit_id)}
				<AssetAuditEntry {entry} />
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
