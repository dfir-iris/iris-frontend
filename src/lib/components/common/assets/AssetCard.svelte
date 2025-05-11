<script lang="ts">
  import { 
    Server, 
    Globe, 
    Laptop, 
    Network,
    Shield,
    Database,
    HardDrive,
    Smartphone,
    Printer,
    Router,
    Cpu,
    Cloud,
    Users,
    Mail,
    FileText,
    Lock,
    Cog,
    HelpCircle,
    BiohazardIcon,
    ChevronDown,
    ChevronUp
  } from 'lucide-svelte';
  import { Badge } from '$lib/components/ui/badge';
  import { Button } from '$lib/components/ui/button';
  import ClipboardCopy from '$lib/components/ui/clipboard-copy/clipboard-copy.svelte';
  import type { Asset } from '$lib/types/resources/asset';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import StatusBadge from '$lib/components/ui/badge/status-badge.svelte';
  import TagDisplay from '../tag/TagDisplay.svelte';
  import { marked } from 'marked';

  export let asset: Asset;
  export let isSelected: boolean = false;

  // Asset type to icon mapping
  const assetTypeIcons = {
    server: Server,
    domain: Globe,
    website: Globe,
    workstation: Laptop,
    network: Network,
    firewall: Shield,
    database: Database,
    storage: HardDrive,
    mobile: Smartphone,
    printer: Printer,
    router: Router,
    switch: Router,
    iot: Cpu,
    cloud: Cloud,
    account: Users,
    email: Mail,
    document: FileText,
    application: Cog,
    security: Lock,
    // Add more mappings as needed
  };
  
  // Get asset type icon
  function getAssetTypeIcon(typeName: string) {
    
    // Check for exact matches first
    if (typeName in assetTypeIcons) {
      return assetTypeIcons[typeName as keyof typeof assetTypeIcons];
    }
    
    // Check for partial matches
    for (const [key, value] of Object.entries(assetTypeIcons)) {
      if (typeName.includes(key)) {
        return value;
      }
    }
    
    // Fallback to a generic icon for unknown types
    return HelpCircle;
  }

  // Computed properties
  $: AssetTypeIcon = getAssetTypeIcon(asset.asset_type?.asset_name.toLowerCase() || '');  
  $: hasIocs = (asset.iocs ?? []).length > 0;
  $: hasTags = asset.asset_tags?.split(',')?.length - 1 >= 0;
  $: assetIp = asset.asset_ip || '';
  $: assetDomain = asset.asset_domain || '';
  $: isCompromised = asset.asset_compromise_status_id === 1;
  $: assetDescription = asset.asset_description || '';
  $: parsedDescription = assetDescription ? marked(assetDescription) : '';
  
  // State for description expansion
  let isDescriptionExpanded = false;
  
  // Toggle description expansion
  function toggleDescription(e) {
    e.stopPropagation(); // Prevent card click
    isDescriptionExpanded = !isDescriptionExpanded;
  }

  // Handle click to navigate to asset details
  function handleClick() {
    goto(`/case/${page.params.case_id}/assets/${asset.asset_id}`);
  }
</script>

<button type="button" 
  class="w-full text-left rounded-xl border p-3 text-sm transition-all duration-200 ease-in-out hover:bg-accent/100 group {
    isSelected
      ? 'bg-accent text-accent-foreground border-primary/30'
      : 'bg-background hover:bg-background/80'
  }"
  onclick={handleClick}
  aria-label={`View details for asset ${asset.asset_name}`}
