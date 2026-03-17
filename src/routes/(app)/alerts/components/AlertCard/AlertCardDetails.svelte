<script lang="ts">
	import { Collapsible } from 'bits-ui';

	import type { Alert } from '$lib/types/resources/alert';

	import { mediumDateTimeFormatter } from '$lib/utils/time-formatter';
	import Button from '$lib/components/ui/button/button.svelte';
	import ClipboardCopy from '$lib/components/ui/clipboard-copy/clipboard-copy.svelte';
	import IocDataTable from '$lib/components/common/ioc/IocDataTable.svelte';
	import AssetDataTable from '$lib/components/common/assets/AssetDataTable.svelte';

	let {
		alert
	}: {
		alert: Alert;
	} = $props();

	let showRawAlert = $state(false);
</script>

<div class="flex flex-col">
	<div class="my-4 text-lg font-bold">General Info</div>

	<div class="grid w-auto max-w-xl grid-cols-3 gap-1 text-sm">
		<div class="font-bold">Source:</div>
		<div class="col-span-2">{alert.alert_source}</div>

		<div class="font-bold">Source Link:</div>
		<div class="col-span-2">
			<a target="_blank" href={alert.alert_source_link}>{alert.alert_source_link}</a>

			<ClipboardCopy
				value={alert.alert_source_link}
				tooltipText="Copy"
				alwaysVisible={true}
				size={12}
			/>
		</div>

		<div class="font-bold">Source Reference:</div>
		<div class="col-span-2">
			{alert.alert_source_ref}

			<ClipboardCopy
				value={alert.alert_source_ref}
				tooltipText="Copy"
				alwaysVisible={true}
				size={12}
			/>
		</div>

		<div class="font-bold">Source Event Time:</div>
		<div class="col-span-2">
			{mediumDateTimeFormatter(new Date(alert.alert_source_event_time))}

			<ClipboardCopy
				value={alert.alert_source_event_time}
				tooltipText="Copy"
				alwaysVisible={true}
				size={12}
			/>
		</div>

		<div class="font-bold">IRIS Creation Time:</div>
		<div class="col-span-2">
			{mediumDateTimeFormatter(new Date(alert.alert_creation_time))}

			<ClipboardCopy
				value={alert.alert_creation_time}
				tooltipText="Copy"
				alwaysVisible={true}
				size={12}
			/>
		</div>
	</div>

	<div class="my-4 border-t border-t-gray-300 pt-4 text-lg font-bold">Alert note</div>

	<pre
		class="w-full overflow-auto whitespace-pre-wrap break-words text-xs opacity-80">{alert.alert_note}</pre>

	<div class="my-4 border-t border-t-gray-300 pt-4 text-lg font-bold">Context</div>

	<div class="grid w-auto max-w-xl grid-cols-3 gap-1 text-sm">
		{#each Object.keys(alert.alert_context) as context_key}
			<div class="font-bold">{context_key}</div>
			<div class="col-span-2">{alert.alert_context[context_key]}</div>
		{/each}
	</div>

	{#if alert.iocs.length}
		<div class="my-4 border-t border-t-gray-300 pt-4 text-lg font-bold">IOCs</div>

		<IocDataTable iocs={alert.iocs} className="border-0" />
	{/if}

	{#if alert.assets.length}
		<div class="my-4 border-t border-t-gray-300 pt-4 text-lg font-bold">Assets</div>

		<AssetDataTable assets={alert.assets} className="border-0" />
	{/if}

	<div class="my-4 border-t border-t-gray-300 pt-4 text-lg font-bold">Raw Alert</div>

	<Collapsible.Root open={showRawAlert}>
		<Collapsible.Trigger>
			<Button variant="outline" onclick={() => (showRawAlert = !showRawAlert)}>
				Toggle Raw Alert
			</Button>
		</Collapsible.Trigger>

		<Collapsible.Content
			class="w-full overflow-auto data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down"
		>
			<pre class="mt-4 whitespace-pre-wrap break-words text-xs opacity-80">{JSON.stringify(
					alert.alert_source_content,
					null,
					2
				)}</pre>
		</Collapsible.Content>
	</Collapsible.Root>
</div>
