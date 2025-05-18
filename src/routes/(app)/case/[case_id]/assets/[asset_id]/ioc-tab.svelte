<script lang="ts">
  import { onMount } from 'svelte';
  import { fade, slide } from 'svelte/transition';
  import { 
    ShieldAlertIcon, 
    SearchIcon, 
    FilterIcon, 
    SortAscIcon,
    Loader2Icon,
    AlertTriangleIcon,
    Trash2Icon,
    CheckIcon,
    XIcon
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
  import { assetsStore } from '$lib/stores/assets.store';
  import { Checkbox } from '$lib/components/ui/checkbox';
  import { toast } from '$lib/components/ui/toast';
	import { AssetService } from '$lib/services/asset.service';

  let { asset = $bindable() }: { asset: Asset } = $props();
  
  let isLoading = $state(true);
  let error = $state<string | null>(null);
  let iocs = $state<IOC[]>([]);
  let searchQuery = $state('');
  let filteredIocs = $state<IOC[]>([]);
  let needsRefresh = $state(false);
  
  // Selection state
  let selectionMode = $state(false);
  let selectedIOCs = $state<Set<number>>(new Set());
  let isRemoving = $state(false);

  let linkedIocIds = $derived(asset.iocs?.map(ioc => ioc.ioc_id) || []);
  
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
  
  // Add effect to watch for needsRefresh changes
  $effect(() => {
    if (needsRefresh) {
      // First, get the latest asset data from the store to ensure we have the updated IOC list
      const updatedAsset = assetsStore.getAsset(asset.asset_id.toString());
      
      if (updatedAsset) {
        // Update the local asset with the latest data from the store
        asset = updatedAsset;
      }
      
      // Then fetch the IOCs based on the updated asset
      fetchIOCs();
      needsRefresh = false; // Reset the flag after refreshing
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
  
  // Reset selection when filtered IOCs change
  $effect(() => {
    if (selectionMode && filteredIocs.length === 0) {
      exitSelectionMode();
    }
  });
  
  async function fetchIOCs() {
    if (!asset.iocs || !asset.iocs.length) {
      isLoading = false;
      iocs = [];
      filteredIocs = [];
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
  
  // Selection functions
  function toggleSelectionMode() {
    selectionMode = !selectionMode;
    if (!selectionMode) {
      selectedIOCs.clear();
    }
  }
  
  function exitSelectionMode() {
    selectionMode = false;
    selectedIOCs.clear();
  }
  
  function toggleIOCSelection(iocId: string) {
    if (selectedIOCs.has(iocId)) {
      selectedIOCs.delete(iocId);
    } else {
      selectedIOCs.add(iocId);
    }
    
    // Force reactivity update
    selectedIOCs = new Set(selectedIOCs);
  }
  
  function selectAllIOCs() {
    filteredIocs.forEach(ioc => {
      selectedIOCs.add(ioc.ioc_id);
    });
    
    // Force reactivity update
    selectedIOCs = new Set(selectedIOCs);
  }
  
  function deselectAllIOCs() {
    selectedIOCs.clear();
    selectedIOCs = new Set();
  }
  
  // Remove a single IOC
  async function removeIOC(iocId: number) {
    console.log(iocId)
    await removeIOCs([iocId]);
  }
  
  // Remove multiple IOCs
  async function removeIOCs(iocIds: number[]) {
    if (!iocIds.length) return;
    
    isRemoving = true;
    
    try {
      const existingAsset = assetsStore.getAsset(asset.asset_id.toString());
      
      if (existingAsset) {
        // Filter out the IOCs to be removed
        const updatedIOCs = existingAsset.iocs?.filter(ioc => !iocIds.includes(ioc.ioc_id));

        // Create a new asset object with the updated IOCs
        const updatedAsset = {
          ...existingAsset,
          iocs: updatedIOCs
        };
        
        // Update the asset in the store
        assetsStore.updateAsset(asset.asset_id.toString(), updatedAsset);

        const response = await AssetService.updateAsset(asset.case_id, asset.asset_id, {
          ioc_links: updatedIOCs?.map(ioc => ioc.ioc_id)
        });
        
        // Update the local asset
        asset = updatedAsset;
        
        // Refresh the IOC list
        await fetchIOCs();
        
        // Exit selection mode
        exitSelectionMode();
        
        // Show success toast
        toast({
          title: iocIds.length > 1 ? "IOCs removed" : "IOC removed",
          description: `Successfully removed ${iocIds.length} IOC${iocIds.length > 1 ? 's' : ''} from this asset.`,
          variant: "success"
        });
      }
    } catch (err) {
      console.error('Error removing IOCs:', err);
      toast({
        title: "Error",
        description: "Failed to remove IOCs. Please try again.",
        variant: "destructive"
      });
    } finally {
      isRemoving = false;
    }
  }
  
  // Remove selected IOCs
  function removeSelectedIOCs() {
    if (selectedIOCs.size === 0) return;
    removeIOCs([...selectedIOCs]);
  }
</script>

<div class="space-y-6">
  <header class="flex flex-col sm:flex-row sm:items-center gap-4">
    <div class="flex items-center gap-2">
      <ShieldAlertIcon class="h-5 w-5 text-primary" />
      <h2 class="text-xl font-semibold">Indicators of Compromise</h2>
    </div>
  
    <div class="flex w-full sm:w-auto sm:ml-auto gap-2 justify-end">
      {#if selectionMode}
        <div class="flex items-center gap-2 bg-muted/50 rounded-md px-2 py-1 text-sm">
          <span class="font-medium">{selectedIOCs.size} selected</span>
        </div>
                <Button 
          variant="outline" 
          size="sm" 
          onclick={selectAllIOCs}
          disabled={filteredIocs.length === 0 || selectedIOCs.size === filteredIocs.length}
          class="text-xs"
        >
          Select All
        </Button>
        <Button 
          variant="outline" 
          size="sm" 
          onclick={deselectAllIOCs}
          disabled={selectedIOCs.size === 0}
          class="text-xs"
        >
          Deselect All
        </Button>
        <Button 
          variant="destructive" 
          size="sm" 
          onclick={removeSelectedIOCs}
          disabled={selectedIOCs.size === 0 || isRemoving}
          class="text-xs"
        >
          {#if isRemoving}
            <span class="animate-spin mr-1">⟳</span> Removing...
          {:else}
            <Trash2Icon class="h-3.5 w-3.5 mr-1" /> Remove Selected
          {/if}
        </Button>
        <Button 
          variant="ghost" 
          size="sm" 
          onclick={exitSelectionMode}
          class="text-xs"
        >
          <XIcon class="h-3.5 w-3.5 mr-1" /> Cancel
        </Button>
      {:else}
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
        <Button 
          variant="outline" 
          size="sm" 
          onclick={toggleSelectionMode}
          disabled={filteredIocs.length === 0}
          class="whitespace-nowrap"
        >
          <CheckIcon class="h-4 w-4 mr-2" />
          Select
        </Button>
        <IocLinkButton assetId={asset.asset_id} caseId={asset.case_id} bind:hasRefreshed={needsRefresh} alreadyLinkedIocIds={linkedIocIds}/>
      {/if}
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
              <div class="relative group">
                {#if selectionMode}
                  <div class="absolute left-3 top-1/2 -translate-y-1/2 z-10">
                    <Checkbox 
                      checked={selectedIOCs.has(ioc.ioc_id)} 
                      onchange={() => toggleIOCSelection(ioc.ioc_id)}
                      id={`ioc-select-${ioc.ioc_id}`}
                    />
                  </div>
                {/if}
                
                <div class={cn(
                  "relative transition-all duration-200",
                  selectionMode ? "pl-10" : "",
                  selectedIOCs.has(ioc.ioc_id) ? "" : ""
                )}>
                  <IOCCard {ioc} />
                  
                  {#if !selectionMode}
                    <div class="absolute right-3 top-3 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button 
                        variant="destructive" 
                        size="sm" 
                        onclick={() => removeIOC(ioc.ioc_id)}
                        class="h-8 px-2 text-xs"
                      >
                        <Trash2Icon class="h-3.5 w-3.5 mr-1" />
                        Remove
                      </Button>
                    </div>
                  {/if}
                </div>
              </div>
            {/each}
          </div>
        </section>
      {/each}
    </div>
  {/if}
</div>