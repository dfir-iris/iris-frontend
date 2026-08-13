<!--
  Detail view for one registry entry.

  Two columns: a fixed left rail carrying the identity and the fields an
  operator scans before doing anything else, and the tabbed pane on the
  right for everything that needs a round trip. Below `md` the rail
  stacks above the tabs.

  The four tabs each fetch their own page, keyed on `assetId`: the
  overview is cheap, but sightings, timeline and audit are all paginated
  joins that most viewers never open. Mounting them lazily (`{#if}` on
  the active tab, not `hidden`) also means switching customers or assets
  never shows another asset's rows while a request is in flight.
-->
<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog';
	import * as Tabs from '$lib/components/ui/tabs';
	import { Button } from '$lib/components/ui/button';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { PencilIcon } from 'lucide-svelte';
	import CompromiseStatusBadge from '$lib/components/ui/badge/compromise-status-badge.svelte';
	import CustomAttributesTab from '$lib/components/common/CustomAttributes/CustomAttributesTab.svelte';
	import { mediumDateTimeFormatter } from '$lib/utils/time-formatter';
	import RestrictedScopeBanner from './RestrictedScopeBanner.svelte';
	import AssetSightingsTab from './AssetSightingsTab.svelte';
	import AssetTimelineTab from './AssetTimelineTab.svelte';
	import AssetAuditTab from './AssetAuditTab.svelte';
	import type { ManagedAssetDetail } from '$lib/types/resources/managed-asset';

	type Props = {
		open: boolean;
		asset: ManagedAssetDetail | null;
		loading?: boolean;
		canWrite?: boolean;
		onClose: () => void;
		onEdit: (asset: ManagedAssetDetail) => void;
		onSaveAttributes: (
			id: number,
			values: Record<string, Record<string, unknown>>
		) => Promise<void>;
	};

	let {
		open,
		asset,
		loading = false,
		canWrite = false,
		onClose,
		onEdit,
		onSaveAttributes
	}: Props = $props();

	let tab = $state('overview');

	// A different asset means the tabs must remount, and the panel should
	// open where it always opens rather than on whatever tab was last read.
	$effect(() => {
		if (asset?.managed_asset_id !== undefined) tab = 'overview';
	});

	const formatDate = (iso: string | null | undefined) => {
		if (!iso) return '—';
		const parsed = new Date(iso);
		return Number.isNaN(parsed.getTime()) ? iso : mediumDateTimeFormatter(parsed);
	};

	const sightingTotal = $derived(
		asset ? asset.case_sighting_count + asset.alert_sighting_count : 0
	);

	const tagList = $derived(
		(asset?.tags ?? '')
			.split(',')
			.map((tag) => tag.trim())
			.filter((tag) => tag !== '')
	);
</script>

<Dialog.Root
	{open}
	onOpenChange={(next) => {
		if (!next) onClose();
	}}
