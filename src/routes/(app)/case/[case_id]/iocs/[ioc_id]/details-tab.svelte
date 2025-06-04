<script lang="ts">
	import { marked } from 'marked';
	import type { Ioc } from '$lib/types/resources/ioc';
	import { 
		ServerIcon, 
		GlobeIcon, 
		NetworkIcon,
		FileTextIcon,
		CheckCircleIcon,
		ShieldIcon,
		ComponentIcon,
		HashIcon,

		AlarmCheck,

		FileWarningIcon


	} from 'lucide-svelte';
	import ClipboardCopy from '$lib/components/ui/clipboard-copy/clipboard-copy.svelte';
	import { Input } from '$lib/components/ui/input';
	import { Textarea } from '$lib/components/ui/textarea';
  import { iocTypes } from '$lib/stores/ioc-types.store';
	import { analysisStatuses } from '$lib/stores/analysis-status.store';
	import { iocsStore } from '$lib/stores/iocs.store';
	import { TagInput, TagDisplay } from '$lib/components/common/tag';
	import type { Tag } from '$lib/stores/tags.store';
	import { tlpList } from '$lib/stores/tlp.store';
	import TlpBadge from '$lib/components/common/tlp/TlpBadge.svelte';

	let { 
		ioc, 
		isEditing = false, 
		editData,
		onUpdateEditData = (field: string, value: string | number | Tag[]) => {},
		currentTags = [],
		onIocChange = (updatedIoc: Partial<Ioc>) => {}
	} = $props<{ 
		ioc: Ioc;
		isEditing?: boolean;
		editData?: {
			ioc_value: string;
			ioc_description: string;
			ioc_type_id?: number;
      ioc_tlp_id?: number;
			ioc_tags?: string;
		};
		onUpdateEditData?: (field: string, value: string | number | Tag[]) => void;
		currentTags?: Tag[];
		onIocChange?: (updatedIoc: Partial<Ioc>) => void;
	}>();
	
	let descriptionHtml = $derived(marked(ioc.ioc_description || 'No description provided'));
	
	// Initialize stores only once when the component mounts
	let storesInitialized = $state(false);
	
	$effect(() => {
		if (!storesInitialized) {
			// Use Promise.all to fetch both in parallel
			Promise.all([
				iocTypes.fetch(),
				tlpList.fetch() // Also fetch TLP list
			]).then(() => {
				storesInitialized = true;
			});
		}
	});
	
	// Make sure editData has all required fields
	$effect(() => {
		if (isEditing && editData && storesInitialized) {
			if (editData.ioc_type_id === undefined && ioc.ioc_type) {
				onUpdateEditData('ioc_type_id', ioc.ioc_type.type_id);
			}
			
			if (editData.analysis_status_id === undefined && ioc.analysis_status) {
				onUpdateEditData('analysis_status_id', ioc.analysis_status.id);
			}
			
			if (editData.ioc_compromise_status_id === undefined) {
				onUpdateEditData('ioc_compromise_status_id', ioc.ioc_compromise_status_id || 3);
			}
		}
	});
	
	function handleStatusChange(newStatus: any) {
		// Instead of directly modifying ioc, call the callback
		onIocChange({ 
			analysis_status: newStatus
		});
	}
	
	function handleTagsChange(newTags: Tag[]) {
		console.log('Tags changed in details-tab:', newTags);
		// Make sure we're passing an array of Tag objects
		if (Array.isArray(newTags)) {
			onUpdateEditData('ioc_tags', newTags);
		} else {
			console.error('Expected array of tags but got:', newTags);
		}
	}
	
	function handleCompromiseStatusChange(newStatus: any) {
		// Instead of directly modifying ioc, call the callback
		onIocChange({ 
			ioc_compromise_status_id: newStatus.id
		});
	}

	// Function to update a specific field
	function updateField(field: string, value: string | number) {
		if (!isEditing || !ioc || !onUpdateEditData) return;
		
		// Create an update object with just the changed field
		const update = { [field]: value };
		
		// Call the parent's onUpdate function
		onUpdateEditData(field, value);
		
		// If we have the ioc ID, also update the store directly for immediate UI updates
		if (ioc?.ioc_id) {
			const iocId = ioc.ioc_id.toString();
			const existingIoc = iocsStore.getIoc(iocId);
			
			if (existingIoc) {
				// Create a new ioc object with the updated field
				const updatedIoc = {
					...existingIoc,
					...update
				};
				
				// Update the store
				console.log(`Updating ${field} in store from details-tab:`, iocId, updatedIoc);
				iocsStore.updateIoc(iocId, updatedIoc);
			}
		} else {
			console.error('Ioc ID is not available for updating the store');
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
							<p class="text-sm font-medium text-muted-foreground">Value</p>
							<Input 
								value={editData.ioc_value} 
								onchange={(e) => {
									if (e.target) {
										updateField('ioc_value', (e.target as HTMLInputElement).value);
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
							<p class="text-sm font-medium text-muted-foreground">Type</p>
							<select 
								value={editData.ioc_type_id} 
								onchange={(e) => updateField('ioc_type_id', parseInt((e.target as HTMLSelectElement).value))}
								class="mt-1 w-full px-3 py-2 bg-background border border-input rounded-md text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-primary"
							>
								<option value="" disabled>Select ioc type</option>
								{#if storesInitialized && $iocTypes}
									{#each $iocTypes as type}
										<option value={type.type_id}>{type.type_name}</option>
									{/each}
								{/if}
							</select>
							{#if editData.ioc_type_id && storesInitialized && $iocTypes}
								{@const selectedType = $iocTypes.find(t => t.type_id === editData.ioc_type_id)}
							{/if}
						</div>
					</div>
				</div>

        <div class="group bg-card/40 p-4 rounded-lg">
					<div class="flex items-start gap-3">
						<div class="bg-primary/10 p-2 rounded-md text-primary shrink-0">
							<ComponentIcon class="h-4 w-4" />
						</div>
						<div class="min-w-0 flex-1">				
							<p class="text-sm font-medium text-muted-foreground">TLP</p>
							<select 
								value={editData.ioc_tlp_id} 
								onchange={(e) => updateField('ioc_tlp_id', parseInt((e.target as HTMLSelectElement).value))}
								class="mt-1 w-full px-3 py-2 bg-background border border-input rounded-md text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-primary"
							>
								<option value="" disabled>Select TLP</option>
								{#if storesInitialized && $tlpList}
									{#each $tlpList as tlp}
										<option value={tlp.tlp_id}>{tlp.tlp_name}</option>
									{/each}
								{/if}
							</select>
							{#if editData.ioc_tlp_id && storesInitialized && $tlpList}
								{@const selectedTlp = $tlpList.find(t => t.tlp_id === editData.ioc_tlp_id)}
							{/if}
						</div>
					</div>
				</div>

				
			{:else}
				{@render fieldWithIcon('Value', ioc.ioc_value, ServerIcon)}
				{@render fieldWithIcon('Type', ioc.ioc_type?.type_name, ComponentIcon)}
        <div class="group bg-card/40 p-4 rounded-lg">
          <div class="flex items-start gap-3">
            <div class="bg-primary/10 p-2 rounded-md text-primary shrink-0">
              <FileWarningIcon class="h-4 w-4" />
            </div>
            <div class="min-w-0 flex-1">				
              <p class="text-sm font-medium text-muted-foreground">TLP</p>
              <div class="flex items-center gap-1">
                <TlpBadge tlp_name={ioc.tlp?.tlp_name} />
                {#if ioc.tlp?.tlp_name && ioc.tlp?.tlp_name.toString().length > 0 && ioc.tlp?.tlp_name !== 'N/A'}
                  <ClipboardCopy value='TLP:{ioc.tlp?.tlp_name.toString()}'/>
                {/if}
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
					value={editData.ioc_description}
					onchange={(e) => updateField('ioc_description', (e.target as HTMLTextAreaElement).value)}
					placeholder="Provide a detailed description of this ioc"
					rows={5}
					class="w-full"
				/>
				<p class="text-xs text-muted-foreground mt-2">Markdown formatting is supported</p>
			</div>
		{:else}
			<div class="bg-card/40 p-4 rounded-lg">
				{#if ioc.ioc_description}
					<div class="prose prose-sm max-w-none">
						{@html descriptionHtml}
					</div>
				{:else}
					<p class="text-muted-foreground italic">No description provided</p>
				{/if}
			</div>
		{/if}
	</section>

	<section>		
		<div class="grid grid-cols-1">
			<div class="bg-card/40  rounded-lg">
				{#if isEditing}
					<TagInput 
						tags={currentTags} 
						outputFormat="array"
						onchange={handleTagsChange}
						placeholder="Add tags..."
						maxTags={20}
					/>
					<p class="text-xs text-muted-foreground mt-2">Press Enter or comma to add a tag</p>
				{:else}
					{#if ioc.ioc_tags || ioc.tags}
						<TagDisplay 
							tags={ioc.ioc_tags || ioc.tags || []} 
							size="default"
						/>
					{:else}
						<p class="text-muted-foreground italic">No tags</p>
					{/if}
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