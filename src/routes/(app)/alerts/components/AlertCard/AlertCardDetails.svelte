<script lang="ts">
	import { Collapsible } from 'bits-ui';
	import type { Alert } from '$lib/types/resources/alert';
	import type { Asset } from '$lib/types/resources/asset';
	import type { Ioc } from '$lib/types/resources/ioc';
	import { mediumDateTimeFormatter } from '$lib/utils/time-formatter';
	import Button from '$lib/components/ui/button/button.svelte';
	import ClipboardCopy from '$lib/components/ui/clipboard-copy/clipboard-copy.svelte';
	import IocDataTable from '$lib/components/common/ioc/IocDataTable.svelte';
	import AssetDataTable from '$lib/components/common/assets/AssetDataTable.svelte';
	import EnrichmentDialog from '$lib/components/common/EnrichmentDialog.svelte';
	import { AlertRelatedGraph } from '../AlertRelatedGraph';
	import { MarkDownPreview } from '$lib/components/common/MarkDown';
	import AlertIocEditDialog from '../alert-ioc-edit-dialog.svelte';
	import AlertAssetEditDialog from '../alert-asset-edit-dialog.svelte';
	import { hasChanges, saveAlertAsset, saveAlertIoc } from '../../helpers/alert-observables';

	let {
		alert
	}: {
		alert: Alert;
	} = $props();

	let showRawAlert = $state(false);

	let enrichmentOpen = $state(false);
	let enrichmentSubject = $state('');
	let enrichmentValue = $state<unknown>(null);

	// The edited row and the dialog's own open flag are kept apart so the
	// dialog is only mounted while something is being edited — one card
	// per alert is rendered in the queue, and each carries these.
	let editedIoc = $state<Ioc | null>(null);
	let iocDialogOpen = $state(false);
	let editedAsset = $state<Asset | null>(null);
	let assetDialogOpen = $state(false);
	let saving = $state(false);

	const showEnrichment = (subject: string, enrichment: unknown) => {
		enrichmentSubject = subject;
		enrichmentValue = enrichment;
		enrichmentOpen = true;
	};

	const editIoc = (ioc: Ioc) => {
		editedIoc = ioc;
		iocDialogOpen = true;
	};

	const closeIocDialog = () => {
		iocDialogOpen = false;
		editedIoc = null;
	};

	const editAsset = (asset: Asset) => {
		editedAsset = asset;
		assetDialogOpen = true;
	};

	const closeAssetDialog = () => {
		assetDialogOpen = false;
		editedAsset = null;
	};

	// `saveAlertIoc` patches the row back into `alert` itself, which is
	// what the tables render — nothing to refetch, and the other views
	// on the same alert object see the edit too.
	const saveIoc = async (ioc: Ioc, changes: Parameters<typeof saveAlertIoc>[2]) => {
		if (!hasChanges(changes)) {
			closeIocDialog();
			return;
		}

		saving = true;

		const updated = await saveAlertIoc(alert, ioc.ioc_id, changes);

		saving = false;

		// A failed save leaves the dialog open with the analyst's text in
		// it — the toast says what went wrong and the edit is not lost.
		if (updated) closeIocDialog();
	};

	const saveAsset = async (asset: Asset, changes: Parameters<typeof saveAlertAsset>[2]) => {
		if (!hasChanges(changes)) {
			closeAssetDialog();
			return;
		}

		saving = true;

		const updated = await saveAlertAsset(alert, asset.asset_id, changes);

		saving = false;

		if (updated) closeAssetDialog();
	};

	const contextEntries: { key: string; value: string }[] = $derived.by(() => {
		const ctx = alert.alert_context;
		if (!ctx) return [];
		return Object.keys(ctx).map((k) => ({ key: k, value: String(ctx[k]) }));
	});
</script>

