<script lang="ts">
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Link, ChevronDown, Search, X } from 'lucide-svelte';
  import { Popover, PopoverContent, PopoverTrigger } from '$lib/components/ui/popover';
  import { ApiService } from '$lib/services/api.service';
  import { ENDPOINTS } from '$lib/constants/endpoints';
  import { assetsStore } from '$lib/stores/assets.store';
  import type { IOC } from '$lib/types/resources/ioc';
  import { Badge } from '$lib/components/ui/badge';
  import { cn } from '$lib/utils';
	import { AssetService } from '$lib/services/asset.service';
	import { toast } from '$lib/stores/toast.store';
  
  // Props
  let { caseId, assetId, hasRefreshed = $bindable()}: { caseId: number, assetId: number, hasRefreshed: boolean } = $props();
  
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
        per_page: 10
      };

      if (customConditions.length > 0) {
        params.custom_conditions = JSON.stringify(customConditions);
      }
      
      const response = await ApiService.get(ENDPOINTS.case.ioc.list(caseId, params));
      const newIocs = response.data?.data || [];
      
      // Check if there are more pages
      hasMorePages = newIocs.length === 10;
      
      // Update the list
      if (resetList) {
        iocList = newIocs;
      } else {
        iocList = [...iocList, ...newIocs];
      }
      
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
  
  // Function to link an IOC to the asset
  async function linkIOCToAsset(ioc: IOC) {
    try {
      const existingAsset = assetsStore.getAsset(assetId);
      
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
  
  // Initialize search when dropdown opens - only fetch if not already done
  $effect(() => {
    if (showIOCDropdown && !initialFetchDone) {
      fetchCaseIOCs();
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
      >
        <Link class="h-4 w-4 mr-2" />
        Link IOC
        <ChevronDown class="h-3 w-3 ml-1 opacity-70" />
      </Button>
    </PopoverTrigger>
    
    <PopoverContent class="w-80 p-0" align="end">
      <div class="p-2 border-b">
        <h4 class="font-medium text-sm">Link IOC to Asset</h4>
        <p class="text-xs text-muted-foreground">Select an IOC to link to this asset</p>
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
        {:else if iocList.length === 0}
          <div class="text-center text-muted-foreground text-xs p-3">
            {searchTerm ? 'No IOCs found matching your search.' : 'No IOCs found for this case.'}
          </div>
        {:else}
          <div class="py-1">
            {#each iocList as ioc}
              <button 
                class="w-full text-left px-3 py-2 hover:bg-muted transition-colors text-sm"
                onclick={() => linkIOCToAsset(ioc)}
              >
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