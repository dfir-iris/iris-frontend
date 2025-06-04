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
  import { toast } from '$lib/components/ui/toast';
  import { cn } from '$lib/utils';
  import type { Ioc } from '$lib/types/resources/ioc';
  
  let { ioc }: { ioc: Ioc } = $props();
  
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
        return 'text-red-500';
      case 'amber':
        return 'text-amber-500';
      case 'green':
        return 'text-green-500';
      case 'white':
        return 'text-blue-500';
      default:
        return 'text-gray-500';
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
</script>
<div class="flex items-center gap-3 p-2 hover:bg-muted/50 rounded-md transition-colors">
  <!-- Icon based on IOC type -->
  <div class="bg-primary/10 p-1.5 rounded-md text-primary shrink-0">
    <svelte:component this={getIOCTypeIcon(ioc.ioc_type.type_name)} class="h-3.5 w-3.5" />
  </div>
  
  <!-- IOC Value -->
  <div class="min-w-0 flex-1 font-mono text-sm truncate">
    {ioc.ioc_value}
  </div>
  
  <!-- Type Badge -->
  <Badge variant="outline" class="text-xs px-1.5 py-0">
    {ioc.ioc_type.type_name}
  </Badge>
  
  <!-- TLP Indicator -->
  <div class={cn(
    "text-xs uppercase font-medium",
    getTLPColorClasses(ioc.tlp.tlp_name)
  )}>
    {ioc.tlp.tlp_name}
  </div>
  
  <!-- Copy Button -->
  <Button 
    variant="ghost" 
    size="icon" 
    class="h-6 w-6 opacity-50 hover:opacity-100" 
    onclick={copyToClipboard}
  >
    <CopyIcon class="h-3 w-3" />
    <span class="sr-only">Copy to clipboard</span>
  </Button>
</div>