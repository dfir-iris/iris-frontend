<!--
  The change log across the whole visible registry.

  This is the only place a deletion is readable. The audit row's foreign
  key to the asset is `ON DELETE SET NULL`, so once an asset is gone the
  per-asset tab has nothing left to look up — the entry survives on its
  name and login snapshots, and is reachable only from here.

  Scoped server-side to the customers the viewer belongs to.
-->
<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { ManagedAssetsService } from '$lib/services/managed-assets.service';
	import AssetAuditEntry from './AssetAuditEntry.svelte';
	import type { ManagedAssetAuditEntry } from '$lib/types/resources/managed-asset';

	type Props = {
		open: boolean;
		/** Restrict to one customer, mirroring the list's customer filter. */
		clientId?: number | null;
	};

	let { open = $bindable(false), clientId = null }: Props = $props();

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
			const res = await ManagedAssetsService.auditLog({
				page,
				per_page: PER_PAGE,
				...(clientId ? { client_id: [clientId] } : {})
			});
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

	// Reload on open, and whenever the customer filter moves under it, so
	// the dialog never shows the previous customer's history.
	$effect(() => {
		if (!open) return;
		void clientId;
		page = 1;
		void load();
	});
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="sm:max-w-2xl">
		<Dialog.Header>
			<Dialog.Title class="text-base font-medium">Change log</Dialog.Title>
			<Dialog.Description class="text-xs">
				Every manual change to the registry, including deletions. Automatic registrations from cases
				and alerts are recorded in the activity log instead.
			</Dialog.Description>
		</Dialog.Header>

		<div class="flex max-h-[60vh] flex-col gap-3 overflow-y-auto py-2">
			<p class="text-right text-xs tabular-nums text-muted-foreground">{total} entr(ies)</p>

			{#if loading && rows.length === 0}
				<div class="space-y-2">
					{#each [1, 2, 3, 4, 5] as n (n)}
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
						<AssetAuditEntry {entry} showAsset />
					{/each}
				</ul>
			{/if}
		</div>

		<div class="flex items-center justify-between gap-2">
			<span class="text-xs tabular-nums text-muted-foreground">Page {page} / {lastPage || 1}</span>
			<div class="flex gap-2">
				<Button
					variant="outline"
					size="sm"
					class="h-7 px-2"
					disabled={loading || page <= 1}
					onclick={() => goToPage(page - 1)}
				>
					Previous
				</Button>
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
		</div>
	</Dialog.Content>
</Dialog.Root>
