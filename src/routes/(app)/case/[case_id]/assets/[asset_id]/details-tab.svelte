<script lang="ts">
	import { marked } from 'marked';
	import type { Asset } from '$lib/types/resources/asset';
	import { 
		ServerIcon, 
		GlobeIcon, 
		TagIcon,
		NetworkIcon,
		FileTextIcon,
		CheckCircleIcon,
		CopyIcon
	} from 'lucide-svelte';
	import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '$lib/components/ui/tooltip';
	import Button from '$lib/components/ui/button/button.svelte';


	let { asset }: { asset: Asset } = $props();
	
	let descriptionHtml = marked(asset.asset_description || 'No description provided');

	function copyToClipboard(text: string) {
		navigator.clipboard.writeText(text.toString());
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
					<TooltipProvider>
						<Tooltip>
							<TooltipTrigger>
								<Button 
									variant="ghost" 
									size="icon" 
									class="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity" 
									onclick={() => copyToClipboard(value)}
								>
									<CopyIcon class="h-3.5 w-3.5" />
								</Button>
							</TooltipTrigger>
							<TooltipContent>
								<p class="text-xs">Copy to clipboard</p>
							</TooltipContent>
						</Tooltip>
					</TooltipProvider>
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