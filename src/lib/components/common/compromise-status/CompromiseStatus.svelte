<script lang="ts">
	import { 
		ShieldIcon, 
		ShieldAlertIcon, 
		ShieldQuestionIcon, 
		ShieldCheckIcon,
		ChevronDownIcon
	} from 'lucide-svelte';
	import { Popover, PopoverContent, PopoverTrigger } from '$lib/components/ui/popover';
	import { Button } from '$lib/components/ui/button';
	import { AssetService } from '$lib/services/asset.service';
	import { toast } from '$lib/components/ui/toast';
	import { assetsStore } from '$lib/stores/assets.store';
	
	export interface CompromiseStatusData {
		id: number;
		name: string;
	}
	
	// Define compromise status options
	const compromiseStatuses = [
		{ id: 1, name: 'Compromised' },
		{ id: 2, name: 'Not Compromised' },
		{ id: 3, name: 'Unknown' },
		{ id: 4, name: 'To be determined' }
	];
	
	let { 
		status, 
		caseId, 
		assetId, 
		isEditing = false,
		onStatusChange = () => {},
		editValue,
		onEditValueChange = () => {}
	} = $props<{
		status: CompromiseStatusData | number;
		caseId?: string;
		assetId?: string;
		isEditing?: boolean;
		onStatusChange?: (newStatus: CompromiseStatusData) => void;
		editValue?: number;
		onEditValueChange?: (newStatusId: number) => void;
	}>();
	
	let isStatusPopoverOpen = $state(false);
	let isChangingStatus = $state(false);
	
	// Convert numeric status to object if needed
	$effect(() => {
		if (typeof status === 'number') {
			status = compromiseStatuses.find(s => s.id === status) || { id: 3, name: 'Unknown' };
		}
	});
	
	function getStatusIcon(statusName: string) {
		switch (statusName) {
			case 'Compromised':
				return ShieldAlertIcon;
			case 'Not Compromised':
				return ShieldCheckIcon;
			case 'To be determined':
				return ShieldIcon;
			case 'Unknown':
			default:
				return ShieldQuestionIcon;
		}
	}
	
	function getStatusColor(statusName: string) {
		// Map status names to colors
		const statusColors = {
			'Compromised': 'bg-red-200 text-red-800',
			'Not Compromised': 'bg-green-200 text-green-800',
			'Unknown': 'bg-gray-200 text-gray-800',
			'To be determined': 'bg-blue-200 text-blue-800'
		};
		
		return statusColors[statusName] || 'bg-gray-200 text-gray-800';
	}
	
	async function changeCompromiseStatus(statusId: number) {
		if (!caseId || !assetId || (typeof status === 'object' && statusId === status.id)) {
			isStatusPopoverOpen = false;
			return;
		}
		
		isChangingStatus = true;
		
		try {
			const response = await AssetService.updateAsset(
				caseId, 
				assetId, 
				{ asset_compromise_status_id: statusId }
			);

			if (!response.ok) {
				throw new Error('Failed to update asset status');
			}
			
			// Find the new status in the options
			const newStatus = compromiseStatuses.find(s => s.id === statusId);
			
			if (newStatus) {
				// Call the callback with the new status
				onStatusChange(newStatus);
				
				// Update the asset in the store
				const existingAsset = assetsStore.getAsset(assetId);
				if (existingAsset) {
					assetsStore.updateAsset(assetId, {
						...existingAsset,
						asset_compromise_status_id: statusId
					});
				}
			}
			
			toast({
				title: "Status updated",
				description: "Compromise status has been successfully updated.",
				variant: "success"
			});
		} catch (error) {
			console.error('Error updating compromise status:', error);
			toast({
				title: "Update failed",
				description: "There was a problem updating the compromise status.",
				variant: "destructive"
			});
		} finally {
			isChangingStatus = false;
			isStatusPopoverOpen = false;
		}
	}
	
	function handleEditChange(e) {
		const newStatusId = parseInt(e.target.value);
		onEditValueChange(newStatusId);
	}
</script>

{#if isEditing}
	<select 
		value={editValue} 
		onchange={handleEditChange}
		class="w-full px-3 py-2 bg-background border border-input rounded-md text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-primary"
	>
		<option value="" disabled>Select compromise status</option>
		{#each compromiseStatuses as statusOption}
			<option value={statusOption.id}>{statusOption.name}</option>
		{/each}
	</select>
{:else}
	<Popover bind:open={isStatusPopoverOpen}>
		<PopoverTrigger>
			<div class="flex items-center gap-1 cursor-pointer">
				{#if typeof status === 'object'}
					<div class={`px-2 py-1 rounded-md text-sm font-medium flex items-center gap-1 ${getStatusColor(status.name)}`}>
						<svelte:component this={getStatusIcon(status.name)} class="h-3.5 w-3.5" />
						<span>{status.name}</span>
					</div>
				{/if}
				{#if caseId && assetId}
					<ChevronDownIcon class="h-4 w-4 text-muted-foreground" />
				{/if}
			</div>
		</PopoverTrigger>
		{#if caseId && assetId}
			<PopoverContent class="w-56 p-2">
				<div class="space-y-1">
					{#each compromiseStatuses as statusOption}
						<Button 
							variant="ghost" 
							size="sm" 
							class="w-full justify-start"
							disabled={isChangingStatus}
							onclick={() => changeCompromiseStatus(statusOption.id)}
						>
							<div class={`w-full flex items-center gap-2 ${typeof status === 'object' && statusOption.id === status.id ? 'font-bold' : ''}`}>
								<div class={`flex items-center gap-1 ${getStatusColor(statusOption.name)}`}>
									<svelte:component this={getStatusIcon(statusOption.name)} class="h-3.5 w-3.5" />
									<span>{statusOption.name}</span>
								</div>
							</div>
						</Button>
					{/each}
				</div>
			</PopoverContent>
		{/if}
	</Popover>
{/if}