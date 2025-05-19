<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { AlertTriangleIcon } from 'lucide-svelte';

	let {
		open = $bindable(),
		title = 'Confirm Action',
		message = 'Are you sure you want to proceed with this action?',
		confirmText = 'Confirm',
		cancelText = 'Cancel',
		onConfirm = () => {},
		onCancel = () => {},
		confirmButtonVariant = 'destructive' as "default" | "destructive" | "outline" | "secondary" | "ghost" | "link" | null | undefined,
		showIcon = true
	}: {
		open: boolean;
		title?: string;
		message?: string;
		confirmText?: string;
		cancelText?: string;
		onConfirm?: () => void;
		onCancel?: () => void;
		confirmButtonVariant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link" | null | undefined;
		showIcon?: boolean;
	} = $props();

	function handleConfirm() {
		if (typeof onConfirm === 'function') {
			onConfirm();
		}
		open = false;
	}

	function handleCancel() {
		if (typeof onCancel === 'function') {
			onCancel();
		}
		open = false;
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="sm:max-w-[425px]">
		<Dialog.Header>
			<Dialog.Title class="flex items-center">
				{#if showIcon}
					<AlertTriangleIcon class="h-5 w-5 mr-2 text-destructive" />
				{/if}
				{title}
			</Dialog.Title>
			<Dialog.Description>
				{message}
			</Dialog.Description>
		</Dialog.Header>
		<Dialog.Footer class="pt-4">
			<Button variant="outline" onclick={handleCancel}>{cancelText}</Button>
			<Button variant={confirmButtonVariant} onclick={handleConfirm}>{confirmText}</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
