<script lang="ts">
	import Badge from "$lib/components/ui/badge/badge.svelte";
  import { cn } from '$lib/utils';

  
  let { 
    tlp_name 
  }: { 
    tlp_name: string 
  } = $props();

  // TLP Color Classes
  function getTLPColorClasses(tlpName: string | undefined) {
    if (!tlpName) return 'bg-gray-500/10 text-gray-600 border-gray-500/20';
    switch (tlpName.toLowerCase()) {
      case 'red':
        return 'bg-red-500/10 text-red-600 border-red-500/20';
      case 'amber':
        return 'bg-amber-500/10 text-amber-600 border-amber-500/20';
      case 'amber+strict':
        return 'bg-amber-500/10 text-amber-600 border-amber-500/20';
      case 'green':
        return 'bg-green-500/10 text-green-600 border-green-500/20';
      case 'white':
        return 'bg-blue-500/10 text-blue-600 border-blue-500/20';
      default:
        return 'bg-gray-500/10 text-gray-600 border-gray-500/20';
    }
  }

</script>


<Badge
  variant="outline"
  class={cn(
    "text-xs px-1.5 py-0.5 h-auto capitalize border whitespace-nowrap",
    getTLPColorClasses(tlp_name)
  )}
  title={`TLP: ${tlp_name?.toUpperCase()}`}
>
  TLP:{tlp_name}
</Badge>