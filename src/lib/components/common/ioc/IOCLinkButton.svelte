<script lang="ts">
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Link, ChevronDown, Search, X, CheckSquare, Square } from 'lucide-svelte'; // Added CheckSquare, Square
  import { Popover, PopoverContent, PopoverTrigger } from '$lib/components/ui/popover';
  import { ApiService } from '$lib/services/api.service';
  import { ENDPOINTS } from '$lib/constants/endpoints';
  import { assetsStore } from '$lib/stores/assets.store';
  import type { IOC } from '$lib/types/resources/ioc';
  import { Badge } from '$lib/components/ui/badge';
  import { cn } from '$lib/utils';
	import { AssetService } from '$lib/services/asset.service';
	import { toast } from '$lib/components/ui/toast';
  
  // Props
  let { 
    caseId, 
    assetId = undefined, // Made optional
    alreadyLinkedIocIds = [],
    hasRefreshed = $bindable(),
    mode = 'link', // Corrected: Default value for the prop
    selectedForLinking = $bindable<IOC[]>([]) // Bindable for select mode
  }: { 
    caseId: number, 
    assetId?: number, 
    alreadyLinkedIocIds?: number[],
    hasRefreshed?: boolean,
    mode?: 'link' | 'select', // Mode is a prop
    selectedForLinking?: IOC[]
  } = $props();
  
  // Local state
  let showIOCDropdown = $state(false);
  let iocList = $state<IOC[]>([]);
  let isLoading = $state(false);
  let error = $state<string | null>(null);
  let searchTerm = $state('');
  let searchTimeout: NodeJS.Timeout | null = $state(null);
  let currentPage = $state(1);
  let hasMorePages = $state(true);
  let initialFetchDone = $state(false);

  // Internal selection state for 'select' mode
  let internalSelectedIocMap = $state<Map<number, IOC>>(new Map());

  // Effect to initialize internalSelectedIocMap from selectedForLinking prop
  // when in select mode and the dropdown opens.
  $effect(() => {
    if (mode === 'select' && showIOCDropdown) {
      const newMap = new Map<number, IOC>();
      selectedForLinking.forEach(ioc => newMap.set(ioc.ioc_id, ioc));
      // Only assign if different to prevent re-triggering unnecessarily if parent passes same array instance
      if (newMap.size !== internalSelectedIocMap.size || 
          !Array.from(newMap.keys()).every(key => internalSelectedIocMap.has(key) && internalSelectedIocMap.get(key) === newMap.get(key))) {
        internalSelectedIocMap = newMap;
      }
    }
  });
  

  let displayableIocs = $state<IOC[]>([]); // This will hold the filtered IOCs based on search term
  // Effect to filter IOCs based on search term
  $effect(() => {
    if (searchTerm) {
      displayableIocs = iocList.filter(ioc => 
        ioc.ioc_value.toLowerCase().includes(searchTerm.toLowerCase()) || 
        (ioc.ioc_description && ioc.ioc_description.toLowerCase().includes(searchTerm.toLowerCase()))
      );
    } else {
      // Remove the IOCs that are already linked if in link mode
      if (mode === 'link') {
        displayableIocs = iocList.filter(ioc => !alreadyLinkedIocIds.includes(ioc.ioc_id));
      } else {
        // In select mode, show all IOCs
        displayableIocs = iocList;
      }
    }
  });
  
  // Function to build search conditions
  function buildSearchConditions(term: string) {
    if (!term) return [];
    return [
      { field: "ioc_value", operator: "like", value: term },
      { field: "ioc_description", operator: "like", value: term }
    ];
  }
  
  // Function to fetch IOCs related to the case
  async function fetchCaseIOCs(page = 1, resetList = true) {
    // Prevent duplicate initial fetches
    if (page === 1 && resetList && isLoading) {
      return;
    }
    
    isLoading = true;
    error = null;
    
    try {
      const customConditions = buildSearchConditions(searchTerm);
      const params: Record<string, any> = { 
        page: page, 
        per_page: 10 // Assuming per_page is constant or managed elsewhere if dynamic
      };

      if (customConditions.length > 0) {
        params.custom_conditions = JSON.stringify(customConditions);
      }
      
      // Assuming ApiService.get returns an object matching the provided JSON structure
      // where 'data' contains the array of items and 'next_page' indicates pagination.
      const response = await ApiService.get<{
        data: IOC[]; // This is the array of IOCs
        next_page: string | null;
        // include other pagination fields if needed, e.g., total, current_page
      }>(ENDPOINTS.case.ioc.list(caseId, params));
      
      const newIocs = response.data.data || []; // Corrected: IOCs are directly in response.data
      
      // Check if there are more pages using next_page from the response
      hasMorePages = response.next_page !== null;
      
      // Update the list
      if (resetList) {
        iocList = newIocs;
      } else {
        iocList = [...iocList, ...newIocs];
      }

      console.log('Fetched IOCs:', iocList);
      
      initialFetchDone = true;
    } catch (err) {
      console.error('Error fetching IOCs:', err);
      error = 'Failed to load IOCs. Please try again.';
    } finally {
      isLoading = false;
    }
  }
  
  // Function to handle search input
  function handleSearchInput() {
    // Clear previous timeout
    if (searchTimeout) {
      clearTimeout(searchTimeout);
    }
    
    // Set new timeout for debouncing
    searchTimeout = setTimeout(() => {
      currentPage = 1;
      fetchCaseIOCs(1, true);
    }, 300);
  }
  
  // Function to clear search
  function clearSearch() {
    searchTerm = '';
    currentPage = 1;
    fetchCaseIOCs(1, true);
  }
  
  // Function to load more results
  function loadMore() {
    if (hasMorePages && !isLoading) {
      currentPage += 1;
      fetchCaseIOCs(currentPage, false);
    }
  }
  
  // Function to link an IOC to the asset (only for 'link' mode)
  async function linkIOCToAsset(ioc: IOC) {
    if (mode !== 'link' || !assetId) return; // Ensure assetId is present for link mode

    try {
      const existingAsset = assetsStore.getAsset(assetId.toString()); // Ensure assetId is string for store
      
      if (existingAsset) {
        // Create a new asset object with the updated field
        const updatedAsset = {
          ...existingAsset,
          iocs: [...(existingAsset.iocs || []), { ioc_id: ioc.ioc_id}]
        };
        
        const response = await AssetService.updateAsset(caseId, assetId, {
          ioc_links: updatedAsset.iocs.map(ioc => ioc.ioc_id)
        });

        if (response?.data) {
          assetsStore.updateAsset(assetId, response.data);
          hasRefreshed = true;
        }
        
        // Close the dropdown
        showIOCDropdown = false;

        // Show a success toast
        toast({
          title: 'IOC linked',
          description: 'The IOC has been successfully linked to the asset.',
          variant: 'success'
        });
      }
    } catch (err) {
      console.error('Error linking IOC:', err);
      error = 'Failed to link IOC. Please try again.';
    }
  }
  
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
  
  // Function to handle IOC click/selection based on mode
  function handleIOCInteraction(ioc: IOC) {
    if (mode === 'link') {
      linkIOCToAsset(ioc);
    } else { // mode === 'select'
      const currentMap = new Map(internalSelectedIocMap);
      if (currentMap.has(ioc.ioc_id)) {
        currentMap.delete(ioc.ioc_id);
      } else {
        currentMap.set(ioc.ioc_id, ioc);
      }
      internalSelectedIocMap = currentMap;
      // Do not update selectedForLinking here directly. It's updated when the popover closes.
    }
  }
  
  // Effect to fetch IOCs when dropdown opens and to sync internal map to prop when it closes.
  $effect(() => {
    if (showIOCDropdown && !initialFetchDone) {
      fetchCaseIOCs();
    }

    // When dropdown closes in select mode, update the bindable prop.
    if (!showIOCDropdown && mode === 'select') {
      const newSelectionArray = Array.from(internalSelectedIocMap.values());
      
      // Check if an update to the prop is actually needed to avoid loops.
      // This compares the content of the arrays based on IOC IDs.
      let needsUpdate = selectedForLinking.length !== newSelectionArray.length;
      if (!needsUpdate) {
        const currentPropIds = new Set(selectedForLinking.map(i => i.ioc_id));
        for (const ioc of newSelectionArray) {
          if (!currentPropIds.has(ioc.ioc_id)) {
            needsUpdate = true;
            break;
          }
        }
      }

      if (needsUpdate) {
        selectedForLinking = newSelectionArray;
      }
    }
  });
