<script lang="ts">
  import { 
    ShieldIcon, 
    CopyIcon, 
    ExternalLinkIcon,
    HashIcon,
    AtSignIcon,
    GlobeIcon,
    FileIcon,
    UserIcon,
    ServerIcon,
    CodeIcon,
    DatabaseIcon,
    LinkIcon
  } from 'lucide-svelte';
  import { Badge } from '$lib/components/ui/badge';
  import { Button } from '$lib/components/ui/button';
  import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '$lib/components/ui/tooltip';
  import { toast } from '$lib/components/ui/toast';
  import { cn } from '$lib/utils';
  import type { IOC } from '$lib/types/resources/ioc';
  
  let { ioc, compact = false }: { ioc: IOC, compact?: boolean } = $props();
  
  // Function to get the appropriate icon for an IOC type
  function getIOCTypeIcon(typeName: string) {
    const type = typeName.toLowerCase();
    
    if (type.includes('ip')) return GlobeIcon;
    if (type.includes('email')) return AtSignIcon;
    if (type.includes('domain') || type.includes('hostname')) return GlobeIcon;
    if (type.includes('url')) return LinkIcon;
    if (type.includes('hash') || type.includes('md5') || type.includes('sha')) return HashIcon;
    if (type.includes('file')) return FileIcon;
    if (type.includes('account') || type.includes('user')) return UserIcon;
    if (type.includes('registry')) return DatabaseIcon;
    if (type.includes('mutex')) return CodeIcon;
    if (type.includes('server')) return ServerIcon;
    
    return ShieldIcon;
  }
  
  // Function to get TLP color classes
  function getTLPColorClasses(tlpName: string) {
    switch (tlpName.toLowerCase()) {
      case 'red':
        return 'bg-red-500/10 text-red-500 border-red-500/20';
      case 'amber':
        return 'bg-amber-500/10 text-amber-500 border-amber-500/20';
      case 'green':
        return 'bg-green-500/10 text-green-500 border-green-500/20';
      case 'white':
        return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
      default:
        return 'bg-gray-500/10 text-gray-500 border-gray-500/20';
    }
  }
  
  // Function to copy IOC value to clipboard
  function copyToClipboard() {
    navigator.clipboard.writeText(ioc.ioc_value).then(() => {
      toast({
        title: "Copied to clipboard",
        description: "IOC value has been copied",
        variant: "success"
      });
    }).catch(err => {
      console.error('Failed to copy:', err);
      toast({
        title: "Copy failed",
        description: "Could not copy to clipboard",
        variant: "destructive"
      });
    });
  }
  
  // Function to format IOC value for display
  function formatIOCValue(value: string, type: string) {
    // For hash values, show only first and last few characters
    if (type.includes('hash') || type.includes('md5') || type.includes('sha')) {
      if (value.length > 16) {
        return `${value.substring(0, 8)}...${value.substring(value.length - 8)}`;
      }
    }
    
    // For filename|hash format, split and format
    if (type.includes('|')) {
      const parts = value.split('|');
      if (parts.length === 2) {
        return `${parts[0]} | ${parts[1].substring(0, 8)}...`;
      }
    }
    
    return value;
  }
</script>

<div class={cn(
  "bg-card rounded-lg border p-4 hover:border-border/80 transition-colors",
  compact ? "p-3" : "p-4"
)}>
  <div class="flex items-start gap-3">
    <!-- Icon based on IOC type -->
    <div class="bg-primary/10 p-2 rounded-md text-primary shrink-0">
      <svelte:component this={getIOCTypeIcon(ioc.ioc_type.type_name)} class={cn(
        compact ? "h-4 w-4" : "h-5 w-5"
      )} />
    </div>
    
    <div class="min-w-0 flex-1">
      <div class="flex flex-wrap items-center justify-between gap-2 mb-1">
        <!-- IOC Type -->
        <span class={cn(
          "font-medium",
          compact ? "text-sm" : "text-base"
        )}>
          {ioc.ioc_type.type_name}
        </span>
        
        <!-- TLP Badge -->
        <Badge class={cn(
          "px-2 py-0.5 capitalize border",
          getTLPColorClasses(ioc.tlp.tlp_name)
        )}>
          TLP:{ioc.tlp.tlp_name}
        </Badge>
      </div>
      
      <!-- IOC Value -->
      <div class="flex items-center gap-2 mb-2">
        <p class={cn(
          "font-mono break-all",
          compact ? "text-sm" : "text-base"
        )}>
          {#if compact}
            {formatIOCValue(ioc.ioc_value, ioc.ioc_type.type_name)}
          {:else}
            {ioc.ioc_value}
          {/if}
        </p>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger>
              <Button 
                variant="ghost" 
                size="icon" 
                class="h-6 w-6" 
                onclick={copyToClipboard}
              >
                <CopyIcon class="h-3.5 w-3.5" />
                <span class="sr-only">Copy to clipboard</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Copy to clipboard</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
      
      {#if !compact && ioc.ioc_description}
        <p class="text-sm text-muted-foreground mb-3">
          {ioc.ioc_description}
        </p>
      {/if}
      
      {#if !compact && ioc.ioc_tags}
        <div class="flex flex-wrap gap-1.5 mt-2">
          {#each ioc.ioc_tags.split(',') as tag}
            <Badge variant="outline" class="text-xs">
              {tag.trim()}
            </Badge>
          {/each}
        </div>
      {/if}
    </div>
  </div>
</div>