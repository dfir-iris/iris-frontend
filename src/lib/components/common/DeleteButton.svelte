<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Trash2Icon } from 'lucide-svelte';
	import { ApiService } from '$lib/services/api.service';
	import { toast } from '$lib/components/ui/toast';
	import type { ComponentType } from 'svelte';
	import ConfirmationDialog from '$lib/components/ui/dialog/ConfirmationDialog.svelte'; // Import the new dialog

	let {
		url,
		deletion_prompt_enabled = true,
		deletion_prompt_message = 'Are you sure you want to delete this item?',
		onrefresh = () => {},
		buttonText = 'Delete',
		buttonVariant = 'destructive' as "default" | "destructive" | "outline" | "secondary" | "ghost" | "link" | null | undefined,
		buttonSize = 'sm' as "default" | "sm" | "lg" | "icon" | null | undefined,
		buttonClass = '',
		icon = Trash2Icon,
		disabled = false
	}: {
		url: string;
		deletion_prompt_enabled?: boolean;
		deletion_prompt_message?: string;
		onrefresh?: () => void;
		buttonText?: string;
		buttonVariant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link" | null | undefined;
		buttonSize?: "default" | "sm" | "lg" | "icon" | null | undefined;
		buttonClass?: string;
		icon?: ComponentType;
		disabled?: boolean;
	} = $props();

	let isDeleting = $state(false);
	let showConfirmationDialog = $state(false); // State to control the dialog

	async function performDelete() {
		isDeleting = true;
		try {
			const response = await ApiService.delete(url);
			if (response.ok || response.status === 204) { // 204 No Content is also a success
				toast({
					title: 'Success',
					description: 'Item deleted successfully.',
					variant: 'success'
				});
				if (typeof onrefresh === 'function') {
					onrefresh();
				}
			} else {
				const errorData = response.data;
				toast({
					title: 'Error',
					description: errorData?.message || 'Failed to delete item. Please try again.',
					variant: 'destructive'
				});
				console.error('Error deleting item:', errorData);
			}
		} catch (error) {
			console.error('Error deleting item:', error);
			toast({
				title: 'Error',
				description: 'An unexpected error occurred. Please try again.',
				variant: 'destructive'
			});
		} finally {
			isDeleting = false;
		}
	}

	function handleDeleteClick() {
		if (deletion_prompt_enabled) {
			// Open the confirmation dialog instead of window.confirm
			showConfirmationDialog = true;
		} else {
			performDelete();
		}
	}

	function handleConfirmDelete() {
		performDelete();
		showConfirmationDialog = false; // Close dialog after confirmation
	}

	function handleCancelDelete() {
		showConfirmationDialog = false; // Close dialog on cancel
	}
</script>

<Button
	variant={buttonVariant}
	size={buttonSize}
	class={buttonClass}
	onclick={handleDeleteClick}
	disabled={isDeleting || disabled}
>
	{#if isDeleting}
		<span class="animate-spin mr-2">⟳</span>
		<span>Deleting...</span>
	{:else}
		{#if icon}
			<svelte:component this={icon} class="h-4 w-4 mr-2" />
		{/if}
		<span>{buttonText}</span>
	{/if}
</Button>

{#if deletion_prompt_enabled}
	<ConfirmationDialog
		bind:open={showConfirmationDialog}
		title="Confirm Deletion"
		message={deletion_prompt_message}
		confirmText="Delete"
		cancelText="Cancel"
		onConfirm={handleConfirmDelete}
		onCancel={handleCancelDelete}
		confirmButtonVariant="destructive"
	/>
{/if}
