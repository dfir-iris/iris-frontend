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
    TagIcon,
  } from 'lucide-svelte';
  import { Badge } from '$lib/components/ui/badge';
  import ClipboardCopy from '$lib/components/ui/clipboard-copy/clipboard-copy.svelte';
  import type { Asset } from '$lib/types/resources/asset';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
	import StatusBadge from '$lib/components/ui/badge/status-badge.svelte';

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
  function getAssetTypeIcon(asset: Asset) {
    const typeName = asset.asset_type?.asset_name?.toLowerCase() || '';
    
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
  const AssetTypeIcon = getAssetTypeIcon(asset);
  $: hasIocs = (asset.iocs ?? []).length > 0;
  $: hasTags = asset.asset_tags?.split(',')?.length - 1 > 0;
  $: assetIp = asset.asset_ip || '';
  $: assetDomain = asset.asset_domain || '';
  $: isCompromised = asset.asset_compromise_status_id === 1;
  // Function to get status icon


  // Handle click to navigate to asset details
  function handleClick() {
    goto(`/case/${page.params.case_id}/assets/${asset.asset_id}`);
  }
</script>

<button type="button" 
  class="w-full text-left rounded-xl border p-3 text-sm shadow transition-all duration-200 ease-in-out hover:scale-[1.01] hover:shadow-md group {
    isSelected
      ? 'bg-accent text-accent-foreground border-primary/30'
      : 'bg-background hover:bg-background/80'
  }"
  onclick={handleClick}
  aria-label={`View details for asset ${asset.asset_name}`}
>
  <!-- Asset header with name and status -->
  <div class="flex items-center justify-between mb-4">
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
  
  <!-- Asset details (IP/Domain) -->
  <div class="flex flex-col">
    <div class="flex flex-wrap gap-2">
      {#if assetIp}
        <div class="inline-flex items-center gap-1 bg-muted/50 px-2 py-1 rounded-md text-xs font-mono group">
          <Network class="h-3 w-3 text-muted-foreground" />
          <span class="truncate">{assetIp}</span>
          <ClipboardCopy 
            value={assetIp} 
            className="opacity-0 group-hover:opacity-100 ml-1"
          />
        </div>
      {/if}
      
      {#if assetDomain}
        <div class="inline-flex items-center gap-1 bg-muted/50 px-2 py-1 rounded-md text-xs font-mono group">
          <Globe class="h-3 w-3 text-muted-foreground" />
          <span class="truncate">{assetDomain}</span>
          <ClipboardCopy 
            value={assetDomain} 
            className="opacity-0 group-hover:opacity-100 ml-1"
          />
        </div>
      {/if}
    </div>
    
    {#if !assetIp && !assetDomain}
      <div class="text-xs italic text-muted-foreground">No address information</div>
    {/if}

    {#if hasTags}
      <div class="flex flex-wrap gap-1 text-xs text-muted-foreground mt-1">
        {#each asset.asset_tags.split(',') as tag}
          {#if tag.trim()}
            <Badge 
              class="text-muted-foreground text-xs" 
              icon={TagIcon} 
              variant="secondary"
            ><span class="ml-2">{tag}</span></Badge>
          {/if}
        {/each}
      </div>
    {/if}
  </div>
</button>