<!--
  Modal wrapper around AssetDetailView. Reuses the exact same UI as the right
  pane of the asset list — no duplicated rendering. Used by mention chips in
  the markdown editor and anywhere else that wants to surface an asset without
  navigating away.

  Note: AssetDetailView reads CASE_ASSETS_CTX via getContext, so this dialog
  must be mounted somewhere inside the case layout (which is always true when
  it's opened from a markdown editor sitting inside a case route).
-->
<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog';
	import AssetDetailView from './AssetDetailView.svelte';

	let {
		assetId,
		open = $bindable(false)
	}: {
		assetId: number;
		open?: boolean;
	} = $props();
</script>

<Dialog.Root bind:open>
	<Dialog.Content
		class="flex h-[80vh] max-h-[90vh] max-w-[1100px] flex-col gap-0 overflow-hidden p-0"
	>
		<Dialog.Header class="shrink-0 border-b px-6 py-3">
			<Dialog.Title class="text-base font-medium">Asset details</Dialog.Title>
		</Dialog.Header>

		<div class="min-h-0 flex-1 overflow-hidden">
			{#if open}
				<AssetDetailView {assetId} onAfterDelete={() => (open = false)} />
			{/if}
		</div>
	</Dialog.Content>
</Dialog.Root>
