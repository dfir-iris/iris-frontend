<script lang="ts">
	import { marked } from 'marked';
	import type { Asset } from '$lib/types/resources/asset';
	import { 
		ServerIcon, 
		GlobeIcon, 
		TagIcon,
		NetworkIcon,
		FileTextIcon,
		CheckCircleIcon
	} from 'lucide-svelte';
	import ClipboardCopy from '$lib/components/ui/clipboard-copy/clipboard-copy.svelte';
	import { Input } from '$lib/components/ui/input';
	import { Textarea } from '$lib/components/ui/textarea';

	let { 
		asset, 
		isEditing = false, 
		editData,
		onUpdateEditData = (field, value) => {}
	} = $props<{ 
		asset: Asset;
		isEditing?: boolean;
		editData?: {
			asset_name: string;
			asset_description: string;
			asset_ip: string;
			asset_domain: string;
		};
		onUpdateEditData?: (field: string, value: string) => void;
	}>();
	
	let descriptionHtml = $derived(marked(asset.asset_description || 'No description provided'));
	
	function updateField(field: string, value: string) {
		onUpdateEditData(field, value);
	}
</script>

<div class="space-y-8 p-1">
	<!-- General Information -->
	<section>
		<div class="flex items-center gap-2 mb-4 border-b pb-2">
			<ServerIcon class="h-5 w-5 text-primary" />
			<h2 class="text-lg font-semibold">General Information</h2>
		</div>
		
		<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
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
								onchange={(e) => updateField('asset_name', e.target.value)}
								class="mt-1" 
							/>
						</div>
					</div>
				</div>
			{:else}
				{@render fieldWithIcon('Asset Name', asset.asset_name, ServerIcon)}
			{/if}
			
			{@render fieldWithIcon('Asset Type', asset.asset_type.asset_name, TagIcon, asset.asset_type.asset_description)}
			{@render fieldWithIcon('Analysis Status', asset.analysis_status.name, CheckCircleIcon)}
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
					onchange={(e) => updateField('asset_description', e.target.value)}
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
								onchange={(e) => updateField('asset_ip', e.target.value)}
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
								onchange={(e) => updateField('asset_domain', e.target.value)}
								class="mt-1" 
								placeholder="e.g. example.com" 
							/>
						</div>
					</div>
				</div>
			{:else}
				{@render fieldWithIcon('IP Address', asset.asset_ip || 'N/A', NetworkIcon)}
				{@render fieldWithIcon('Domain', asset.asset_domain, GlobeIcon)}
			{/if}
		</div>
	</section>
</div>
	

{#snippet fieldWithIcon(label: string, value: string | number, Icon, hint: string | null = null)}
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
						<ClipboardCopy value={value}/>
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