</script>

<!-- Link IOC button -->
<div class="flex gap-2">  
  <Popover bind:open={showIOCDropdown}>
    <PopoverTrigger>
      <Button 
        variant="outline" 
        size="sm" 
        class="whitespace-nowrap"
        onclick={() => { 
          // Ensure fetch is called if popover is opening and data hasn't been fetched.
          // The $effect also handles this, but this is an additional safeguard for click.
          if (!showIOCDropdown && !initialFetchDone) { // Check !showIOCDropdown because `bind:open` updates it after click handler
             // This logic might be redundant if the $effect on showIOCDropdown is reliable.
             // Consider if fetchCaseIOCs() should be called here or solely rely on the $effect.
             // For now, let the $effect manage fetching on open.
          }
        }}
      >
        <Link class="h-4 w-4 mr-2" />
        {#if mode === 'link'}
          Link IOC
        {:else}
          Select IOCs 
          {#if internalSelectedIocMap.size > 0}
            ({internalSelectedIocMap.size})
          {/if}
        {/if}
        <ChevronDown class="h-3 w-3 ml-1 opacity-70" />
      </Button>
    </PopoverTrigger>
    
    <PopoverContent class="w-80 p-0" align="end">
      <div class="p-2 border-b">
        <h4 class="font-medium text-sm">
          {#if mode === 'link'}
            Link IOC to Asset
          {:else}
            Select IOCs to Link
          {/if}
        </h4>
        <p class="text-xs text-muted-foreground">
          {#if mode === 'link'}
            Select an IOC to link to this asset
          {:else}
            Choose IOCs from the list below
          {/if}
        </p>
      </div>
      
      <!-- Search input with clear button -->
      <div class="p-2 border-b">
        <div class="relative">
          <Search class="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search IOCs..."
            class={cn("pl-8 h-9 text-sm", searchTerm ? "pr-8" : "")}
            bind:value={searchTerm}
            oninput={handleSearchInput}
          />
          {#if searchTerm}
            <button 
              type="button"
              class="absolute right-2 top-2.5 text-muted-foreground hover:text-foreground transition-colors"
              onclick={clearSearch}
              aria-label="Clear search"
            >
              <X class="h-4 w-4" />
            </button>
          {/if}
        </div>
      </div>
      
      <div class="max-h-[300px] overflow-y-auto" onscroll={(e) => {
        const target = e.target as HTMLDivElement;
        if (target.scrollHeight - target.scrollTop <= target.clientHeight + 50) {
          loadMore();
        }
      }}>
        {#if isLoading && iocList.length === 0}
          <div class="flex justify-center py-4">
            <div class="animate-spin h-5 w-5 border-2 border-primary border-t-transparent rounded-full"></div>
          </div>
        {:else if error}
          <div class="text-destructive text-xs p-3">{error}</div>
        {:else if iocList.length === 0 && !searchTerm }
          <div class="text-center text-muted-foreground text-xs p-3">
            No IOCs found for this case.
          </div>
        {:else if displayableIocs.length === 0}
          <div class="text-center text-muted-foreground text-xs p-3">
            {#if mode === 'link'}
              {searchTerm ? 'No unlinked IOCs match your search.' : 'All available IOCs for this case are already linked or none exist.'}
            {:else}
              {searchTerm ? 'No IOCs match your search.' : 'No IOCs found for this case.'}
            {/if}
          </div>
        {:else}
          <div class="py-1">
            {#each displayableIocs as ioc}
              {@const isSelectedInSelectMode = mode === 'select' && internalSelectedIocMap.has(ioc.ioc_id)}
              <button 
                class={cn(
                  "w-full text-left px-3 py-2 hover:bg-muted transition-colors text-sm flex items-center gap-3",
                  isSelectedInSelectMode ? "bg-primary/10" : ""
                )}
                onclick={() => handleIOCInteraction(ioc)}
                disabled={mode === 'link' && alreadyLinkedIocIds.includes(ioc.ioc_id)}
              >
                {#if mode === 'select'}
                  {#if isSelectedInSelectMode}
                    <CheckSquare class="h-4 w-4 text-primary shrink-0" />
                  {:else}
                    <Square class="h-4 w-4 text-muted-foreground shrink-0" />
                  {/if}
                {/if}
                <div class="flex-1 min-w-0"> 
                  <div class="flex items-center justify-between gap-2">
                    <code class="font-mono text-xs text-foreground/90 break-all flex-1 truncate">
                      {ioc.ioc_value}
                    </code>
                    
                    <Badge 
                      variant="outline" 
                      class={cn(
                        "text-xs px-1.5 py-0 h-4 capitalize border whitespace-nowrap",
                        getTLPColorClasses(ioc.tlp.tlp_name)
                      )}
                    >
                      TLP:{ioc.tlp.tlp_name}
                    </Badge>
                  </div>
                  
                  {#if ioc.ioc_description}
                    <p class="text-xs text-muted-foreground mt-0.5 italic truncate">
                      {ioc.ioc_description}
                    </p>
                  {/if}
                </div>
              </button>
            {/each}
            
            {#if isLoading && iocList.length > 0}
              <div class="flex justify-center py-2">
                <div class="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full"></div>
              </div>
            {/if}
          </div>
        {/if}
      </div>
    </PopoverContent>
  </Popover>
</div>