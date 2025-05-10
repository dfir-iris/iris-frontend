<script lang="ts">
  import { 
    PlusIcon, 
    ServerIcon, 
    NetworkIcon, 
    FileTextIcon,
    ComponentIcon,
    ShieldAlertIcon,
    XIcon,
    CheckIcon,
    AlertTriangleIcon,
    InfoIcon
  } from 'lucide-svelte';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Textarea } from '$lib/components/ui/textarea';
  import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '$lib/components/ui/dialog';
  import { Card, CardContent } from '$lib/components/ui/card';
  import { Label } from '$lib/components/ui/label';
  import { TagInput } from '$lib/components/common/tag';
  import { Separator } from '$lib/components/ui/separator';
  import { Badge } from '$lib/components/ui/badge';
  import { toast } from '$lib/components/ui/toast';
  import { assetTypes } from '$lib/stores/asset-types.store';
  import { analysisStatuses } from '$lib/stores/analysis-status.store';
  import { assetsStore } from '$lib/stores/assets.store';
  import { tagsStore } from '$lib/stores/tags.store';
  import { page } from '$app/state';
  import { AssetService } from '$lib/services/asset.service';
  import type { Tag } from '$lib/stores/tags.store';
  import type { Asset } from '$lib/types/resources/asset';
  import type { IOC } from '$lib/types/resources/ioc';
  import { ApiService } from '$lib/services/api.service';
  import { ENDPOINTS } from '$lib/constants/endpoints';
  import { Select, SelectContent, SelectItem, SelectTrigger } from '$lib/components/ui/select';
	import { COMPROMISE_STATUS } from '$lib/constants/compromise_status';

  // Props
  let { open = $bindable(false) } = $props<{
    open?: boolean;
  }>();

  // State
  let isSubmitting = $state(false);
  let currentTags = $state<Tag[]>([]);
  let selectedIOCs = $state<IOC[]>([]);
  let searchQuery = $state('');
  let searchResults = $state<IOC[]>([]);
  let isSearching = $state(false);
  let searchDebounceTimer: number;

  // Form data
  let assetData = $state({
    asset_name: '',
    asset_description: '',
    asset_ip: '',
    asset_domain: '',
    asset_type_id: undefined as number | undefined,
    analysis_status_id: undefined as number | undefined,
    asset_compromise_status_id: 3, // Default to "Unknown"
    asset_tags: ''
  });

  // Initialize stores
  $effect(() => {
    if (open) {
      assetTypes.fetch();
      analysisStatuses.fetch();
      // Reset form when opening
      resetForm();
    }
  });

  // Reset form data
  function resetForm() {
    assetData = {
      asset_name: '',
      asset_description: '',
      asset_ip: '',
      asset_domain: '',
      asset_type_id: undefined,
      analysis_status_id: undefined,
      asset_compromise_status_id: 3,
      asset_tags: ''
    };
    currentTags = [];
    selectedIOCs = [];
    searchQuery = '';
    searchResults = [];
  }

  // Handle tag changes
  function handleTagsChange(newTags: Tag[]) {
    currentTags = newTags;
    assetData.asset_tags = newTags.map(tag => tag.tag_title).join(',');
  }

  // Search for IOCs
  async function searchIOCs() {
    if (!searchQuery.trim()) {
      searchResults = [];
      return;
    }

    isSearching = true;
    try {
      const caseId = page.params.case_id;
      const params = { 
        custom_conditions: JSON.stringify([
          { field: 'ioc_value', operator: 'like', value: searchQuery },
          { field: 'ioc_type.type_name', operator: 'like', value: searchQuery },
          { field: 'ioc_description', operator: 'like', value: searchQuery },
          { field: 'ioc_tags', operator: 'like', value: searchQuery }
        ]),
        per_page: 10
      };

      const response = await ApiService.get(ENDPOINTS.case.ioc.list(caseId, params));
      
      if (response?.data?.data) {
        searchResults = response.data.data;
      } else if (Array.isArray(response?.data)) {
        searchResults = response.data;
      } else {
        searchResults = [];
      }
    } catch (error) {
      console.error('Error searching IOCs:', error);
      searchResults = [];
    } finally {
      isSearching = false;
    }
  }

  // Handle search input
  function handleSearchInput(e: Event) {
    searchQuery = (e.target as HTMLInputElement).value;
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(() => {
      searchIOCs();
    }, 300) as unknown as number;
  }

  // Toggle IOC selection
  function toggleIOCSelection(ioc: IOC) {
    const index = selectedIOCs.findIndex(i => i.ioc_id === ioc.ioc_id);
    if (index >= 0) {
      selectedIOCs = selectedIOCs.filter(i => i.ioc_id !== ioc.ioc_id);
    } else {
      selectedIOCs = [...selectedIOCs, ioc];
    }
  }

  // Check if an IOC is selected
  function isIOCSelected(ioc: IOC): boolean {
    return selectedIOCs.some(i => i.ioc_id === ioc.ioc_id);
  }

  // Submit the form
  async function submitForm() {
    if (!assetData.asset_name) {
      toast({
        title: "Validation Error",
        description: "Asset name is required",
        variant: "destructive"
      });
      return;
    }

    isSubmitting = true;
    try {
      const caseId = page.params.case_id;
      
      // Prepare payload
      const payload = {
        ...assetData,
        ioc_links: selectedIOCs.map(ioc => ioc.ioc_id)
      };

      // Call the AssetService.add method
      const response = await AssetService.addAsset(caseId, payload);
      
      if (response?.data) {
        // Add the new asset to the store
        assetsStore.addAsset(response.data as Asset);
        
        // Show success message
        toast({
          title: "Asset Added",
          description: `${assetData.asset_name} has been successfully added.`,
          variant: "success"
        });
        
        // Close the modal and reset form
        open = false;
        resetForm();
      }
    } catch (error) {
      console.error('Error adding asset:', error);
      toast({
        title: "Error",
        description: "Failed to add asset. Please try again.",
        variant: "destructive"
      });
    } finally {
      isSubmitting = false;
    }
  }