>
  <!-- Asset header with name and status -->
  <div class="flex items-center justify-between">
    <div class="flex items-center gap-2 w-full overflow-hidden">
      <div 
        class={`flex h-8 w-8 items-center justify-center rounded-full ${
          isSelected ? 'bg-primary/20' : 'bg-muted'
        }`}
      >
        <AssetTypeIcon
          size={16} 
          class={isCompromised ? 'text-red-500' : (isSelected ? 'text-primary' : 'text-muted-foreground')} 
        />
      </div>
      
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-1 group">
          <span class="truncate text-base font-semibold">
            {asset.asset_name}
          </span>
          
          <ClipboardCopy 
            value={asset.asset_name} 
            tooltipText="Copy asset name" 
            className="ml-1 opacity-0 group-hover:opacity-100"
          />
        </div>
        
        <div class="text-xs text-muted-foreground truncate">
          {asset.asset_type?.asset_name || asset.asset_type_id || 'Unknown type'}
        </div>
      </div>
    </div>
    
    <div class="flex items-center gap-1 flex-shrink-0 ml-2">
      {#if isCompromised}
        <Badge variant="compromised">Compromised</Badge>
      {/if}
      <!-- Analysis Status Badge -->
      {#if asset.analysis_status}
        <div class="flex-shrink-0">
          <div class={`px-1.5 py-0.5 rounded-md text-xs font-medium flex items-center gap-1`}>
            <StatusBadge status={asset.analysis_status.name} icon_only={true} prefix={"Analysis"} />
          </div>
        </div>
      {/if}
      
      {#if hasIocs}
        <Badge tooltip="Contains IOCs" icon={BiohazardIcon} variant="secondary">{asset.iocs?.length}</Badge>
      {/if}
    </div>
  </div>
  
  <!-- Asset Description (if available) -->
  {#if assetDescription}
    <div class="mt-3 mb-2 bg-muted/30 rounded-lg p-2">      
      <div 
        class={`prose prose-sm max-w-none text-xs overflow-hidden transition-all duration-200 ${
          isDescriptionExpanded ? 'max-h-64 overflow-y-auto' : 'max-h-16'
        }`}
      >
        {@html parsedDescription}
      </div>
      
      {#if !isDescriptionExpanded && assetDescription.length > 100}
        <Button 
          variant="link"
          type="button"
          class="text-xs text-primary hover:underline mt-1"
          onclick={toggleDescription}
        >
          Show more
      </Button>
      {/if}
    </div>
  {/if}
  
  <!-- Asset details (IP/Domain and Tags) -->
  <div class="flex flex-col mt-4">
    <!-- IP and Domain section -->
    {#if assetIp || assetDomain}
      <div class="flex flex-wrap gap-2 mb-2">
        {#if assetIp}
          <div class="inline-flex items-center gap-1 border border-dashed px-2 py-1 rounded-md text-xs font-mono group">
            <Network class="h-3 w-3 text-muted-foreground" />
            <span class="truncate">{assetIp}</span>
            <ClipboardCopy 
              value={assetIp} 
              className="ml-1 hidden group-hover:inline-block"
            />
          </div>
        {/if}
        
        {#if assetDomain}
          <div class="inline-flex items-center gap-1 border border-dashed px-2 py-1 rounded-md text-xs font-mono group">
            <Globe class="h-3 w-3 text-muted-foreground" />
            <span class="truncate">{assetDomain}</span>
            <ClipboardCopy 
              value={assetDomain} 
              className="ml-1 hidden group-hover:inline-block"
            />
          </div>
        {/if}
      </div>
    {/if}
    
    <!-- Tags section -->
    {#if hasTags}
      <div class="flex flex-wrap gap-1 text-xs">
        <TagDisplay 
          tags={asset.asset_tags} 
          size="default"
        />
      </div>
    {/if}
  </div>
</button>

<style>
  /* Ensure proper styling for the markdown content */
  :global(.prose) {
    @apply text-foreground;
  }
  
  :global(.prose a) {
    @apply text-primary hover:underline;
  }
  
  :global(.prose p) {
    @apply my-1;
  }
  
  :global(.prose ul, .prose ol) {
    @apply pl-5 my-1;
  }
  
  :global(.prose li) {
    @apply my-0.5;
  }
  
  :global(.prose h1, .prose h2, .prose h3, .prose h4) {
    @apply font-semibold my-2;
  }
  
  :global(.prose code) {
    @apply bg-muted/70 px-1 py-0.5 rounded text-xs font-mono;
  }
  
  :global(.prose pre) {
    @apply bg-muted/70 p-2 rounded my-2 overflow-x-auto;
  }
</style>