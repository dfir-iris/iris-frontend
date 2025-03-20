<script lang="ts">
  import { Badge } from '$lib/components/ui/badge';
  import { cn } from '$lib/utils';
  import ClipboardCopy from '$lib/components/ui/clipboard-copy/clipboard-copy.svelte';
  import type { IOC } from '$lib/types/resources/ioc';
  import { TagDisplay } from '../tag';
  
  let { ioc, compact = false }: { ioc: IOC, compact?: boolean } = $props();
  
  // Function to get TLP color classes
  function getTLPColorClasses(tlpName: string) {
    switch (tlpName.toLowerCase()) {
      case 'red':
        return 'bg-red-500/10 text-red-600 border-red-500/20';
      case 'amber':
        return 'bg-amber-500/10 text-amber-600 border-amber-500/20';
      case 'green':
        return 'bg-green-500/10 text-green-600 border-green-500/20';
      case 'white':
        return 'bg-blue-500/10 text-blue-600 border-blue-500/20';
      default:
        return 'bg-gray-500/10 text-gray-600 border-gray-500/20';
    }
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

<div 
  class={cn(
    "rounded-xl border bg-card p-3",
    "transition-all duration-200 hover:shadow-sm hover:border-border"
  )}
>
  <!-- Header: IOC Value and TLP on the same line -->
  <div class="flex items-center justify-between gap-2 mb-2">
    <div 
      class={cn(
        "group flex items-center gap-1.5 bg-muted/40 rounded-md px-2 py-1.5 flex-1",
        "hover:bg-muted/60 transition-colors cursor-default"
      )}
    >
      <code class="font-mono text-foreground/90 break-all text-sm">
        {compact ? formatIOCValue(ioc.ioc_value, ioc.ioc_type.type_name) : ioc.ioc_value}
      </code>
      
      <ClipboardCopy 
        value={ioc.ioc_value} 
        tooltipText="Copy IOC value" 
        className="opacity-0 group-hover:opacity-100 transition-opacity"
      />
    </div>
    
    <!-- TLP Badge on the far right -->
    <Badge 
      variant="outline" 
      class={cn(
        "text-xs px-1.5 py-0 h-5 capitalize border whitespace-nowrap",
        getTLPColorClasses(ioc.tlp.tlp_name)
      )}
    >
      TLP:{ioc.tlp.tlp_name}
    </Badge>
  </div>
  
  <!-- Description with improved styling -->
  {#if !compact && ioc.ioc_description}
    <p class="text-sm text-muted-foreground leading-relaxed mb-2 italic">
      {ioc.ioc_description}
    </p>
  {/if}
  
  <!-- Tags below -->
  {#if !compact && ioc.ioc_tags.length > 0}
    <div class="flex flex-wrap gap-1 pt-1">
      <TagDisplay tags={ioc.ioc_tags || []} size="default" />
    </div>
  {/if}
</div>