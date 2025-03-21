<script lang="ts">
  import { onMount } from 'svelte';
  import { fade, slide } from 'svelte/transition';
  import { 
    ShieldAlertIcon, 
    SearchIcon, 
    FilterIcon, 
    SortAscIcon,
    Loader2Icon,
    AlertTriangleIcon
  } from 'lucide-svelte';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Badge } from '$lib/components/ui/badge';
  import { Skeleton } from '$lib/components/ui/skeleton';
  import { ApiService } from '$lib/services/api.service';
  import { page } from '$app/state';
  import { cn } from '$lib/utils';
  import IOCCard from '$lib/components/common/ioc/IOCCard.svelte';
  import type { Asset } from '$lib/types/resources/asset';
  import type { IOC } from '$lib/types/resources/ioc';
  import { ENDPOINTS } from '$lib/constants/endpoints';
	import IocLinkButton from '$lib/components/common/ioc/IOCLinkButton.svelte';

  let { asset }: { asset: Asset } = $props();
  
  let isLoading = $state(true);
  let error = $state<string | null>(null);
  let iocs = $state<IOC[]>([]);
  let searchQuery = $state('');
  let filteredIocs = $state<IOC[]>([]);
  
  // Fetch IOCs when the component mounts or when the asset changes
  $effect(() => {
    if (asset?.iocs?.length) {
      fetchIOCs();
    } else {
      isLoading = false;
      iocs = [];
      filteredIocs = [];
    }
  });
  
  // Filter IOCs when search query changes
  $effect(() => {
    if (!iocs.length) {
      filteredIocs = [];
      return;
    }
    
    if (!searchQuery.trim()) {
      filteredIocs = [...iocs];
      return;
    }
    
    const query = searchQuery.toLowerCase();
    filteredIocs = iocs.filter(ioc => 
      ioc.ioc_value.toLowerCase().includes(query) || 
      ioc.ioc_type.type_name.toLowerCase().includes(query) ||
      ioc.ioc_description?.toLowerCase().includes(query) ||
      ioc.ioc_tags?.toLowerCase().includes(query)
    );
  });
  
  async function fetchIOCs() {
    if (!asset.iocs || !asset.iocs.length) {
      isLoading = false;
      return;
    }
    
    isLoading = true;
    error = null;
    
    try {
      const caseId = page.params.case_id;
      
      const iocIds = [...asset.iocs].map(ioc => ioc.ioc_id);
      
      // Create the custom condition for the API
      const params = { 
        custom_conditions: JSON.stringify([
          { field: 'ioc_id', operator: 'in', value: iocIds }
        ]) 
      };
      
      // Make the API call
      const response = await ApiService.get(ENDPOINTS.case.ioc.list(caseId, params));
      
      // Check if the response has the expected structure
      if (response && response.data && Array.isArray(response.data)) {
        iocs = response.data;
        filteredIocs = [...iocs];
      } else if (response && response.data && Array.isArray(response.data.data)) {
        // Handle the case where the data is nested in a data property
        iocs = response.data.data;
        filteredIocs = [...iocs];
      } else {
        console.error('Unexpected API response format:', response);
        error = "Failed to load IOCs: Unexpected response format";
      }
    } catch (err) {
      console.error('Error fetching IOCs:', err);
      error = "An error occurred while loading IOCs";
    } finally {
      isLoading = false;
    }
  }
  
  function handleSearch(e: Event) {
    searchQuery = (e.target as HTMLInputElement).value;
  }
  
  // Group IOCs by type for better organization
  function getGroupedIOCs() {
    const grouped = new Map<string, IOC[]>();
    
    filteredIocs.forEach(ioc => {
      const typeName = ioc.ioc_type.type_name;
      if (!grouped.has(typeName)) {
        grouped.set(typeName, []);
      }
      grouped.get(typeName)?.push(ioc);
    });
    
    return grouped;
  }
</script>

