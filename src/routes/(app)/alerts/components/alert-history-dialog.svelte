<script lang="ts">
	import ActivityHistory from '$lib/components/common/ActivityHistory.svelte';
	import * as Dialog from '$lib/components/ui/dialog';
	import type { Alert } from '$lib/types/resources/alert';

	type Props = {
		open: boolean;
		onClose: () => void;
		alert?: Alert;
	};

	let { open = $bindable(), onClose, alert }: Props = $props();
</script>

<Dialog.Root
	bind:open
	onOpenChange={(open) => {
		if (!open) {
			onClose();
		}
	}}
>
	<Dialog.Content class="flex max-h-[80vh] max-w-[980px] flex-col p-0">
		<Dialog.Header class="border-b px-6 py-4">
			<Dialog.Title class="text-base font-medium">Alert history</Dialog.Title>
		</Dialog.Header>

		<div class="flex-1 overflow-auto p-8">
			{#if alert}
				<ActivityHistory modificationHistory={alert.modification_history} entityType="alert" />
			{/if}
		</div>
	</Dialog.Content>
</Dialog.Root>
