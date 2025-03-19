<script lang="ts">
	import { marked } from 'marked';
	import type { Asset } from '$lib/types/resources/asset';
	import { 
		ServerIcon, 
		GlobeIcon, 
		NetworkIcon,
		FileTextIcon,
		CheckCircleIcon,
		ShieldIcon,
		ComponentIcon
	} from 'lucide-svelte';
	import ClipboardCopy from '$lib/components/ui/clipboard-copy/clipboard-copy.svelte';
	import { Input } from '$lib/components/ui/input';
	import { Textarea } from '$lib/components/ui/textarea';
	import { assetTypes } from '$lib/stores/asset-types.store';
	import { analysisStatuses } from '$lib/stores/analysis-status.store';
	import { page } from '$app/state';
	import { AnalysisStatus } from '$lib/components/common/analysis-status';
	import { CompromiseStatus } from '$lib/components/common/compromise-status';
	import { assetsStore } from '$lib/stores/assets.store';

	let { 
		asset, 
		isEditing = false, 
		editData,
		onUpdateEditData = (field: string, value: string | number) => {}
	} = $props<{ 
		asset: Asset;
		isEditing?: boolean;
		editData?: {
			asset_name: string;
			asset_description: string;
			asset_ip: string;
			asset_domain: string;
			asset_type_id?: number;
			analysis_status_id?: number;
			asset_compromise_status_id?: number;
		};
		onUpdateEditData?: (field: string, value: string | number) => void;
	}>();
	
	let descriptionHtml = $derived(marked(asset.asset_description || 'No description provided'));
	
	// Initialize stores only once when the component mounts
	let storesInitialized = $state(false);
	
	$effect(() => {
		if (!storesInitialized) {
			// Use Promise.all to fetch both in parallel
			Promise.all([
				assetTypes.fetch(),
				analysisStatuses.fetch()
			]).then(() => {
				storesInitialized = true;
			});
		}
	});
	
	// Make sure editData has all required fields
	$effect(() => {
		if (isEditing && editData && storesInitialized) {
			if (editData.asset_type_id === undefined && asset.asset_type) {
				onUpdateEditData('asset_type_id', asset.asset_type.id);
			}
			
			if (editData.analysis_status_id === undefined && asset.analysis_status) {
				onUpdateEditData('analysis_status_id', asset.analysis_status.id);
			}
			
			if (editData.asset_compromise_status_id === undefined) {
				onUpdateEditData('asset_compromise_status_id', asset.asset_compromise_status_id || 3);
			}
		}
	});
	
	function handleStatusChange(newStatus: any) {
		// Update the asset data locally
		asset = { 
			...asset, 
			analysis_status: newStatus
		};
	}
	
	function handleCompromiseStatusChange(newStatus: any) {
		// Update the asset data locally
		asset = { 
			...asset, 
			asset_compromise_status_id: newStatus.id
		};
	}

	// Function to update a specific field
	function updateField(field: string, value: string | number) {
		if (!isEditing || !asset || !onUpdateEditData) return;
		
		// Create an update object with just the changed field
		const update = { [field]: value };
		
		// Call the parent's onUpdate function
		onUpdateEditData(field, value);
		
		// If we have the asset ID, also update the store directly for immediate UI updates
		if (asset.asset_id) {
			const assetId = asset.asset_id.toString();
			const existingAsset = assetsStore.getAsset(assetId);
			
			if (existingAsset) {
				// Create a new asset object with the updated field
				const updatedAsset = {
					...existingAsset,
					...update
				};
				
				// Update the store
				console.log(`Updating ${field} in store from details-tab:`, assetId, updatedAsset);
				assetsStore.updateAsset(assetId, updatedAsset);
			}
		}
	}
</script>