<div class="space-y-6">
  <header class="flex flex-col sm:flex-row sm:items-center gap-4">
    <div class="flex items-center gap-2">
      <ShieldAlertIcon class="h-5 w-5 text-primary" />
      <h2 class="text-xl font-semibold">Indicators of Compromise</h2>
    </div>
  
    <div class="flex w-full sm:w-auto sm:ml-auto gap-2 justify-end">
      <div class="relative w-full sm:w-64 md:w-80">
        <SearchIcon class="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input 
          type="search" 
          placeholder="Search IOCs..." 
          class="pl-9 w-full"
          value={searchQuery}
          oninput={handleSearch}
          disabled={isLoading || iocs.length === 0}
        />
      </div>
      <IocLinkButton assetId={asset.asset_id} caseId={asset.case_id} />
    </div>
  </header>
  
  
  {#if isLoading}
    <div class="space-y-4">
      {#each Array(3) as _, i}
        <div class="bg-card rounded-lg border p-4" in:fade={{ delay: i * 100 }}>
          <div class="flex items-center gap-3 mb-3">
            <Skeleton class="h-6 w-6 rounded-full" />
            <Skeleton class="h-5 w-40" />
            <Skeleton class="h-5 w-16 ml-auto" />
          </div>
          <Skeleton class="h-4 w-full mb-2" />
          <Skeleton class="h-4 w-3/4" />
        </div>
      {/each}
    </div>
  {:else if error}
    <div class="bg-destructive/10 border border-destructive/30 rounded-lg p-4 text-destructive" in:fade>
      <div class="flex items-center gap-2 mb-2">
        <AlertTriangleIcon class="h-5 w-5" />
        <h3 class="font-medium">Error Loading IOCs</h3>
      </div>
      <p>{error}</p>
      <Button variant="outline" class="mt-3" onclick={fetchIOCs}>
        Retry
      </Button>
    </div>
  {:else if !asset.iocs || asset.iocs.length === 0}
    <div class="flex flex-col items-center justify-center p-10 text-center bg-muted/30 rounded-lg border border-dashed border-border/50" in:fade>
      <div class="bg-muted/50 p-4 rounded-full mb-4">
        <ShieldAlertIcon class="h-8 w-8 text-muted-foreground/60" />
      </div>
      <h3 class="text-lg font-medium mb-1">No IOCs Found</h3>
      <p class="text-muted-foreground text-sm max-w-md">
        This asset doesn't have any associated Indicators of Compromise.
      </p>
    </div>
  {:else if filteredIocs.length === 0}
    <div class="flex flex-col items-center justify-center p-10 text-center bg-muted/30 rounded-lg border border-dashed border-border/50" in:fade>
      <div class="bg-muted/50 p-4 rounded-full mb-4">
        <SearchIcon class="h-8 w-8 text-muted-foreground/60" />
      </div>
      <h3 class="text-lg font-medium mb-1">No Matching IOCs</h3>
      <p class="text-muted-foreground text-sm max-w-md">
        No IOCs match your search criteria. Try adjusting your search.
      </p>
      <Button variant="outline" class="mt-4" onclick={() => searchQuery = ''}>
        Clear Search
      </Button>
    </div>
  {:else}
    {#if searchQuery}
      <div class="flex items-center gap-2 mb-4 text-sm">
        <span class="text-muted-foreground">Showing results for:</span>
        <Badge variant="secondary" class="px-2 py-1 gap-1">
          {searchQuery}
          <button class="ml-1 hover:text-primary" onclick={() => searchQuery = ''}>×</button>
        </Badge>
      </div>
    {/if}
    
    <div class="space-y-6">
      {#each [...getGroupedIOCs()] as [typeName, typeIocs]}
        <section in:slide={{ duration: 300 }}>
          <h3 class="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2 border-b pb-1">
            <span>{typeName}</span>
            <span class="ml-1.5 inline-flex items-center justify-center h-4 min-w-4 text-[10px] font-medium leading-none data-[state=active]:bg-primary/20 data-[state=active]:text-primary bg-muted text-muted-foreground rounded-sm px-1 transition-colors">
              {typeIocs.length}
            </span>
          </h3>
          
          <div class="grid grid-cols-1 md:grid-cols-1 gap-4">
            {#each typeIocs as ioc (ioc.ioc_id)}
              <IOCCard {ioc} />
            {/each}
          </div>
        </section>
      {/each}
    </div>
  {/if}
</div>