>
	<Dialog.Content
		class="flex max-h-[90vh] w-full flex-col overflow-hidden p-0 sm:max-w-4xl md:h-[85vh]"
	>
		{#if loading && !asset}
			<div class="flex flex-col gap-2 p-6">
				<Dialog.Title class="sr-only">Loading asset</Dialog.Title>
				{#each [1, 2, 3, 4, 5, 6] as n (n)}
					<Skeleton class="h-6 w-full" />
				{/each}
			</div>
		{:else if !asset}
			<div class="p-6">
				<Dialog.Title class="text-base font-medium">Asset</Dialog.Title>
				<p class="mt-2 text-sm text-muted-foreground">No data.</p>
			</div>
		{:else}
			<div class="flex min-h-0 flex-1 flex-col md:flex-row">
				<!--
				  Left rail. `md:overflow-y-auto` rather than a shared scroll
				  container so a long sightings page doesn't push the identity
				  fields out of view.
				-->
				<aside
					class="shrink-0 border-b bg-muted/20 px-5 py-4 md:w-72 md:overflow-y-auto md:border-b-0 md:border-r"
				>
					<Dialog.Title class="pr-8 text-base font-medium leading-tight">
						{asset.name}
					</Dialog.Title>
					<Dialog.Description class="mt-1 text-xs">
						{asset.client?.customer_name ?? `Customer #${asset.client_id}`}
						· {asset.asset_type?.asset_name ?? `Type #${asset.asset_type_id}`}
					</Dialog.Description>

					<div class="mt-4">
						<RestrictedScopeBanner visible={asset.scope?.restricted ?? false} />
					</div>

					<dl class="mt-4 flex flex-col gap-3 text-xs">
						<div class="flex flex-col gap-0.5">
							<dt class="text-muted-foreground">Criticality</dt>
							<dd class="capitalize">{asset.criticality}</dd>
						</div>
						<div class="flex flex-col gap-0.5">
							<dt class="text-muted-foreground">Environment</dt>
							<dd class="capitalize">{asset.environment ?? '—'}</dd>
						</div>
						<div class="flex flex-col gap-0.5">
							<dt class="text-muted-foreground">Owner</dt>
							<dd class="break-words">{asset.owner ?? '—'}</dd>
						</div>
						<div class="flex flex-col gap-0.5">
							<dt class="text-muted-foreground">IP</dt>
							<dd class="break-all">{asset.ip ?? '—'}</dd>
						</div>
						<div class="flex flex-col gap-0.5">
							<dt class="text-muted-foreground">Domain</dt>
							<dd class="break-all">{asset.domain ?? '—'}</dd>
						</div>
						<div class="flex flex-col gap-1">
							<dt class="text-muted-foreground">Tags</dt>
							<dd class="flex flex-wrap gap-1">
								{#each tagList as tag (tag)}
									<span class="rounded-md bg-muted px-2 py-0.5 text-2xs">{tag}</span>
								{:else}
									<span>—</span>
								{/each}
							</dd>
						</div>
					</dl>

					{#if canWrite}
						<Button
							variant="outline"
							size="sm"
							class="mt-5 h-7 w-full"
							onclick={() => onEdit(asset)}
						>
							<PencilIcon size={13} class="mr-1.5" /> Edit
						</Button>
					{/if}
				</aside>

				<!-- Tabbed pane. `min-w-0` so long values wrap instead of
				     widening the grid and clipping the rail. -->
				<div class="flex min-h-0 min-w-0 flex-1 flex-col">
					<Tabs.Root bind:value={tab} class="flex min-h-0 flex-1 flex-col">
						<Tabs.List class="w-full justify-start rounded-none border-b px-5 pr-12">
							<Tabs.Trigger value="overview">Overview</Tabs.Trigger>
							<Tabs.Trigger value="sightings">Sightings ({sightingTotal})</Tabs.Trigger>
							<Tabs.Trigger value="timeline">Timeline</Tabs.Trigger>
							<Tabs.Trigger value="audit">Changes</Tabs.Trigger>
							<Tabs.Trigger value="attributes">Attributes</Tabs.Trigger>
						</Tabs.List>

						<div class="min-h-0 flex-1 overflow-y-auto px-5 py-4">
							<Tabs.Content value="overview" class="mt-0">
								<div class="flex flex-col gap-4 text-xs">
									{#if asset.description}
										<section>
											<h3
												class="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
											>
												Description
											</h3>
											<p class="whitespace-pre-wrap rounded-md border p-3 text-2xs">
												{asset.description}
											</p>
										</section>
									{/if}

									<section>
										<h3
											class="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
										>
											Visible activity
										</h3>
										<div class="grid grid-cols-[9rem_1fr] gap-x-3 gap-y-1.5 rounded-md border p-3">
											<span class="text-muted-foreground">Cases</span>
											<span class="tabular-nums">{asset.case_sighting_count}</span>
											<span class="text-muted-foreground">Alerts</span>
											<span class="tabular-nums">{asset.alert_sighting_count}</span>
											<span class="text-muted-foreground">Timeline events</span>
											<span class="tabular-nums">{asset.timeline_event_count ?? 0}</span>
											<span class="text-muted-foreground">First seen</span>
											<span class="tabular-nums">{formatDate(asset.first_seen_at)}</span>
											<span class="text-muted-foreground">Last seen</span>
											<span class="tabular-nums">{formatDate(asset.last_seen_at)}</span>
											<span class="text-muted-foreground">Compromise</span>
											<span>
												{#if sightingTotal > 0}
													<CompromiseStatusBadge status_id={asset.compromise_status_id ?? 3} />
												{:else}
													<span class="text-muted-foreground">—</span>
												{/if}
											</span>
											<!-- Only ever present when the status above is
											     "compromised", and it is a sighting date, not the
											     moment somebody set the flag — nothing records that. -->
											{#if asset.compromised_at}
												<span class="text-muted-foreground">Compromised since</span>
												<span
													class="tabular-nums"
													title="Earliest sighting you can see that is marked compromised"
												>
													{formatDate(asset.compromised_at)}
												</span>
											{/if}
										</div>
									</section>

									<section>
										<h3
											class="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
										>
											Record
										</h3>
										<div class="grid grid-cols-[9rem_1fr] gap-x-3 gap-y-1.5 rounded-md border p-3">
											<span class="text-muted-foreground">Location</span>
											<span class="break-words">{asset.location ?? '—'}</span>
											<span class="text-muted-foreground">Status</span>
											<span>{asset.is_active ? 'Active' : 'Retired'}</span>
											<span class="text-muted-foreground">Origin</span>
											<span class="capitalize">{asset.source}</span>
											<span class="text-muted-foreground">Created</span>
											<span class="tabular-nums">{formatDate(asset.created_at)}</span>
											<span class="text-muted-foreground">Updated</span>
											<span class="tabular-nums">{formatDate(asset.updated_at)}</span>
											<span class="text-muted-foreground">Identifier</span>
											<span class="break-all font-mono text-2xs">{asset.managed_asset_uuid}</span>
										</div>
									</section>
								</div>
							</Tabs.Content>

							<Tabs.Content value="sightings" class="mt-0">
								{#if tab === 'sightings'}
									{#key asset.managed_asset_id}
										<AssetSightingsTab assetId={asset.managed_asset_id} />
									{/key}
								{/if}
							</Tabs.Content>

							<Tabs.Content value="timeline" class="mt-0">
								{#if tab === 'timeline'}
									{#key asset.managed_asset_id}
										<AssetTimelineTab assetId={asset.managed_asset_id} />
									{/key}
								{/if}
							</Tabs.Content>

							<Tabs.Content value="audit" class="mt-0">
								{#if tab === 'audit'}
									{#key asset.managed_asset_id}
										<AssetAuditTab assetId={asset.managed_asset_id} />
									{/key}
								{/if}
							</Tabs.Content>

							<Tabs.Content value="attributes" class="mt-0">
								{#if tab === 'attributes'}
									<CustomAttributesTab
										objectType="managed_asset"
										existing={asset.custom_attributes as Record<
											string,
											Record<string, unknown>
										> | null}
										canEdit={canWrite}
										onSave={(values) => onSaveAttributes(asset.managed_asset_id, values)}
									/>
								{/if}
							</Tabs.Content>
						</div>
					</Tabs.Root>
				</div>
			</div>
		{/if}
	</Dialog.Content>
</Dialog.Root>