<div class="space-y-8 p-1">
	<!-- General Information -->
	<section>
		<div class="flex items-center gap-2 mb-4 border-b pb-2">
			<ServerIcon class="h-5 w-5 text-primary" />
			<h2 class="text-lg font-semibold">General Information</h2>
		</div>
		
		<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6">
			{#if isEditing && editData}
				<div class="group bg-card/40 p-4 rounded-lg">
					<div class="flex items-start gap-3">
						<div class="bg-primary/10 p-2 rounded-md text-primary shrink-0">
							<ServerIcon class="h-4 w-4" />
						</div>
						<div class="min-w-0 flex-1">				
							<p class="text-sm font-medium text-muted-foreground">Asset Name</p>
							<Input 
								value={editData.asset_name} 
								onchange={(e) => {
									if (e.target) {
										updateField('asset_name', (e.target as HTMLInputElement).value);
									}
								}}
								class="mt-1" 
							/>
						</div>
					</div>
				</div>
				
				<div class="group bg-card/40 p-4 rounded-lg">
					<div class="flex items-start gap-3">
						<div class="bg-primary/10 p-2 rounded-md text-primary shrink-0">
							<ComponentIcon class="h-4 w-4" />
						</div>
						<div class="min-w-0 flex-1">				
							<p class="text-sm font-medium text-muted-foreground">Asset Type</p>
							<select 
								value={editData.asset_type_id} 
								onchange={(e) => updateField('asset_type_id', parseInt((e.target as HTMLSelectElement).value))}
								class="mt-1 w-full px-3 py-2 bg-background border border-input rounded-md text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-primary"
							>
								<option value="" disabled>Select asset type</option>
								{#each $assetTypes as type}
									<option value={type.asset_id}>{type.asset_name}</option>
								{/each}
							</select>
							{#if editData.asset_type_id}
								{@const selectedType = $assetTypes.find(t => t.id === editData.asset_type_id)}
							{/if}
						</div>
					</div>
				</div>
				
				<div class="group bg-card/40 p-4 rounded-lg">
					<div class="flex items-start gap-3">
						<div class="bg-primary/10 p-2 rounded-md text-primary shrink-0">
							<CheckCircleIcon class="h-4 w-4" />
						</div>
						<div class="min-w-0 flex-1">				
							<p class="text-sm font-medium text-muted-foreground">Analysis Status</p>
							<div class="mt-1">
								<AnalysisStatus 
									isEditing={true}
									editValue={editData.analysis_status_id}
									status={asset.analysis_status}
									onEditValueChange={(value) => updateField('analysis_status_id', value)}
								/>
							</div>
						</div>
					</div>
				</div>
				
				<!-- Compromise Status (Edit Mode) -->
				<div class="group bg-card/40 p-4 rounded-lg">
					<div class="flex items-start gap-3">
						<div class="bg-primary/10 p-2 rounded-md text-primary shrink-0">
							<ShieldIcon class="h-4 w-4" />
						</div>
						<div class="min-w-0 flex-1">				
							<p class="text-sm font-medium text-muted-foreground">Compromise Status</p>
							<div class="mt-1">
								<CompromiseStatus 
									isEditing={true}
									editValue={editData.asset_compromise_status_id}
									status={asset.asset_compromise_status_id || 3}
									onEditValueChange={(value) => updateField('asset_compromise_status_id', value)}
								/>
							</div>
						</div>
					</div>
				</div>
			{:else}
				{@render fieldWithIcon('Asset Name', asset.asset_name, ServerIcon)}
				{@render fieldWithIcon('Asset Type', asset.asset_type?.asset_name, ComponentIcon)}
				
				<!-- Analysis Status with click-to-change functionality -->
				<div class="group bg-card/40 p-4 rounded-lg">
					<div class="flex items-start gap-3">
						<div class="bg-primary/10 p-2 rounded-md text-primary shrink-0">
							<CheckCircleIcon class="h-4 w-4" />
						</div>
						<div class="min-w-0 flex-1">				
							<p class="text-sm font-medium text-muted-foreground">Analysis Status</p>
							<div class="mt-1">
								<AnalysisStatus 
									status={asset.analysis_status}
									caseId={page.params.case_id}
									assetId={asset.asset_id.toString()}
									onStatusChange={handleStatusChange}
								/>
							</div>
						</div>
					</div>
				</div>
				
				<!-- Compromise Status with click-to-change functionality -->
				<div class="group bg-card/40 p-4 rounded-lg">
					<div class="flex items-start gap-3">
						<div class="bg-primary/10 p-2 rounded-md text-primary shrink-0">
							<ShieldIcon class="h-4 w-4" />
						</div>
						<div class="min-w-0 flex-1">				
							<p class="text-sm font-medium text-muted-foreground">Compromise Status</p>
							<div class="mt-1">
								<CompromiseStatus 
									status={asset.asset_compromise_status_id || 3} 
									caseId={page.params.case_id}
									assetId={asset.asset_id.toString()}
									onStatusChange={handleCompromiseStatusChange}
								/>
							</div>
						</div>
					</div>
				</div>
			{/if}
		</div>
	</section>

	<!-- Description -->
	<section>
		<div class="flex items-center gap-2 mb-4 border-b pb-2">
			<FileTextIcon class="h-5 w-5 text-primary" />
			<h2 class="text-lg font-semibold">Description</h2>
		</div>
		
		{#if isEditing && editData}
			<div class="bg-card/40 p-4 rounded-lg">
				<Textarea 
					value={editData.asset_description}
					onchange={(e) => updateField('asset_description', (e.target as HTMLTextAreaElement).value)}
					placeholder="Provide a detailed description of this asset"
					rows={5}
					class="w-full"
				/>
				<p class="text-xs text-muted-foreground mt-2">Markdown formatting is supported</p>
			</div>
		{:else}
			<div class="bg-card/40 p-4 rounded-lg">
				{#if asset.asset_description}
					<div class="prose prose-sm max-w-none">
						{@html descriptionHtml}
					</div>
				{:else}
					<p class="text-muted-foreground italic">No description provided</p>
				{/if}
			</div>
		{/if}
	</section>

	<!-- Network Information -->
	<section>
		<div class="flex items-center gap-2 mb-4 border-b pb-2">
			<NetworkIcon class="h-5 w-5 text-primary" />
			<h2 class="text-lg font-semibold">Network Information</h2>
		</div>
		
		<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
			{#if isEditing && editData}
				<div class="group bg-card/40 p-4 rounded-lg">
					<div class="flex items-start gap-3">
						<div class="bg-primary/10 p-2 rounded-md text-primary shrink-0">
							<NetworkIcon class="h-4 w-4" />
						</div>
						<div class="min-w-0 flex-1">				
							<p class="text-sm font-medium text-muted-foreground">IP Address</p>
							<Input 
								value={editData.asset_ip}
								onchange={(e) => updateField('asset_ip', (e.target as HTMLInputElement).value)}
								class="mt-1" 
								placeholder="e.g. 192.168.1.1" 
							/>
						</div>
					</div>
				</div>
				
				<div class="group bg-card/40 p-4 rounded-lg">
					<div class="flex items-start gap-3">
						<div class="bg-primary/10 p-2 rounded-md text-primary shrink-0">
							<GlobeIcon class="h-4 w-4" />
						</div>
						<div class="min-w-0 flex-1">				
							<p class="text-sm font-medium text-muted-foreground">Domain</p>
							<Input 
								value={editData.asset_domain}
								onchange={(e) => updateField('asset_domain', (e.target as HTMLInputElement).value)}
								class="mt-1" 
								placeholder="e.g. example.com" 
							/>
						</div>
					</div>
				</div>
			{:else}
				{@render fieldWithIcon('IP Address', asset.asset_ip || 'N/A', NetworkIcon)}
				{@render fieldWithIcon('Domain', asset.asset_domain || 'N/A', GlobeIcon)}
			{/if}
		</div>
	</section>
</div>
	

{#snippet fieldWithIcon(label: string, value: string | number, Icon: any, hint: string | null = null)}
	<div class="group bg-card/40 p-4 rounded-lg">
		<div class="flex items-start gap-3">
			<div class="bg-primary/10 p-2 rounded-md text-primary shrink-0">
				<Icon class="h-4 w-4" />
			</div>
			<div class="min-w-0 flex-1">				
				<p class="text-sm font-medium text-muted-foreground">{label}</p>
				<div class="flex items-center gap-1">
					<p class="font-semibold text-foreground break-all">{value}</p>
					{#if value && value.toString().length > 0 && value !== 'N/A'}
						<ClipboardCopy value={value.toString()}/>
					{/if}
				</div>
				{#if hint}
					<p class="text-xs text-muted-foreground mt-1">{hint}</p>
				{/if}
			</div>
		</div>
	</div>
{/snippet}

<style>
	section {
		position: relative;
	}
	
	section::after {
		content: '';
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		pointer-events: none;
		background: linear-gradient(to right, transparent, transparent);
		opacity: 0;
		transition: opacity 0.3s ease;
	}
	
	section:hover::after {
		opacity: 0.5;
	}
</style>