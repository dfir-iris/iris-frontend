<script lang="ts">
	import { Collapsible } from 'bits-ui';
	import type { Alert } from '$lib/types/resources/alert';
	import { mediumDateTimeFormatter } from '$lib/utils/time-formatter';
	import Button from '$lib/components/ui/button/button.svelte';
	import ClipboardCopy from '$lib/components/ui/clipboard-copy/clipboard-copy.svelte';
	import IocDataTable from '$lib/components/common/ioc/IocDataTable.svelte';
	import AssetDataTable from '$lib/components/common/assets/AssetDataTable.svelte';
	import { AlertRelatedGraph } from '../AlertRelatedGraph';

	let {
		alert
	}: {
		alert: Alert;
	} = $props();

	let showRawAlert = $state(false);

	const contextEntries: { key: string; value: string }[] = $derived(
		Object.keys(alert.alert_context).map((k) => ({ key: k, value: String(alert.alert_context[k]) }))
	);
</script>

<div class="flex min-w-0 flex-col gap-4 pt-2">
	<!-- General Info + Alert Note side by side -->
	<div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
		<div class="rounded-lg border border-border/50 bg-muted/30 p-4">
			<h4 class="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">General Info</h4>

			<div class="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2 text-xs">
				<div class="text-muted-foreground">Source</div>
				<div class="font-medium">{alert.alert_source}</div>

				<div class="text-muted-foreground">Source Link</div>
				<div class="flex min-w-0 items-center gap-1">
					<a target="_blank" href={alert.alert_source_link} class="truncate text-blue-500 hover:underline">{alert.alert_source_link}</a>
					<ClipboardCopy value={alert.alert_source_link} tooltipText="Copy" alwaysVisible={true} size={11} />
				</div>

				<div class="text-muted-foreground">Source Reference</div>
				<div class="flex min-w-0 items-center gap-1">
					<span class="truncate">{alert.alert_source_ref}</span>
					<ClipboardCopy value={alert.alert_source_ref} tooltipText="Copy" alwaysVisible={true} size={11} />
				</div>

				<div class="text-muted-foreground">Source Event Time</div>
				<div class="flex items-center gap-1">
					{mediumDateTimeFormatter(new Date(alert.alert_source_event_time))}
					<ClipboardCopy value={alert.alert_source_event_time} tooltipText="Copy" alwaysVisible={true} size={11} />
				</div>

				<div class="text-muted-foreground">IRIS Creation Time</div>
				<div class="flex items-center gap-1">
					{mediumDateTimeFormatter(new Date(alert.alert_creation_time))}
					<ClipboardCopy value={alert.alert_creation_time} tooltipText="Copy" alwaysVisible={true} size={11} />
				</div>
			</div>
		</div>

		<div class="flex flex-col gap-4">
			{#if alert.alert_note}
				<div class="rounded-lg border border-border/50 bg-muted/30 p-4">
					<h4 class="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Alert Note</h4>
					<pre class="w-full overflow-auto whitespace-pre-wrap break-words text-xs leading-relaxed">{alert.alert_note}</pre>
				</div>
			{/if}

			{#if Object.keys(alert.alert_context).length}
				<div class="rounded-lg border border-border/50 bg-muted/30 p-4">
					<h4 class="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Context</h4>
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
		<h4 class="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Relationships</h4>
		<AlertRelatedGraph alertId={alert.alert_id} />
	</div>

	<!-- IOCs -->
	{#if alert.iocs.length}
		<div class="rounded-lg border border-border/50 bg-muted/30 p-4">
			<h4 class="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">IOCs</h4>
			<IocDataTable iocs={alert.iocs} />
		</div>
	{/if}

	<!-- Assets -->
	{#if alert.assets.length}
		<div class="rounded-lg border border-border/50 bg-muted/30 p-4">
			<h4 class="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Assets</h4>
			<AssetDataTable assets={alert.assets} />
		</div>
	{/if}

	<!-- Raw Alert -->
	<div class="rounded-lg border border-border/50 bg-muted/30 p-4">
		<h4 class="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Raw Alert</h4>
		<Collapsible.Root bind:open={showRawAlert}>
			<Collapsible.Trigger>
				<Button variant="outline" size="sm">
					{showRawAlert ? 'Hide' : 'Show'} Raw Alert
				</Button>
			</Collapsible.Trigger>

			<Collapsible.Content
				class="w-full overflow-auto data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down"
			>
				<pre class="mt-3 rounded-md bg-muted/50 p-3 whitespace-pre-wrap break-words text-xs leading-relaxed">{JSON.stringify(
						alert.alert_source_content,
						null,
						2
					)}</pre>
			</Collapsible.Content>
		</Collapsible.Root>
	</div>
</div>
