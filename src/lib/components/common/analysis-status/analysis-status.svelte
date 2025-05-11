<script lang="ts">
	import { 
		CheckCircleIcon, 
		ChevronDownIcon, 
		ClockIcon, 
		AlertCircleIcon, 
		XCircleIcon, 
		PlayIcon, 
		HelpCircleIcon 
	} from 'lucide-svelte';
	import { Popover, PopoverContent, PopoverTrigger } from '$lib/components/ui/popover';
	import { Button } from '$lib/components/ui/button';
	import { analysisStatuses } from '$lib/stores/analysis-status.store';
	import { AssetService } from '$lib/services/asset.service';
	import { toast } from '$lib/components/ui/toast';
	import { assetsStore } from '$lib/stores/assets.store';

	export interface AnalysisStatusData {
		id: number;
		name: string;
		description?: string;
	}
	
	let { 
		status, 
		caseId, 
		assetId, 
		isEditing = false,
		onStatusChange = () => {},
		editValue,
		onEditValueChange = () => {}
	} = $props<{
		status: AnalysisStatusData;
		caseId?: string;
		assetId?: string;
		isEditing?: boolean;
		onStatusChange?: (newStatus: AnalysisStatusData) => void;
		editValue?: number;
		onEditValueChange?: (newStatusId: number) => void;
	}>();
	
	let isStatusPopoverOpen = $state(false);
	let isChangingStatus = $state(false);
	
	// Initialize store if needed
	$effect(() => {
		if (!$analysisStatuses.length) {
			analysisStatuses.fetch();
		}
	});
	
	function getStatusIcon(statusName: string) {
		switch (statusName) {
			case 'Done':
				return CheckCircleIcon;
			case 'Started':
				return PlayIcon;
			case 'Pending':
				return ClockIcon;
			case 'To be done':
				return AlertCircleIcon;
			case 'Canceled':
				return XCircleIcon;
			case 'Unspecified':
			default:
				return HelpCircleIcon;
		}
	}
	
	function getStatusColor(statusName: string) {
		// Map status names to colors
		const statusColors = {
			'Unspecified': 'bg-gray-200 text-gray-800',
			'To be done': 'bg-orange-200 text-orange-800',
			'Started': 'bg-blue-200 text-blue-800',
			'Pending': 'bg-yellow-200 text-yellow-800',
			'Canceled': 'bg-red-200 text-red-800',
			'Done': 'bg-green-200 text-green-800'
		};
		
		return statusColors[statusName] || 'bg-gray-200 text-gray-800';
	}
	
	async function changeAnalysisStatus(statusId: number) {
		if (!caseId || !assetId || statusId === status.id) {
			isStatusPopoverOpen = false;
			return;
		}
		
		isChangingStatus = true;
		
		try {
			const response = await AssetService.updateAsset(
				caseId, 
				assetId, 
				{ analysis_status_id: statusId }
			);
			
			// Find the new status in the store
			const newStatus = $analysisStatuses.find(s => s.id === statusId);
			
			if (newStatus) {
				// Call the callback with the new status
				onStatusChange(newStatus);
				
				// Update the asset in the store
				const existingAsset = assetsStore.getAsset(assetId);
				if (existingAsset) {
					assetsStore.updateAsset(assetId, {
						...existingAsset,
						analysis_status: newStatus
					});
				}
			}
			
			toast({
				title: "Status updated",
				description: "Analysis status has been successfully updated.",
				variant: "success"
			});
		} catch (error) {
			console.error('Error updating analysis status:', error);
			toast({
				title: "Update failed",
				description: "There was a problem updating the analysis status.",
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
		<option value="" disabled>Select status</option>
		{#each $analysisStatuses as statusOption}
			<option value={statusOption.id}>{statusOption.name}</option>
		{/each}
	</select>
{:else}
	<Popover bind:open={isStatusPopoverOpen}>
		<PopoverTrigger>
			<div class="flex items-center gap-1 cursor-pointer">
				<div class={`px-2 py-1 rounded-md text-sm font-medium flex items-center gap-1 ${getStatusColor(status.name)}`}>
					<svelte:component this={getStatusIcon(status.name)} class="h-3.5 w-3.5" />
					<span>{status.name}</span>
				</div>
				{#if caseId && assetId}
					<ChevronDownIcon class="h-4 w-4 text-muted-foreground" />
				{/if}
			</div>
		</PopoverTrigger>
		{#if caseId && assetId}
			<PopoverContent class="w-56 p-2">
				<div class="space-y-1">
					{#each $analysisStatuses as statusOption}
						<Button 
							variant="ghost" 
							size="sm" 
							class="w-full justify-start"
							disabled={isChangingStatus}
							onclick={() => changeAnalysisStatus(statusOption.id)}
						>
							<div class={`w-full flex items-center gap-2 ${statusOption.id === status.id ? 'font-bold' : ''}`}>
								<div class={`flex items-center gap-1 ${getStatusColor(statusOption.name)} rounded-md px-2 py-1`}>
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