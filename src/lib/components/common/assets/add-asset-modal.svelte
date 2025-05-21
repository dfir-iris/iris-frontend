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
    InfoIcon,
		ListPlusIcon // For "Add Assets"
  } from 'lucide-svelte';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Textarea } from '$lib/components/ui/textarea'; // Added
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
  import { page } from '$app/stores'; // Corrected import
  import { AssetService } from '$lib/services/asset.service';
  import type { Tag } from '$lib/stores/tags.store';
  import type { Asset } from '$lib/types/resources/asset';
  import type { IOC } from '$lib/types/resources/ioc';
  // Removed: import { ApiService } from '$lib/services/api.service';
  // Removed: import { ENDPOINTS } from '$lib/constants/endpoints';
  import { Select, SelectContent, SelectItem, SelectTrigger } from '$lib/components/ui/select';
	import { COMPROMISE_STATUS } from '$lib/constants/compromise_status';
  import { Switch } from '$lib/components/ui/switch'; // Added
  import IOCLinkButton from '$lib/components/common/ioc/IOCLinkButton.svelte'; // Added

  // Props
  let { open = $bindable(false) }: { // Removed onAssetsAdded
    open?: boolean;
    // Removed: onAssetsAdded?: () => void; 
  } = $props();

  // State
  let isSubmitting = $state(false);
  let currentTags = $state<Tag[]>([]);
  // let selectedIOCs = $state<IOC[]>([]); // Replaced by selectedIOCsForNewAsset
  let selectedIOCsForNewAsset = $state<IOC[]>([]); // Used with IOCLinkButton
  // Removed: let searchQuery = $state('');
  // Removed: let searchResults = $state<IOC[]>([]);
  // Removed: let isSearching = $state(false);
  // Removed: let searchDebounceTimer: number;
  let fieldErrors = $state<Record<string, string[]>>({});
  let oneAssetPerLine = $state(true); // Added: Toggle state

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
      asset_name: '', // This will now be from Textarea
      asset_description: '',
      asset_ip: '',
      asset_domain: '',
      asset_type_id: undefined,
      analysis_status_id: undefined,
      asset_compromise_status_id: 3,
      asset_tags: ''
    };
    currentTags = [];
    // selectedIOCs = []; // Replaced
    selectedIOCsForNewAsset = [];
    // searchQuery = ''; // Removed
    // searchResults = []; // Removed
    fieldErrors = {};
    oneAssetPerLine = true; // Reset toggle to default
  }

  // Handle tag changes
  function handleTagsChange(newTags: Tag[]) {
    currentTags = newTags;
    assetData.asset_tags = newTags.map(tag => tag.tag_title).join(',');
  }

  // Removed: searchIOCs function
  // Removed: handleSearchInput function
  // Removed: toggleIOCSelection function
  // Removed: isIOCSelected function

  // Submit the form
  async function submitForm() {
    isSubmitting = true;
    fieldErrors = {};
    const caseId = $page.params.case_id;

    const commonPayloadBase = {
      asset_description: assetData.asset_description,
      asset_ip: assetData.asset_ip,
      asset_domain: assetData.asset_domain,
      asset_type_id: assetData.asset_type_id,
      analysis_status_id: assetData.analysis_status_id,
      asset_compromise_status_id: assetData.asset_compromise_status_id,
      asset_tags: assetData.asset_tags,
      ioc_links: selectedIOCsForNewAsset.map(ioc => ioc.ioc_id) // Use selectedIOCsForNewAsset
    };

    if (oneAssetPerLine) {
      const assetNamesArray = assetData.asset_name.split('\n')
        .map(name => name.trim())
        .filter(name => name.length > 0);
      const uniqueAssetNames = [...new Set(assetNamesArray)];

      if (uniqueAssetNames.length === 0) {
        toast({
          title: "Validation Error",
          description: "Please provide at least one asset name.",
          variant: "destructive"
        });
        isSubmitting = false;
        return;
      }
      
      if (!assetData.asset_type_id) {
        toast({
          title: "Validation Error",
          description: "Asset type is required for all assets.",
          variant: "destructive"
        });
        isSubmitting = false;
        return;
      }

      let successCount = 0;
      let errorCount = 0;
      const errors: string[] = [];

      for (const name of uniqueAssetNames) {
        try {
          const payload = {
            ...commonPayloadBase,
            asset_name: name
          };
          const response = await AssetService.addAsset(caseId, payload);
          if (response?.ok) {
            assetsStore.addAsset(response.data as Asset);
            successCount++;
          } else {
            errorCount++;
            errors.push(`${name}: ${response?.data?.message || 'Unknown error'}`);
            if (response?.data?.data) {
							// For simplicity, batch errors are general. Individual field errors are complex here.
							console.warn(`Field errors for ${name}:`, response.data.data);
						}
          }
        } catch (error) {
          errorCount++;
          errors.push(`${name}: ${error.message || 'Network error'}`);
          console.error(`Error adding asset ${name}:`, error);
        }
      }

      if (successCount > 0 && errorCount === 0) {
        toast({
          title: "Assets Added",
          description: `${successCount} asset${successCount > 1 ? 's' : ''} successfully added.`,
          variant: "success"
        });
      } else if (successCount > 0 && errorCount > 0) {
        toast({
          title: "Partial Success",
          description: `${successCount} asset${successCount > 1 ? 's' : ''} added. ${errorCount} failed. Errors: ${errors.slice(0,2).join(', ')}... (see console for details)`,
          variant: "warning",
          duration: 7000
        });
      } else if (errorCount > 0) {
         toast({
          title: "Error Adding Assets",
          description: `Failed to add ${errorCount} asset${errorCount > 1 ? 's' : ''}. Errors: ${errors.slice(0,2).join(', ')}... (see console for details)`,
          variant: "destructive",
          duration: 7000
        });
      }
      
      if (successCount > 0) { // If any asset was successfully added
        // Removed: if (typeof onAssetsAdded === 'function') {
        // Removed: onAssetsAdded();
        // Removed: }
        assetsStore.triggerListRefresh(); // Trigger refresh via store
        
        open = false;
        resetForm();
      } else if (uniqueAssetNames.length === 0 && errorCount === 0) {
        // This case means no valid names were provided, initial validation caught it.
        // Modal remains open as per current flow.
      }


    } else { // Single asset submission
      if (!assetData.asset_name.trim()) {
        toast({
          title: "Validation Error",
          description: "Asset name is required",
          variant: "destructive"
        });
        isSubmitting = false;
        return;
      }
      if (!assetData.asset_type_id) {
        toast({
          title: "Validation Error",
          description: "Asset type is required.",
          variant: "destructive"
        });
        isSubmitting = false;
        return;
      }

      try {
        const payload = {
          ...commonPayloadBase,
          asset_name: assetData.asset_name.trim() // Use trimmed single name
        };
        const response = await AssetService.addAsset(caseId, payload);
        if (response?.ok) {
          assetsStore.addAsset(response.data as Asset);
          toast({
            title: "Asset Added",
            description: `${payload.asset_name} has been successfully added.`,
            variant: "success"
          });
          // Removed: if (typeof onAssetsAdded === 'function') {
          // Removed: onAssetsAdded();
          // Removed: }
          assetsStore.triggerListRefresh(); // Trigger refresh via store
          open = false;
          resetForm();
        } else {
          if (response?.data?.data) {
            fieldErrors = response.data.data;
          } else {
            toast({
              title: "Error",
              description: response?.data?.message || "Failed to add asset. Please try again.",
              variant: "destructive"
            });
          }
          console.error('Error adding asset:', response?.data);
        }
      } catch (error) {
        console.error('Error adding asset:', error);
        toast({
          title: "Error",
          description: "Failed to add asset. Please try again.",
          variant: "destructive"
        });
      }
    }
    isSubmitting = false;
  }
