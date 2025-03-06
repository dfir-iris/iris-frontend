<script lang="ts">
	import { marked } from 'marked';
	import type { Asset } from '$lib/types/resources/asset';
	import { 
		ServerIcon, 
		GlobeIcon, 
		CalendarIcon, 
		UserIcon,
		TagIcon,
		NetworkIcon,
		FileTextIcon,
		AlertCircleIcon,
		CheckCircleIcon
	} from 'lucide-svelte';

	let { asset }: { asset: Asset } = $props();
	
	let descriptionHtml = marked(asset.asset_description || 'No description provided');
	
	function formatDate(dateString: string) {
		return new Date(dateString).toLocaleString();
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
			{@render fieldWithIcon('Asset Name', asset.asset_name, ServerIcon)}
			{@render fieldWithIcon('Asset Type', asset.asset_type.asset_name, TagIcon, asset.asset_type.asset_description)}
			{@render fieldWithIcon('Analysis Status', asset.analysis_status.name, CheckCircleIcon)}
			{@render fieldWithIcon('Date Added', formatDate(asset.date_added), CalendarIcon)}
			{@render fieldWithIcon('Last Updated', formatDate(asset.date_update), CalendarIcon)}
			{@render fieldWithIcon('Added By', `User ID: ${asset.user_id}`, UserIcon)}
		</div>
	</section>

	<!-- Description -->
	<section>
		<div class="flex items-center gap-2 mb-4 border-b pb-2">
			<FileTextIcon class="h-5 w-5 text-primary" />
			<h2 class="text-lg font-semibold">Description</h2>
		</div>
		
		<div class="bg-card/40 p-4 rounded-lg">
			{#if asset.asset_description}
				<div class="prose prose-sm max-w-none">
					{@html descriptionHtml}
				</div>
			{:else}
				<p class="text-muted-foreground italic">No description provided</p>
			{/if}
		</div>
	</section>

	<!-- Network Information -->
	<section>
		<div class="flex items-center gap-2 mb-4 border-b pb-2">
			<NetworkIcon class="h-5 w-5 text-primary" />
			<h2 class="text-lg font-semibold">Network Information</h2>
		</div>
		
		<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
			{@render fieldWithIcon('IP Address', asset.asset_ip || 'N/A', NetworkIcon)}
			{@render fieldWithIcon('Domain', asset.asset_domain, GlobeIcon)}
		</div>
	</section>
</div>
	

{#snippet fieldWithIcon(label: string, value: string | number, Icon, hint: string | null = null)}
	<div class="bg-card/40 p-4 rounded-lg">
		<div class="flex items-start gap-3">
			<div class="bg-primary/10 p-2 rounded-md text-primary shrink-0">
				<Icon class="h-4 w-4" />
			</div>
			<div>
				<p class="text-sm font-medium text-muted-foreground">{label}</p>
				<p class="font-semibold text-foreground">{value || 'N/A'}</p>
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