<div class="flex min-w-0 flex-col gap-4 pt-2">
	<!-- General Info + Alert Note side by side -->
	<div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
		<div class="rounded-lg border border-border/50 bg-muted/30 p-4">
			<h4 class="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
				General Info
			</h4>

			<div class="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2 text-xs">
				<div class="text-muted-foreground">Source</div>
				<div class="font-medium">{alert.alert_source}</div>

				<div class="text-muted-foreground">Source Link</div>
				<div class="flex min-w-0 items-center gap-1">
					<a
						target="_blank"
						href={alert.alert_source_link}
						class="truncate text-blue-500 hover:underline">{alert.alert_source_link}</a
					>
					<ClipboardCopy
						value={alert.alert_source_link}
						tooltipText="Copy"
						alwaysVisible={true}
						size={11}
					/>
				</div>

				<div class="text-muted-foreground">Source Reference</div>
				<div class="flex min-w-0 items-center gap-1">
					<span class="truncate">{alert.alert_source_ref}</span>
					<ClipboardCopy
						value={alert.alert_source_ref}
						tooltipText="Copy"
						alwaysVisible={true}
						size={11}
					/>
				</div>

				<div class="text-muted-foreground">Source Event Time</div>
				<div class="flex items-center gap-1">
					{mediumDateTimeFormatter(new Date(alert.alert_source_event_time))}
					<ClipboardCopy
						value={alert.alert_source_event_time}
						tooltipText="Copy"
						alwaysVisible={true}
						size={11}
					/>
				</div>

				<div class="text-muted-foreground">IRIS Creation Time</div>
				<div class="flex items-center gap-1">
					{mediumDateTimeFormatter(new Date(alert.alert_creation_time))}
					<ClipboardCopy
						value={alert.alert_creation_time}
						tooltipText="Copy"
						alwaysVisible={true}
						size={11}
					/>
				</div>
			</div>
		</div>

		<div class="flex flex-col gap-4">
			{#if alert.alert_note}
				<div class="rounded-lg border border-border/50 bg-muted/30 p-4">
					<h4 class="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
						Alert Note
					</h4>
					<!--
					  Note is rendered as sanitized markdown (same
					  Showdown+DOMPurify pipeline as case notes). Analysts
					  commonly paste triage steps with headings/lists/code
					  fences; plain text still renders as plain text.
					-->
					<div class="text-xs leading-relaxed">
						<MarkDownPreview markdown={alert.alert_note} />
					</div>
				</div>
			{/if}

			{#if contextEntries.length}
				<div class="rounded-lg border border-border/50 bg-muted/30 p-4">
					<h4 class="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
						Context
					</h4>
					<div class="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2 text-xs">
						{#each contextEntries as entry (entry.key)}
							<div class="text-muted-foreground">{entry.key}</div>
							<div class="break-all">{entry.value}</div>
						{/each}
					</div>
				</div>
			{/if}
		</div>
	</div>

	<!-- Relationships -->
	<div class="rounded-lg border border-border/50 bg-muted/30 p-4">
		<h4 class="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
			Relationships
		</h4>
		<AlertRelatedGraph alertId={alert.alert_id} />
	</div>

	<!-- IOCs -->
	{#if alert.iocs.length}
		<div class="rounded-lg border border-border/50 bg-muted/30 p-4">
			<h4 class="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">IOCs</h4>
			<IocDataTable
				iocs={alert.iocs}
				showDescription
				showTags
				onShowEnrichment={(ioc) => showEnrichment(ioc.ioc_value, ioc.ioc_enrichment)}
				onEdit={editIoc}
			/>
		</div>
	{/if}

	<!-- Assets -->
	{#if alert.assets.length}
		<div class="rounded-lg border border-border/50 bg-muted/30 p-4">
			<h4 class="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
				Assets
			</h4>
			<AssetDataTable
				assets={alert.assets}
				showDescription
				onShowEnrichment={(asset) => showEnrichment(asset.asset_name, asset.asset_enrichment)}
				onEdit={editAsset}
			/>
		</div>
	{/if}

	<!-- Raw Alert -->
	<div class="rounded-lg border border-border/50 bg-muted/30 p-4">
		<div class="mb-3 flex items-center justify-between gap-2">
			<h4 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Raw Alert</h4>
			<ClipboardCopy
				value={JSON.stringify(alert.alert_source_content, null, 2)}
				tooltipText="Copy raw alert"
				alwaysVisible
			/>
		</div>
		<Collapsible.Root bind:open={showRawAlert}>
			<Collapsible.Trigger>
				<Button variant="outline" size="sm">
					{showRawAlert ? 'Hide' : 'Show'} Raw Alert
				</Button>
			</Collapsible.Trigger>

			<Collapsible.Content
				class="w-full overflow-auto data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down"
			>
				<pre
					class="mt-3 whitespace-pre-wrap break-words rounded-md bg-muted/50 p-3 text-xs leading-relaxed">{JSON.stringify(
						alert.alert_source_content,
						null,
						2
					)}</pre>
			</Collapsible.Content>
		</Collapsible.Root>
	</div>
</div>

<EnrichmentDialog
	bind:open={enrichmentOpen}
	subject={enrichmentSubject}
	enrichment={enrichmentValue}
/>

{#if editedIoc}
	<AlertIocEditDialog
		bind:open={iocDialogOpen}
		ioc={editedIoc}
		{saving}
		onClose={closeIocDialog}
		onSave={(changes) => editedIoc && saveIoc(editedIoc, changes)}
	/>
{/if}

{#if editedAsset}
	<AlertAssetEditDialog
		bind:open={assetDialogOpen}
		asset={editedAsset}
		{saving}
		onClose={closeAssetDialog}
		onSave={(changes) => editedAsset && saveAsset(editedAsset, changes)}
	/>
{/if}