</script>

<Dialog bind:open>
  <DialogContent class="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
    <DialogHeader>
      <DialogTitle class="flex items-center gap-2">
        {#if oneAssetPerLine}
          <ListPlusIcon class="h-5 w-5 text-primary" />
          Add New Assets
        {:else}
          <ServerIcon class="h-5 w-5 text-primary" />
          Add New Asset
        {/if}
      </DialogTitle>
      <DialogDescription>
        {#if oneAssetPerLine}
          Create multiple new assets by entering one name per line. Other details will apply to all assets.
        {:else}
          Create a new asset and optionally link it to existing IOCs.
        {/if}
      </DialogDescription>
    </DialogHeader>
    
    <div class="flex-1 overflow-y-auto py-4 ">
      <div class="space-y-6 max-w-[95%] mx-auto">
        <!-- General Information -->
        <section>
          <div class="flex items-center justify-between mb-4">
            <div class="flex items-center gap-2">
              <ServerIcon class="h-5 w-5 text-primary" />
              <h2 class="text-lg font-semibold">General Information</h2>
            </div>
            <div class="flex items-center space-x-2">
              <Switch id="one-asset-per-line" bind:checked={oneAssetPerLine} />
              <Label for="one-asset-per-line" class="text-sm font-medium">
                One asset per line
              </Label>
            </div>
          </div>
          
          <div class="space-y-2 mb-6">
            <Label for="asset_name_multi" class="font-medium">
              Asset Name{oneAssetPerLine ? 's (one per line)' : ''} <span class="text-destructive">*</span>
            </Label>
            <Textarea 
              id="asset_name_multi" 
              bind:value={assetData.asset_name} 
              placeholder={oneAssetPerLine ? "Enter asset names, one per line...\nExampleAsset1\nExampleAsset2" : "Enter asset name"}
              required
              rows={oneAssetPerLine ? 5 : 1}
              class={`w-full ${fieldErrors.asset_name ? "border-destructive" : ""}`}
            />
            {#if fieldErrors.asset_name && !oneAssetPerLine}
              <p class="text-xs text-destructive">{fieldErrors.asset_name[0]}</p>
            {/if}
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div class="space-y-2">
              <Label for="asset_type" class="font-medium">Asset Type <span class="text-destructive">*</span></Label>
              <Select 
                type="single" 
                value={assetData.asset_type_id?.toString()} 
                onValueChange={value => assetData.asset_type_id = parseInt(value)}
                required
                class={fieldErrors.asset_type_id ? "border-destructive" : ""}
              >
                <SelectTrigger id="asset_type" class={fieldErrors.asset_type_id ? "border-destructive" : ""}>
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
              {#if fieldErrors.asset_type_id}
                <p class="text-xs text-destructive">{fieldErrors.asset_type_id[0]}</p>
              {/if}
            </div>
            
            <div class="space-y-2">
              <Label for="analysis_status" class="font-medium">Analysis Status</Label>
              <Select 
                type="single" 
                value={assetData.analysis_status_id?.toString()} 
                onValueChange={value => assetData.analysis_status_id = parseInt(value)}
              >
                <SelectTrigger 
                  id="analysis_status" 
                  aria-label="Select analysis status"
                  class={fieldErrors.analysis_status_id ? "border-destructive" : ""}
                >
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
              {#if fieldErrors.analysis_status_id}
                <p class="text-xs text-destructive">{fieldErrors.analysis_status_id[0]}</p>
              {/if}
            </div>
            
            <div class="space-y-2">
              <Label for="compromise_status" class="font-medium">Compromise Status</Label>
              <Select 
                type="single" 
                value={assetData.asset_compromise_status_id.toString()} 
                onValueChange={value => assetData.asset_compromise_status_id = parseInt(value)}
                class={fieldErrors.asset_compromise_status_id ? "border-destructive" : ""}
              >
                <SelectTrigger 
                  id="compromise_status"
                  class={fieldErrors.asset_compromise_status_id ? "border-destructive" : ""}
                >
                  {COMPROMISE_STATUS[assetData.asset_compromise_status_id as keyof typeof COMPROMISE_STATUS] || 'Select compromise status'}
                </SelectTrigger>
                <SelectContent>
                  {#each Object.entries(COMPROMISE_STATUS) as [statusId, statusName]}
                    <SelectItem value={statusId}>{statusName}</SelectItem>
                  {/each}
                </SelectContent>
              </Select>
              {#if fieldErrors.asset_compromise_status_id}
                <p class="text-xs text-destructive">{fieldErrors.asset_compromise_status_id[0]}</p>
              {/if}
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
                class={fieldErrors.asset_ip ? "border-destructive" : ""}
              />
              {#if fieldErrors.asset_ip}
                <p class="text-xs text-destructive">{fieldErrors.asset_ip[0]}</p>
              {/if}
            </div>
            
            <div class="space-y-2">
              <Label for="asset_domain" class="font-medium">Domain</Label>
              <Input 
                id="asset_domain" 
                bind:value={assetData.asset_domain} 
                placeholder="e.g. example.com" 
                class={fieldErrors.asset_domain ? "border-destructive" : ""}
              />
              {#if fieldErrors.asset_domain}
                <p class="text-xs text-destructive">{fieldErrors.asset_domain[0]}</p>
              {/if}
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
              class={`w-full ${fieldErrors.asset_description ? "border-destructive" : ""}`}
            />
            {#if fieldErrors.asset_description}
              <p class="text-xs text-destructive">{fieldErrors.asset_description[0]}</p>
            {:else}
              <p class="text-xs text-muted-foreground">Markdown formatting is supported</p>
            {/if}
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
              class={fieldErrors.asset_tags ? "border-destructive" : ""}
            />
            {#if fieldErrors.asset_tags}
              <p class="text-xs text-destructive">{fieldErrors.asset_tags[0]}</p>
            {:else}
              <p class="text-xs text-muted-foreground">Press Enter or comma to add a tag</p>
            {/if}
          </div>
        </section>

        <!-- Show error if we have errors for fields not explicitly handled above -->
        {#if Object.keys(fieldErrors).some(key => 
          !['asset_name', 'asset_type_id', 'analysis_status_id', 'asset_compromise_status_id', 
            'asset_ip', 'asset_domain', 'asset_description', 'asset_tags'].includes(key))}
          <div class="bg-destructive/10 p-3 rounded border border-destructive">
            <h3 class="text-sm font-medium text-destructive mb-1">Additional Validation Errors</h3>
            <ul class="list-disc pl-5 text-xs">
              {#each Object.entries(fieldErrors).filter(([key]) => 
                !['asset_name', 'asset_type_id', 'analysis_status_id', 'asset_compromise_status_id', 
                  'asset_ip', 'asset_domain', 'asset_description', 'asset_tags'].includes(key)) as [field, messages]}
                <li><strong>{field}:</strong> {messages.join(', ')}</li>
              {/each}
            </ul>
          </div>
        {/if}

        <!-- IOCs Section -->
        <section>
          <div class="flex items-center gap-2 mb-4">
            <ShieldAlertIcon class="h-5 w-5 text-primary" />
            <h2 class="text-lg font-semibold">Link Indicators of Compromise</h2>
          </div>

          <!-- IOCLinkButton for selecting IOCs -->
          <div class="mb-4">
            <IOCLinkButton 
              caseId={$page.params.case_id} 
              mode="select"
              bind:selectedForLinking={selectedIOCsForNewAsset}
            />
          </div>

          <!-- Selected IOCs Display -->
          {#if selectedIOCsForNewAsset.length > 0}
            <div class="mb-4">
              <h3 class="text-sm font-medium mb-2">Selected IOCs ({selectedIOCsForNewAsset.length})</h3>
              <div class="flex flex-wrap gap-2 mb-4 max-h-[150px] overflow-y-auto p-1 rounded-md border bg-muted/30">
                {#each selectedIOCsForNewAsset as ioc (ioc.ioc_id)}
                  <Badge variant="secondary" class="flex items-center gap-1 py-1 pl-2 pr-1">
                    <span class="text-xs">{ioc.ioc_value}</span>
                    <button 
                      onclick={() => {
                        selectedIOCsForNewAsset = selectedIOCsForNewAsset.filter(selectedIoc => selectedIoc.ioc_id !== ioc.ioc_id);
                      }}
                      class="ml-1 h-4 w-4 rounded-full bg-muted-foreground/20 hover:bg-destructive/20 flex items-center justify-center"
                      aria-label={`Remove ${ioc.ioc_value}`}
                    >
                      <XIcon class="h-3 w-3" />
                    </button>
                  </Badge>
                {/each}
              </div>
            </div>
          {:else if !oneAssetPerLine} <!-- Show only if not in bulk mode and no IOCs selected -->
            <div class="text-center py-4 bg-muted/30 rounded-lg border border-dashed">
              <InfoIcon class="h-6 w-6 mx-auto text-muted-foreground mb-2" />
              <p class="text-muted-foreground text-sm">No IOCs selected to link with this asset.</p>
              <p class="text-muted-foreground text-xs mt-1">You can link IOCs later if needed.</p>
            </div>
          {/if}
          <!-- Removed old search input and results display -->
        </section>
      </div>
    </div>

    <DialogFooter class="flex items-center justify-between pt-2">
      <div class="text-sm text-muted-foreground">
        <span class="text-destructive">*</span> Required fields
        {#if selectedIOCsForNewAsset.length > 0}
          · {selectedIOCsForNewAsset.length} IOCs selected
        {/if}
      </div>
      <div class="flex gap-2">
        <Button variant="outline" onclick={() => open = false} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button onclick={submitForm} disabled={isSubmitting || (!assetData.asset_name.trim() && !oneAssetPerLine) || (oneAssetPerLine && assetData.asset_name.split('\n').map(n=>n.trim()).filter(n=>n).length === 0) }>
          {#if isSubmitting}
            <span class="animate-spin mr-2">⟳</span> Adding...
          {:else if oneAssetPerLine}
            <ListPlusIcon class="h-4 w-4 mr-2" /> Add Assets
          {:else}
            <PlusIcon class="h-4 w-4 mr-2" /> Add Asset
          {/if}
        </Button>
      </div>
    </DialogFooter>
  </DialogContent>
</Dialog>