</script>

<Dialog bind:open>
  <DialogContent class="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
    <DialogHeader>
      <DialogTitle class="flex items-center gap-2">
        <ServerIcon class="h-5 w-5 text-primary" />
        Add New Asset
      </DialogTitle>
      <DialogDescription>
        Create a new asset and optionally link it to existing IOCs.
      </DialogDescription>
    </DialogHeader>
    
    <div class="flex-1 overflow-y-auto py-4 ">
      <div class="space-y-6 max-w-[95%] mx-auto">
        <!-- General Information -->
        <section>
          <div class="flex items-center gap-2 mb-4">
            <ServerIcon class="h-5 w-5 text-primary" />
            <h2 class="text-lg font-semibold">General Information</h2>
          </div>
          
          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div class="space-y-2">
              <Label for="asset_name" class="font-medium">Asset Name <span class="text-destructive">*</span></Label>
              <Input 
                id="asset_name" 
                bind:value={assetData.asset_name} 
                placeholder="Enter asset name" 
                required
              />
            </div>
            
            <div class="space-y-2">
              <Label for="asset_type" class="font-medium">Asset Type <span class="text-destructive">*</span></Label>
              <Select 
                type="single" 
                value={assetData.asset_type_id?.toString()} 
                onValueChange={value => assetData.asset_type_id = parseInt(value)}
                required
              >
                <SelectTrigger id="asset_type">
                  {assetData.asset_type_id ? 
                    $assetTypes.find(t => t.asset_id === assetData.asset_type_id)?.asset_name || 'Select asset type' : 
                    'Select asset type'}
                </SelectTrigger>
                <SelectContent>
                  {#each $assetTypes as type}
                    <SelectItem value={type.asset_id.toString()}>{type.asset_name}</SelectItem>
                  {/each}
                </SelectContent>
              </Select>
            </div>
            
            <div class="space-y-2">
              <Label for="analysis_status" class="font-medium">Analysis Status</Label>
              <Select 
                type="single" 
                value={assetData.analysis_status_id?.toString()} 
                onValueChange={value => assetData.analysis_status_id = parseInt(value)}
              >
                <SelectTrigger id="analysis_status" aria-label="Select analysis status">
                  {assetData.analysis_status_id ? 
                    $analysisStatuses.find(s => s.id === assetData.analysis_status_id)?.name || 'Select analysis status' : 
                    'Select analysis status'}
                </SelectTrigger>
                <SelectContent>
                  {#each $analysisStatuses as status}
                    <SelectItem value={status.id.toString()}>{status.name}</SelectItem>
                  {/each}
                </SelectContent>
              </Select>
            </div>
            
            <div class="space-y-2">
              <Label for="compromise_status" class="font-medium">Compromise Status</Label>
              <Select 
                type="single" 
                value={assetData.asset_compromise_status_id.toString()} 
                onValueChange={value => assetData.asset_compromise_status_id = parseInt(value)}
              >
                <SelectTrigger id="compromise_status">
                  {COMPROMISE_STATUS[assetData.asset_compromise_status_id as keyof typeof COMPROMISE_STATUS] || 'Select compromise status'}
                </SelectTrigger>
                <SelectContent>
                  {#each Object.entries(COMPROMISE_STATUS) as [statusId, statusName]}
                    <SelectItem value={statusId}>{statusName}</SelectItem>
                  {/each}
                </SelectContent>
              </Select>
            </div>
          </div>
        </section>
        
        <!-- Network Information -->
        <section>
          <div class="flex items-center gap-2 mb-4">
            <NetworkIcon class="h-5 w-5 text-primary" />
            <h2 class="text-lg font-semibold">Network Information</h2>
          </div>
          
          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div class="space-y-2">
              <Label for="asset_ip" class="font-medium">IP Address</Label>
              <Input 
                id="asset_ip" 
                bind:value={assetData.asset_ip} 
                placeholder="e.g. 192.168.1.1" 
              />
            </div>
            
            <div class="space-y-2">
              <Label for="asset_domain" class="font-medium">Domain</Label>
              <Input 
                id="asset_domain" 
                bind:value={assetData.asset_domain} 
                placeholder="e.g. example.com" 
              />
            </div>
          </div>
        </section>
        
        <!-- Description -->
        <section>
          <div class="flex items-center gap-2 mb-4">
            <FileTextIcon class="h-5 w-5 text-primary" />
            <h2 class="text-lg font-semibold">Description</h2>
          </div>
          
          <div class="space-y-2">
            <Textarea 
              bind:value={assetData.asset_description}
              placeholder="Provide a detailed description of this asset"
              rows={5}
              class="w-full"
            />
            <p class="text-xs text-muted-foreground">Markdown formatting is supported</p>
          </div>
        </section>
        
        <!-- Tags -->
        <section>
          <div class="flex items-center gap-2 mb-4">
            <ComponentIcon class="h-5 w-5 text-primary" />
            <h2 class="text-lg font-semibold">Tags</h2>
          </div>
          
          <div class="space-y-2">
            <TagInput 
              tags={currentTags} 
              outputFormat="array"
              onchange={handleTagsChange}
              placeholder="Add tags..."
              maxTags={20}
            />
            <p class="text-xs text-muted-foreground">Press Enter or comma to add a tag</p>
          </div>
        </section>

        <!-- IOCs Section -->
        <section>
          <div class="flex items-center gap-2 mb-4">
            <ShieldAlertIcon class="h-5 w-5 text-primary" />
            <h2 class="text-lg font-semibold">Link Indicators of Compromise</h2>
          </div>

          <!-- Selected IOCs -->
          {#if selectedIOCs.length > 0}
            <div class="mb-4">
              <h3 class="text-sm font-medium mb-2">Selected IOCs ({selectedIOCs.length})</h3>
              <div class="flex flex-wrap gap-2 mb-4">
                {#each selectedIOCs as ioc (ioc.ioc_id)}
                  <Badge variant="secondary" class="flex items-center gap-1 py-1.5 pl-2 pr-1">
                    <span class="text-xs">{ioc.ioc_value}</span>
                    <button 
                      onclick={() => toggleIOCSelection(ioc)}
                      class="ml-1 h-4 w-4 rounded-full bg-muted-foreground/20 hover:bg-destructive/20 flex items-center justify-center"
                    >
                      <XIcon class="h-3 w-3" />
                    </button>
                  </Badge>
                {/each}
              </div>
              <Separator class="my-4" />
            </div>
          {/if}

          <!-- Search IOCs -->
          <div class="relative mb-4">
            <Input 
              type="search" 
              placeholder="Search for IOCs by value, type, or description..." 
              value={searchQuery}
              oninput={handleSearchInput}
              class="w-full"
            />
            {#if isSearching}
              <div class="absolute right-3 top-1/2 -translate-y-1/2">
                <div class="animate-spin h-4 w-4">⟳</div>
              </div>
            {/if}
          </div>

          <!-- Search Results -->
          <div>
            {#if searchQuery && !isSearching && searchResults.length === 0}
              <div class="text-center py-4 bg-muted/30 rounded-lg border border-dashed">
                <AlertTriangleIcon class="h-6 w-6 mx-auto text-muted-foreground mb-2" />
                <p class="text-muted-foreground">No IOCs found matching "{searchQuery}"</p>
              </div>
            {:else if searchResults.length > 0}
              <div class="space-y-2 max-h-[300px] overflow-y-auto">
                {#each searchResults as ioc (ioc.ioc_id)}
                  <Card class={isIOCSelected(ioc) ? 'border-primary/50 bg-primary/5' : ''}>
                    <CardContent class="p-3 flex items-start justify-between">
                      <div class="flex-1">
                        <div class="flex items-center gap-2">
                          <Badge variant="outline" class="px-2 py-0.5 text-xs">
                            {ioc.ioc_type.type_name}
                          </Badge>
                          <h4 class="font-medium">{ioc.ioc_value}</h4>
                        </div>
                        {#if ioc.ioc_description}
                          <p class="text-sm text-muted-foreground mt-1 line-clamp-2">
                            {ioc.ioc_description}
                          </p>
                        {/if}
                      </div>
                      <Button 
                        variant={isIOCSelected(ioc) ? "default" : "outline"} 
                        size="sm"
                        onclick={() => toggleIOCSelection(ioc)}
                        class="ml-4 shrink-0"
                      >
                        {#if isIOCSelected(ioc)}
                          <CheckIcon class="h-4 w-4 mr-1" /> Selected
                        {:else}
                          <PlusIcon class="h-4 w-4 mr-1" /> Select
                        {/if}
                      </Button>
                    </CardContent>
                  </Card>
                {/each}
              </div>
            {:else if !searchQuery}
              <div class="text-center py-4 bg-muted/30 rounded-lg border border-dashed">
                <ShieldAlertIcon class="h-6 w-6 mx-auto text-muted-foreground mb-2" />
                <p class="text-muted-foreground">Search for IOCs to link to this asset</p>
              </div>
            {/if}
          </div>
        </section>
      </div>
    </div>

    <DialogFooter class="flex items-center justify-between pt-2">
      <div class="text-sm text-muted-foreground">
        <span class="text-destructive">*</span> Required fields
        {#if selectedIOCs.length > 0}
          · {selectedIOCs.length} IOCs selected
        {/if}
      </div>
      <div class="flex gap-2">
        <Button variant="outline" onclick={() => open = false} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button onclick={submitForm} disabled={isSubmitting || !assetData.asset_name}>
          {#if isSubmitting}
            <span class="animate-spin mr-2">⟳</span> Adding...
          {:else}
            <PlusIcon class="h-4 w-4 mr-2" /> Add Asset
          {/if}
        </Button>
      </div>
    </DialogFooter>
  </DialogContent>
</Dialog>

