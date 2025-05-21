<script lang="ts">
  import { 
    PlusIcon, 
    ServerIcon, 
    ComponentIcon,
    ShieldAlertIcon,
    XIcon,
    InfoIcon,
		ListPlusIcon, // For "Add Assets"
    UploadCloudIcon // For CSV Upload
  } from 'lucide-svelte';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Textarea } from '$lib/components/ui/textarea'; // Added
  import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '$lib/components/ui/dialog';
  import { Label } from '$lib/components/ui/label';
  import { TagInput } from '$lib/components/common/tag';
  import { Badge } from '$lib/components/ui/badge';
  import { toast } from '$lib/components/ui/toast';
  import { assetTypes } from '$lib/stores/asset-types.store';
  import { analysisStatuses } from '$lib/stores/analysis-status.store';
  import { assetsStore } from '$lib/stores/assets.store';
  import { page } from '$app/stores'; // Corrected import
  import { AssetService } from '$lib/services/asset.service';
  import type { Tag } from '$lib/stores/tags.store';
  import type { Asset } from '$lib/types/resources/asset';
  import type { IOC } from '$lib/types/resources/ioc';
  import { Select, SelectContent, SelectItem, SelectTrigger } from '$lib/components/ui/select';
	import { COMPROMISE_STATUS } from '$lib/constants/compromise_status';
  import { Switch } from '$lib/components/ui/switch'; // Added
  import IOCLinkButton from '$lib/components/common/ioc/IOCLinkButton.svelte'; // Added
  import Papa from 'papaparse'; // Added for CSV parsing
  import { Progress } from '$lib/components/ui/progress'

  // Props
  let { open = $bindable(false) }: {
    open?: boolean;
  } = $props();

  // State
  let isSubmitting = $state(false);
  let currentTags = $state<Tag[]>([]);
  let selectedIOCsForNewAsset = $state<IOC[]>([]);
  let fieldErrors = $state<Record<string, string[]>>({});
  let addMode = $state<'single' | 'manual_bulk' | 'csv_bulk'>('manual_bulk'); // New mode state, default to manual_bulk

  // CSV specific state
  let csvFile = $state<File | null>(null);
  let isParsingCSV = $state(false);
  let csvParseError = $state<string | null>(null);
  let parsedCsvPayloads = $state<any[]>([]); // Stores payloads generated from CSV
  let uploadProgress = $state<{ total: number; processed: number; success: number; errors: number; errorDetails: { name: string, error: string }[] } | null>(null);


  // Form data (used for single asset or as defaults/globals for bulk)
  let assetData = $state({
    asset_name: '', // For single asset or manual bulk names
    asset_description: '',
    asset_ip: '',
    asset_domain: '',
    asset_type_id: undefined as number | undefined,
    analysis_status_id: undefined as number | undefined,
    asset_compromise_status_id: 3, // Default to "Unknown"
    asset_tags: '' // For single asset, tags are handled by currentTags for bulk
  });

  // Initialize stores
  $effect(() => {
    if (open) {
      assetTypes.fetch();
      analysisStatuses.fetch();
      resetForm();
    }
  });

  // Helper to reset CSV specific states
  function resetCsvRelatedState() {
    csvFile = null;
    isParsingCSV = false;
    csvParseError = null;
    parsedCsvPayloads = [];
    // Keep uploadProgress if it's showing results, reset on full form reset or mode change away from CSV processing
  }

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
    selectedIOCsForNewAsset = [];
    fieldErrors = {};
    addMode = 'manual_bulk'; // Default to manual_bulk
    resetCsvRelatedState(); // Reset CSV states
    uploadProgress = null; // Also reset any lingering progress display
  }

  // Handle tag changes (used for single asset mode, and as default for bulk if not in CSV)
  function handleTagsChange(newTags: Tag[]) {
    currentTags = newTags;
    if (addMode === 'single' || addMode === 'manual_bulk') { // Only update assetData.asset_tags if not CSV
        assetData.asset_tags = newTags.map(tag => tag.tag_title).join(',');
    }
  }
  
  function handleFileSelect(event: Event) {
    const target = event.target as HTMLInputElement;
    if (target.files && target.files.length > 0) {
      csvFile = target.files[0];
      csvParseError = null;
      parsedCsvPayloads = []; // Reset previous parsed data
      uploadProgress = null;
      // Automatically try to parse
      parseAndPrepareCSV();
    } else {
      csvFile = null;
    }
  }

  async function parseAndPrepareCSV() {
    if (!csvFile) {
      csvParseError = "No CSV file selected.";
      return;
    }
    isParsingCSV = true;
    csvParseError = null;
    parsedCsvPayloads = [];
    uploadProgress = null;

    // Ensure asset types and analysis statuses are loaded
    if ($assetTypes.length === 0) await assetTypes.fetch();
    if ($analysisStatuses.length === 0) await analysisStatuses.fetch();
    
    const unspecifiedAnalysisStatus = $analysisStatuses.find(s => s.name.toLowerCase() === 'unspecified');
    const defaultAnalysisStatusId = unspecifiedAnalysisStatus?.id;

    Papa.parse(csvFile, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        isParsingCSV = false;
        if (results.errors.length > 0) {
          csvParseError = `CSV Parsing Error: ${results.errors.map(e => e.message).join(', ')}`;
          toast({ title: "CSV Parsing Error", description: csvParseError, variant: "destructive", duration: 7000 });
          return;
        }

        const requiredHeaders = ['asset_name']; // asset_type_name or asset_type_id is now conditionally required
        const actualHeaders = results.meta.fields;
        if (!actualHeaders || !requiredHeaders.every(h => actualHeaders.includes(h))) {
          csvParseError = `CSV must contain at least header: ${requiredHeaders.join(', ')}. Found: ${actualHeaders?.join(', ') || 'none'}.`;
          toast({ title: "CSV Header Error", description: csvParseError, variant: "destructive", duration: 7000 });
          return;
        }
        if (!actualHeaders.includes('asset_type_name') && !actualHeaders.includes('asset_type_id')) {
          csvParseError = `CSV must contain either 'asset_type_name' or 'asset_type_id' header.`;
          toast({ title: "CSV Header Error", description: csvParseError, variant: "destructive", duration: 7000 });
          return;
        }


        const payloads: any[] = [];
        const parseErrors: string[] = [];

        results.data.forEach((row: any, index: number) => {
          const asset_name = row.asset_name?.trim();
          const csv_asset_type_name = row.asset_type_name?.trim();
          const csv_asset_type_id = row.asset_type_id?.trim();
          
          let asset_type_id_to_use: number | undefined = undefined;

          if (!asset_name) {
            parseErrors.push(`Row ${index + 1}: asset_name is missing or empty.`);
            return; // Skip this row
          }

          // Determine asset_type_id
          if (csv_asset_type_id) {
            const parsedId = parseInt(csv_asset_type_id);
            if (!isNaN(parsedId) && $assetTypes.find(t => t.asset_id === parsedId)) {
              asset_type_id_to_use = parsedId;
            } else {
              parseErrors.push(`Row ${index + 1} ('${asset_name}'): Invalid asset_type_id '${csv_asset_type_id}'.`);
            }
          }
          
          if (!asset_type_id_to_use && csv_asset_type_name) {
            const assetTypeByName = $assetTypes.find(t => t.asset_name.toLowerCase() === csv_asset_type_name.toLowerCase());
            if (assetTypeByName) {
              asset_type_id_to_use = assetTypeByName.asset_id;
            } else {
              parseErrors.push(`Row ${index + 1} ('${asset_name}'): Invalid asset_type_name '${csv_asset_type_name}' and no valid asset_type_id provided.`);
            }
          }
          
          if (!asset_type_id_to_use) {
            if (!csv_asset_type_id && !csv_asset_type_name) {
              parseErrors.push(`Row ${index + 1} ('${asset_name}'): Missing asset_type_name or asset_type_id.`);
            }
            // If errors were pushed due to invalid ID/Name, we don't need another message here.
            return; // Skip this row if type couldn't be determined
          }

          // Optional: Analysis Status from CSV
          let analysis_status_id_to_use = assetData.analysis_status_id || defaultAnalysisStatusId;
          if (row.analysis_status_id?.trim()) {
            const parsedStatusId = parseInt(row.analysis_status_id.trim());
            if (!isNaN(parsedStatusId) && $analysisStatuses.find(s => s.id === parsedStatusId)) {
              analysis_status_id_to_use = parsedStatusId;
            } else {
               parseErrors.push(`Row ${index + 1} ('${asset_name}'): Invalid analysis_status_id '${row.analysis_status_id.trim()}'. Using global/default.`);
            }
          } else if (row.analysis_status_name?.trim()) {
            const statusByName = $analysisStatuses.find(s => s.name.toLowerCase() === row.analysis_status_name.trim().toLowerCase());
            if (statusByName) {
              analysis_status_id_to_use = statusByName.id;
            } else {
              parseErrors.push(`Row ${index + 1} ('${asset_name}'): Invalid analysis_status_name '${row.analysis_status_name.trim()}'. Using global/default.`);
            }
          }

          // Optional: Compromise Status from CSV
          let compromise_status_id_to_use = assetData.asset_compromise_status_id;
          if (row.compromise_status_id?.trim()) {
            const parsedCompStatusId = parseInt(row.compromise_status_id.trim());
            if (!isNaN(parsedCompStatusId) && COMPROMISE_STATUS[parsedCompStatusId as keyof typeof COMPROMISE_STATUS]) {
              compromise_status_id_to_use = parsedCompStatusId;
            } else {
              parseErrors.push(`Row ${index + 1} ('${asset_name}'): Invalid compromise_status_id '${row.compromise_status_id.trim()}'. Using global/default.`);
            }
          } else if (row.compromise_status_name?.trim()) {
            const foundStatus = Object.entries(COMPROMISE_STATUS).find(([id, name]) => name.toLowerCase() === row.compromise_status_name.trim().toLowerCase());
            if (foundStatus) {
              compromise_status_id_to_use = parseInt(foundStatus[0]);
            } else {
              parseErrors.push(`Row ${index + 1} ('${asset_name}'): Invalid compromise_status_name '${row.compromise_status_name.trim()}'. Using global/default.`);
            }
          }


          payloads.push({
            asset_name: asset_name,
            asset_type_id: asset_type_id_to_use,
            asset_description: row.asset_description?.trim() || assetData.asset_description,
            asset_ip: row.asset_ip?.trim() || assetData.asset_ip,
            asset_domain: row.asset_domain?.trim() || assetData.asset_domain,
            asset_tags: row.asset_tags?.replace(/\|/g, ',').trim() || assetData.asset_tags,
            analysis_status_id: analysis_status_id_to_use,
            asset_compromise_status_id: compromise_status_id_to_use,
            ioc_links: [] // IOCs are not linked via this modal UI for CSV uploads
          });
        });

        if (parseErrors.length > 0) {
          csvParseError = `Errors during CSV data preparation: ${parseErrors.slice(0,3).join('; ')}... (see console for all)`;
          console.error("CSV Data Preparation Errors:", parseErrors);
          toast({ title: "CSV Data Error", description: csvParseError, variant: "destructive", duration: 10000 });
          return;
        }
        
        if (payloads.length === 0) {
            csvParseError = "No valid asset data found in CSV.";
            toast({ title: "Empty CSV", description: csvParseError, variant: "warning" });
            return;
        }

        parsedCsvPayloads = payloads;
        uploadProgress = { total: payloads.length, processed: 0, success: 0, errors: 0, errorDetails: [] };
        toast({ title: "CSV Parsed", description: `${payloads.length} assets ready for creation.`, variant: "success" });
      },
      error: (error: Error) => {
        isParsingCSV = false;
        csvParseError = `Failed to parse CSV: ${error.message}`;
        toast({ title: "CSV Parsing Failed", description: csvParseError, variant: "destructive" });
      }
    });
  }


  // Submit the form
  async function submitForm() {
    isSubmitting = true;
    fieldErrors = {};
    // uploadProgress = null; // Reset progress for manual/single submissions, CSV handles its own
    if (addMode !== 'csv_bulk') {
      uploadProgress = null; 
    }
    const caseId = $page.params.case_id;
    
    // --- CSV BULK SUBMISSION ---
    if (addMode === 'csv_bulk') {
      if (parsedCsvPayloads.length === 0) {
        toast({ title: "No Data", description: "No assets parsed from CSV to submit.", variant: "warning" });
        isSubmitting = false;
        return;
      }
      // Validation for asset_type_id is now handled within parseAndPrepareCSV for each row.
      // The global assetData.asset_type_id is not used as a fallback for CSV if a type cannot be determined from the row.

      uploadProgress = { total: parsedCsvPayloads.length, processed: 0, success: 0, errors: 0, errorDetails: [] };

      for (const payload of parsedCsvPayloads) {
        // Payload from parseAndPrepareCSV now includes resolved asset_type_id, analysis_status_id, and compromise_status_id
        // It also sets ioc_links to []
        const finalPayload = { ...payload }; 
        // No need to merge with assetData for these fields if CSV provides them or parseAndPrepareCSV sets defaults.

        try {
          const response = await AssetService.addAsset(caseId, finalPayload);
          if (response?.ok) {
            assetsStore.addAsset(response.data as Asset);
            uploadProgress.success++;
          } else {
            uploadProgress.errors++;
            const errorMsg = response?.data?.message || (response?.data?.data ? JSON.stringify(response.data.data) : 'Unknown error');
            uploadProgress.errorDetails.push({ name: finalPayload.asset_name, error: errorMsg });
          }
        } catch (error: any) {
          uploadProgress.errors++;
          uploadProgress.errorDetails.push({ name: finalPayload.asset_name, error: error.message || 'Network error' });
        }
        uploadProgress.processed++;
        // Force reactivity for progress object if needed, though direct property updates should work with $state
        uploadProgress = { ...uploadProgress }; 
      }
      // Final toast for CSV
      if (uploadProgress.success > 0 && uploadProgress.errors === 0) {
        toast({ title: "Assets Added", description: `${uploadProgress.success} assets from CSV successfully added.`, variant: "success" });
      } else if (uploadProgress.success > 0 && uploadProgress.errors > 0) {
        toast({ title: "Partial Success (CSV)", description: `${uploadProgress.success} assets added, ${uploadProgress.errors} failed. Check console for details.`, variant: "warning", duration: 7000 });
        console.error("CSV Upload Errors:", uploadProgress.errorDetails);
      } else if (uploadProgress.errors > 0) {
        toast({ title: "Error Adding Assets (CSV)", description: `Failed to add ${uploadProgress.errors} assets. Check console for details.`, variant: "destructive", duration: 7000 });
        console.error("CSV Upload Errors:", uploadProgress.errorDetails);
      }
      if (uploadProgress.success > 0) {
        assetsStore.triggerListRefresh();
        open = false; // Close modal on any success
        resetForm();
      }
    // --- MANUAL BULK SUBMISSION (Textarea) ---
    } else if (addMode === 'manual_bulk') {
      const assetNamesArray = assetData.asset_name.split('\n')
        .map(name => name.trim())
        .filter(name => name.length > 0);
      const uniqueAssetNames = [...new Set(assetNamesArray)];

      if (uniqueAssetNames.length === 0) {
        toast({ title: "Validation Error", description: "Please provide at least one asset name.", variant: "destructive" });
        isSubmitting = false;
        return;
      }
      if (!assetData.asset_type_id) {
        toast({ title: "Validation Error", description: "Asset type is required for all assets.", variant: "destructive" });
        isSubmitting = false;
        return;
      }
      
      // Initialize progress for manual bulk
      uploadProgress = { total: uniqueAssetNames.length, processed: 0, success: 0, errors: 0, errorDetails: [] };

      const commonPayloadBase = {
        asset_description: assetData.asset_description,
        asset_ip: assetData.asset_ip,
        asset_domain: assetData.asset_domain,
        asset_type_id: assetData.asset_type_id,
        analysis_status_id: assetData.analysis_status_id,
        asset_compromise_status_id: assetData.asset_compromise_status_id,
        asset_tags: currentTags.map(tag => tag.tag_title).join(','), // Use currentTags for manual bulk
        ioc_links: selectedIOCsForNewAsset.map(ioc => ioc.ioc_id)
      };

      for (const name of uniqueAssetNames) {
        try {
          const payload = { ...commonPayloadBase, asset_name: name };
          const response = await AssetService.addAsset(caseId, payload);
          if (response?.ok) {
            assetsStore.addAsset(response.data as Asset);
            uploadProgress.success++;
          } else {
            uploadProgress.errors++;
            const errorMsg = response?.data?.message || (response?.data?.data ? JSON.stringify(response.data.data) : 'Unknown error');
            uploadProgress.errorDetails.push({ name: name, error: errorMsg });
          }
        } catch (error: any) {
          uploadProgress.errors++;
          uploadProgress.errorDetails.push({ name: name, error: error.message || 'Network error' });
        }
        uploadProgress.processed++;
        uploadProgress = { ...uploadProgress };
      }
      // Final toast for manual bulk
      if (uploadProgress.success > 0 && uploadProgress.errors === 0) {
        toast({ title: "Assets Added", description: `${uploadProgress.success} asset${uploadProgress.success > 1 ? 's' : ''} successfully added.`, variant: "success" });
      } else if (uploadProgress.success > 0 && uploadProgress.errors > 0) {
        toast({ title: "Partial Success", description: `${uploadProgress.success} asset${uploadProgress.success > 1 ? 's' : ''} added. ${uploadProgress.errors} failed. Errors: ${uploadProgress.errorDetails.slice(0,1).map(e=>e.error).join('; ')}... (see console for details)`, variant: "warning", duration: 7000 });
         console.error("Manual Bulk Upload Errors:", uploadProgress.errorDetails);
      } else if (uploadProgress.errors > 0) {
         toast({ title: "Error Adding Assets", description: `Failed to add ${uploadProgress.errors} asset${uploadProgress.errors > 1 ? 's' : ''}. Errors: ${uploadProgress.errorDetails.slice(0,1).map(e=>e.error).join('; ')}... (see console for details)`, variant: "destructive", duration: 7000 });
         console.error("Manual Bulk Upload Errors:", uploadProgress.errorDetails);
      }
      if (uploadProgress.success > 0) {
        assetsStore.triggerListRefresh();
        open = false;
        resetForm();
      }
    // --- SINGLE ASSET SUBMISSION ---
    } else { // 'single' asset
      if (!assetData.asset_name.trim()) {
        toast({ title: "Validation Error", description: "Asset name is required", variant: "destructive" });
        isSubmitting = false;
        return;
      }
      if (!assetData.asset_type_id) {
        toast({ title: "Validation Error", description: "Asset type is required.", variant: "destructive" });
        isSubmitting = false;
        return;
      }

      try {
        const payload = {
          asset_name: assetData.asset_name.trim(),
          asset_description: assetData.asset_description,
          asset_ip: assetData.asset_ip,
          asset_domain: assetData.asset_domain,
          asset_type_id: assetData.asset_type_id,
          analysis_status_id: assetData.analysis_status_id,
          asset_compromise_status_id: assetData.asset_compromise_status_id,
          asset_tags: currentTags.map(tag => tag.tag_title).join(','), // Use currentTags for single
          ioc_links: selectedIOCsForNewAsset.map(ioc => ioc.ioc_id)
        };
        const response = await AssetService.addAsset(caseId, payload);
        if (response?.ok) {
          assetsStore.addAsset(response.data as Asset);
          toast({ title: "Asset Added", description: `${payload.asset_name} has been successfully added.`, variant: "success" });
          assetsStore.triggerListRefresh();
          open = false;
          resetForm();
        } else {
          if (response?.data?.data) {
            fieldErrors = response.data.data;
          } else {
            toast({ title: "Error", description: response?.data?.message || "Failed to add asset. Please try again.", variant: "destructive" });
          }
        }
      } catch (error) {
        toast({ title: "Error", description: "Failed to add asset. Please try again.", variant: "destructive" });
      }
    }
    isSubmitting = false;
  }
