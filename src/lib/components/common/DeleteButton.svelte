<script lang="ts">
	import { Button, type ButtonVariant } from '$lib/components/ui/button';
	import { Trash2Icon } from 'lucide-svelte';
	import { ApiService } from '$lib/services/api.service';
	import { toast } from '$lib/components/ui/toast';
	import type { ComponentType } from 'svelte';
	import ConfirmationDialog from '$lib/components/ui/dialog/ConfirmationDialog.svelte';

	let {
		url,
		deletion_prompt_enabled = true,
		deletion_prompt_message = 'Are you sure you want to delete this item?',
		onrefresh = () => {},
		buttonText = 'Delete',
		buttonVariant = 'destructive' as ButtonVariant,
		buttonSize = 'sm' as "default" | "sm" | "lg" | "icon" | undefined, // Removed null
		buttonClass = '',
		icon = Trash2Icon as ComponentType | undefined,
		disabled = false,
		fetch: propFetch
	}: {
		url: string;
		deletion_prompt_enabled?: boolean;
		deletion_prompt_message?: string;
		onrefresh?: () => void;
		buttonText?: string;
		buttonVariant?: ButtonVariant;
		buttonSize?: "default" | "sm" | "lg" | "icon" | undefined; // Removed null
		buttonClass?: string;
		icon?: ComponentType | undefined;
		disabled?: boolean;
		fetch?: typeof window.fetch;
	} = $props();

	let isDeleting = $state(false);
	let showConfirmationDialog = $state(false);

	async function performDelete() {
		isDeleting = true;
		try {
			const fetchInstance = propFetch || window.fetch;
			const response = await ApiService.delete(url, { fetch: fetchInstance });

			if (response.ok || response.status === 204) {
				toast({
					title: 'Success',
					description: 'Item deleted successfully.',
					variant: 'success'
				});
				if (typeof onrefresh === 'function') {
					onrefresh();
				}
			} else {
				const errorData = response.data || { message: 'Failed to delete item. Please try again.' };
				toast({
					title: 'Error',
					description: errorData?.message || 'Failed to delete item. Please try again.',
					variant: 'destructive'
				});
				console.error('Error deleting item:', errorData);
			}
		} catch (error: any) {
			console.error('Error deleting item:', error);
			toast({
				title: 'Error',
				description: error?.message || 'An unexpected error occurred. Please try again.',
				variant: 'destructive'
			});
		} finally {
			isDeleting = false;
			// showConfirmationDialog = false; // Dialog closes itself via bind:open
		}
	}

	function handleDeleteClick() {
		if (deletion_prompt_enabled) {
			showConfirmationDialog = true;
		} else {
			performDelete();
		}
	}

	function handleConfirmDelete() {
		performDelete(); 
		// Dialog will close itself due to onConfirm in ConfirmationDialog setting its open state to false, which propagates via bind:open
	}

	function handleCancelDelete() {
		// Dialog will close itself due to onCancel in ConfirmationDialog setting its open state to false, which propagates via bind:open
		showConfirmationDialog = false; // Explicitly set to false to ensure parent state is updated if dialog doesn't immediately reflect via bind
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
	{:else if icon}
		{@const IconComponent = icon}
		<IconComponent class="mr-2 h-4 w-4" />
		{buttonText}
	{:else}
		{buttonText}
	{/if}
</Button>

{#if showConfirmationDialog}
<ConfirmationDialog
	bind:open={showConfirmationDialog}
	title="Confirm Deletion"
	message={deletion_prompt_message}
	onConfirm={handleConfirmDelete} 
	onCancel={handleCancelDelete} 
/>
{/if}
