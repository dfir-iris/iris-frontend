<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';

	type SwitchContextModalProps = {
		open: boolean;
		title?: string;
		onConfirm: () => void;
		onOpenChange: (open: boolean) => void;
	};

	let {
		open,
		title = 'Switch Context',
		onConfirm,
		onOpenChange
	}: SwitchContextModalProps = $props();

	function handleConfirm() {
		onConfirm();
	}
</script>

<Dialog.Root bind:open {onOpenChange}>
	<Dialog.Content class="sm:max-w-[525px]">
		<Dialog.Header>
			<Dialog.Title>{title}</Dialog.Title>
		</Dialog.Header>

		<div class="grid gap-4 py-4">
			<h1>Select Context</h1>
		</div>

		<Dialog.Footer>
			<Button variant="outline" onclick={() => onOpenChange(false)}>Close</Button>

			<Button onclick={handleConfirm}>Switch</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