</script>

<Dialog bind:open>
  <DialogContent class="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
    <DialogHeader>
      <DialogTitle class="flex items-center gap-2">
        {#if addMode === 'manual_bulk'}
          <ListPlusIcon class="h-5 w-5 text-primary" />
          Add Multiple Assets
        {:else if addMode === 'csv_bulk'}
          <UploadCloudIcon class="h-5 w-5 text-primary" />
          Add Assets via CSV
        {:else}
          <ServerIcon class="h-5 w-5 text-primary" />
          Add Single Asset
        {/if}
      </DialogTitle>
      <DialogDescription>
        {#if addMode === 'manual_bulk'}
          Create multiple new assets by entering one name per line. Other details below will apply to all these assets.
        {:else if addMode === 'csv_bulk'}
          Upload a CSV file to create multiple assets. Details from the CSV will be used where provided, otherwise global values below will apply.
        {:else}
          Create a single new asset and optionally link it to existing IOCs.
        {/if}
      </DialogDescription>
    </DialogHeader>
    
    <div class="flex-1 overflow-y-auto py-4 ">
      <div class="space-y-6 max-w-[95%] mx-auto">
        <!-- Mode Selection -->
        <section>
          <div class="flex items-center justify-start gap-2 mb-4">
            <Button 
              variant={addMode === 'single' ? 'secondary' : 'outline'} 
              size="sm"
              onclick={() => { addMode = 'single'; resetCsvRelatedState(); uploadProgress = null; }}>
              Single Asset
            </Button>
            <Button 
              variant={addMode === 'manual_bulk' ? 'secondary' : 'outline'} 
              size="sm"
              onclick={() => { addMode = 'manual_bulk'; resetCsvRelatedState(); uploadProgress = null; }}>
              Multiple Assets
            </Button>
            <Button 
              variant={addMode === 'csv_bulk' ? 'secondary' : 'outline'} 
              size="sm"
              onclick={() => { addMode = 'csv_bulk'; }}>
              CSV Upload
            </Button>
          </div>
        </section>

        <!-- Asset Name Input / CSV Upload -->
        {#if addMode === 'single' || addMode === 'manual_bulk'}
          <div class="space-y-2 mb-6">
            <Label for="asset_name_input" class="font-medium">
              Asset Name{addMode === 'single' ? '' : 's (one per line)'} <span class="text-destructive">*</span>
            </Label>
            <Textarea 
              id="asset_name_input" 
              bind:value={assetData.asset_name} 
              placeholder={addMode === 'single' ? "Enter asset name" : "Enter asset names, one per line...\nExampleAsset1\nExampleAsset2"}
              required
              rows={addMode === 'single' ? 1 : 5}
              class={`w-full ${fieldErrors.asset_name && addMode === 'single' ? "border-destructive" : ""}`}
            />
            {#if fieldErrors.asset_name && addMode === 'single'} <!-- Only show field error for single mode here -->
              <p class="text-xs text-destructive">{fieldErrors.asset_name[0]}</p>
            {/if}
          </div>
        {:else if addMode === 'csv_bulk'}
          <div class="space-y-2 mb-6">
            <Label for="csv_file_input" class="font-medium">CSV File <span class="text-destructive">*</span></Label>
            <Input 
              type="file" 
              id="csv_file_input" 
              accept=".csv"
              onchange={handleFileSelect}
              class="w-full"
            />
            <p class="text-xs text-muted-foreground">
              Required: <code class="text-xs bg-muted p-0.5 rounded">asset_name</code>, and (<code class="text-xs bg-muted p-0.5 rounded">asset_type_name</code> or <code class="text-xs bg-muted p-0.5 rounded">asset_type_id</code>).
              Optional: <code class="text-xs bg-muted p-0.5 rounded">asset_description</code>, <code class="text-xs bg-muted p-0.5 rounded">asset_ip</code>, <code class="text-xs bg-muted p-0.5 rounded">asset_domain</code>, <code class="text-xs bg-muted p-0.5 rounded">asset_tags</code> (pipe | separated),
              <code class="text-xs bg-muted p-0.5 rounded">analysis_status_id</code>, <code class="text-xs bg-muted p-0.5 rounded">analysis_status_name</code>, 
              <code class="text-xs bg-muted p-0.5 rounded">compromise_status_id</code>, <code class="text-xs bg-muted p-0.5 rounded">compromise_status_name</code>.
            </p>
            {#if isParsingCSV}
              <p class="text-sm text-primary flex items-center gap-1"><span class="animate-spin mr-1">⟳</span> Parsing CSV...</p>
            {/if}
            {#if csvParseError}
              <p class="text-sm text-destructive">{csvParseError}</p>
            {/if}
            {#if parsedCsvPayloads.length > 0 && !csvParseError}
              <p class="text-sm text-success">{parsedCsvPayloads.length} assets parsed from CSV and ready for creation.</p>
            {/if}
          </div>
        {/if}
        
        <!-- Common Fields (apply to all assets in bulk, or the single asset) -->
        {#if addMode !== 'csv_bulk'} 
        <section>
          <div class="flex items-center gap-2 mb-4">
            <ComponentIcon class="h-5 w-5 text-primary" />
            <h2 class="text-lg font-semibold">
              {#if addMode !== 'single'}Global Asset Details (applied to all)
              {:else}Asset Details
              {/if}
            </h2>
          </div>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div class="space-y-2">
              <Label for="asset_type" class="font-medium">Asset Type <span class="text-destructive">*</span></Label>
              <Select 
                value={assetData.asset_type_id?.toString()} 
                onValueChange={value => assetData.asset_type_id = parseInt(value)}
                required
                class={fieldErrors.asset_type_id ? "border-destructive" : ""}
                type="single"
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
                value={assetData.analysis_status_id?.toString()} 
                onValueChange={value => assetData.analysis_status_id = parseInt(value)}
                type="single"
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
                value={assetData.asset_compromise_status_id.toString()} 
                onValueChange={value => assetData.asset_compromise_status_id = parseInt(value)}
                class={fieldErrors.asset_compromise_status_id ? "border-destructive" : ""}
                type="single"
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

            <!-- Common Description, IP, Domain, Tags - only if not CSV mode or CSV has no data -->
            {#if addMode !== 'csv_bulk'}
              <div class="space-y-2 md:col-span-2">
                <Label for="asset_description_common" class="font-medium">Description</Label>
                <Textarea 
                  id="asset_description_common"
                  bind:value={assetData.asset_description}
                  placeholder="Provide a detailed description (applies to all if in bulk)"
                  rows={3}
                  class={`w-full ${fieldErrors.asset_description ? "border-destructive" : ""}`}
                />
                {#if fieldErrors.asset_description}
                  <p class="text-xs text-destructive">{fieldErrors.asset_description[0]}</p>
                {/if}
              </div>
              <div class="space-y-2">
                <Label for="asset_ip_common" class="font-medium">IP Address</Label>
                <Input id="asset_ip_common" bind:value={assetData.asset_ip} placeholder="e.g. 192.168.1.1" class={fieldErrors.asset_ip ? "border-destructive" : ""} />
                {#if fieldErrors.asset_ip} <p class="text-xs text-destructive">{fieldErrors.asset_ip[0]}</p> {/if}
              </div>
              <div class="space-y-2">
                <Label for="asset_domain_common" class="font-medium">Domain</Label>
                <Input id="asset_domain_common" bind:value={assetData.asset_domain} placeholder="e.g. example.com" class={fieldErrors.asset_domain ? "border-destructive" : ""} />
                {#if fieldErrors.asset_domain} <p class="text-xs text-destructive">{fieldErrors.asset_domain[0]}</p> {/if}
              </div>
               <div class="space-y-2 md:col-span-2">
                <Label class="font-medium">Tags</Label>
                <TagInput 
                  tags={currentTags} 
                  outputFormat="array"
                  onchange={handleTagsChange}
                  placeholder="Add tags (applies to all if in bulk)"
                  maxTags={20}
                  class={fieldErrors.asset_tags ? "border-destructive" : ""}
                />
                {#if fieldErrors.asset_tags} <p class="text-xs text-destructive">{fieldErrors.asset_tags[0]}</p> {/if}
              </div>
            {/if}
          </div>
        </section>
        {/if} <!-- End of common fields section conditional hide -->

        <!-- Upload Progress Display -->
        {#if uploadProgress && uploadProgress.total > 0}
          <section>
            <h3 class="text-md font-semibold mb-2">Upload Progress</h3>
            <Progress value={(uploadProgress.processed / uploadProgress.total) * 100} class="w-full mb-1" />
            <p class="text-sm text-muted-foreground">
              Processed: {uploadProgress.processed} / {uploadProgress.total} | 
              Successful: <span class="text-success">{uploadProgress.success}</span> | 
              Errors: <span class="text-destructive">{uploadProgress.errors}</span>
            </p>
            {#if uploadProgress.errors > 0 && uploadProgress.errorDetails.length > 0}
              <div class="mt-2 max-h-32 overflow-y-auto border p-2 rounded-md bg-destructive/5">
                <p class="text-xs font-medium text-destructive mb-1">Error Details:</p>
                <ul class="list-disc pl-4 text-xs">
                  {#each uploadProgress.errorDetails.slice(0, 5) as detail}
                    <li><strong>{detail.name}:</strong> {detail.error}</li>
                  {/each}
                  {#if uploadProgress.errorDetails.length > 5}
                    <li>...and {uploadProgress.errorDetails.length - 5} more (see console).</li>
                  {/if}
                </ul>
              </div>
            {/if}
          </section>
        {/if}
        
        <!-- IOCs Section -->
        {#if addMode !== 'csv_bulk'}
        <section>
          <div class="flex items-center gap-2 mb-4">
            <ShieldAlertIcon class="h-5 w-5 text-primary" />
            <h2 class="text-lg font-semibold">Link Indicators of Compromise {#if addMode !== 'single'}(applied to all){/if}</h2>
          </div>
          <div class="mb-4">
            <IOCLinkButton 
              caseId={$page.params.case_id} 
              mode="select"
              bind:selectedForLinking={selectedIOCsForNewAsset}
            />
          </div>
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
          {:else if addMode !== 'csv_bulk'}
            <div class="text-center py-4 bg-muted/30 rounded-lg border border-dashed">
              <InfoIcon class="h-6 w-6 mx-auto text-muted-foreground mb-2" />
              <p class="text-muted-foreground text-sm">No IOCs selected to link.</p>
            </div>
          {/if}
        </section>
        {/if} <!-- End of IOCs section conditional hide -->
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
        <Button 
          onclick={submitForm} 
          disabled={
            isSubmitting || 
            (addMode === 'single' && (!assetData.asset_name.trim() || !assetData.asset_type_id)) ||
            (addMode === 'manual_bulk' && (assetData.asset_name.split('\n').map(n=>n.trim()).filter(n=>n).length === 0 || !assetData.asset_type_id)) ||
            (addMode === 'csv_bulk' && (parsedCsvPayloads.length === 0 || isParsingCSV)) 
          }
        >
          {#if isSubmitting}
            <span class="animate-spin mr-2">⟳</span> 
            {#if uploadProgress && uploadProgress.total > 0 && addMode === 'csv_bulk'}
              Processing {uploadProgress.processed}/{uploadProgress.total}...
            {:else if uploadProgress && uploadProgress.total > 0 && addMode === 'manual_bulk'}
               Processing {uploadProgress.processed}/{uploadProgress.total}...
            {:else}
              Adding...
            {/if}
          {:else if addMode === 'manual_bulk'}
            <ListPlusIcon class="h-4 w-4 mr-2" /> Add Assets
          {:else if addMode === 'csv_bulk'}
            <UploadCloudIcon class="h-4 w-4 mr-2" /> Create {parsedCsvPayloads.length > 0 ? parsedCsvPayloads.length : ''} Assets from CSV
          {:else} 
            <PlusIcon class="h-4 w-4 mr-2" /> Add Asset
          {/if}
        </Button>
      </div>
    </DialogFooter>
  </DialogContent>
</Dialog>

