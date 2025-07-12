<script lang="ts">
  import { 
    PlusIcon, 
    ServerIcon, 
    ComponentIcon,
    ListPlusIcon, // For "Add Iocs"
    UploadCloudIcon // For CSV Upload
  } from 'lucide-svelte';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Textarea } from '$lib/components/ui/textarea'; // Added
  import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '$lib/components/ui/dialog';
  import { Label } from '$lib/components/ui/label';
  import { TagInput } from '$lib/components/common/tag';
  import { toast } from '$lib/components/ui/toast';
  import { iocTypes } from '$lib/stores/ioc-types.store';
  import { tlpList } from '$lib/stores/tlp.store';
  import { iocsStore } from '$lib/stores/iocs.store';
  import { page } from '$app/stores'; // Corrected import
  import { IocService } from '$lib/services/ioc.service';
  import type { Tag } from '$lib/stores/tags.store';
  import type { Ioc } from '$lib/types/resources/ioc';
  import { Select, SelectContent, SelectItem, SelectTrigger } from '$lib/components/ui/select';
  import Papa from 'papaparse'; // Added for CSV parsing
  import { Progress } from '$lib/components/ui/progress'
  import IocTypeSelect from '$lib/components/common/selects/IocTypeSelect.svelte';
  import TlpSelect from '$lib/components/common/selects/TlpSelect.svelte';

  // Props
  let { open = $bindable(false) }: {
    open?: boolean;
  } = $props();

  // State
  let isSubmitting = $state(false);
  let currentTags = $state<Tag[]>([]);
  let fieldErrors = $state<Record<string, string[]>>({});
  let addMode = $state<'single' | 'manual_bulk' | 'csv_bulk'>('manual_bulk'); // New mode state, default to manual_bulk

  // CSV specific state
  let csvFile = $state<File | null>(null);
  let isParsingCSV = $state(false);
  let csvParseError = $state<string | null>(null);
  let parsedCsvPayloads = $state<any[]>([]); // Stores payloads generated from CSV
  let uploadProgress = $state<{ total: number; processed: number; success: number; errors: number; errorDetails: { name: string, error: string }[] } | null>(null);


  // Form data (used for single ioc or as defaults/globals for bulk)
  let iocData = $state({
    ioc_name: '', // For single ioc or manual bulk names
    ioc_description: '',
    ioc_type_id: undefined as number | undefined,
    ioc_tlp_id: undefined as number | undefined,
    ioc_tags: '' // For single ioc, tags are handled by currentTags for bulk
  });

  // Initialize stores
  $effect(() => {
    if (open) {
      iocTypes.fetch();
      tlpList.fetch();
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
    iocData = {
      ioc_name: '',
      ioc_description: '',
      ioc_type_id: undefined,
      ioc_tlp_id: undefined,
      ioc_tags: ''
    };
    currentTags = [];
    fieldErrors = {};
    addMode = 'manual_bulk'; // Default to manual_bulk
    resetCsvRelatedState(); // Reset CSV states
    uploadProgress = null; // Also reset any lingering progress display
  }

  // Handle tag changes (used for single ioc mode, and as default for bulk if not in CSV)
  function handleTagsChange(newTags: Tag[]) {
    currentTags = newTags;
    if (addMode === 'single' || addMode === 'manual_bulk') { // Only update iocData.ioc_tags if not CSV
        iocData.ioc_tags = newTags.map(tag => tag.tag_title).join(',');
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

    // Ensure ioc types and TLP are loaded
    if ($iocTypes.length === 0) await iocTypes.fetch();
    if ($tlpList.length === 0) await tlpList.fetch();
    
    const defaultTlp = $tlpList.find(t => t.tlp_name.toLowerCase() === 'clear');
    const defaultTlpId = defaultTlp?.tlp_id;

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

        const requiredHeaders = ['ioc_name']; // ioc_type_name or ioc_type_id is now conditionally required
        const actualHeaders = results.meta.fields;
        if (!actualHeaders || !requiredHeaders.every(h => actualHeaders.includes(h))) {
          csvParseError = `CSV must contain at least header: ${requiredHeaders.join(', ')}. Found: ${actualHeaders?.join(', ') || 'none'}.`;
          toast({ title: "CSV Header Error", description: csvParseError, variant: "destructive", duration: 7000 });
          return;
        }
        if (!actualHeaders.includes('ioc_type_name') && !actualHeaders.includes('ioc_type_id')) {
          csvParseError = `CSV must contain either 'ioc_type_name' or 'ioc_type_id' header.`;
          toast({ title: "CSV Header Error", description: csvParseError, variant: "destructive", duration: 7000 });
          return;
        }


        const payloads: any[] = [];
        const parseErrors: string[] = [];

        results.data.forEach((row: any, index: number) => {
          const ioc_name = row.ioc_name?.trim();
          const csv_ioc_type_name = row.ioc_type_name?.trim();
          const csv_ioc_type_id = row.ioc_type_id?.trim();
          
          let ioc_type_id_to_use: number | undefined = undefined;

          if (!ioc_name) {
            parseErrors.push(`Row ${index + 1}: ioc_name is missing or empty.`);
            return; // Skip this row
          }

          // Determine ioc_type_id
          if (csv_ioc_type_id) {
            const parsedId = parseInt(csv_ioc_type_id);
            if (!isNaN(parsedId) && $iocTypes.find(t => t.type_id === parsedId)) {
              ioc_type_id_to_use = parsedId;
            } else {
              parseErrors.push(`Row ${index + 1} ('${ioc_name}'): Invalid ioc_type_id '${csv_ioc_type_id}'.`);
            }
          }
          
          if (!ioc_type_id_to_use && csv_ioc_type_name) {
            const iocTypeByName = $iocTypes.find(t => t.type_name.toLowerCase() === csv_ioc_type_name.toLowerCase());
            if (iocTypeByName) {
              ioc_type_id_to_use = iocTypeByName.type_id;
            } else {
              parseErrors.push(`Row ${index + 1} ('${ioc_name}'): Invalid ioc_type_name '${csv_ioc_type_name}' and no valid ioc_type_id provided.`);
            }
          }
          
          if (!ioc_type_id_to_use) {
            if (!csv_ioc_type_id && !csv_ioc_type_name) {
              parseErrors.push(`Row ${index + 1} ('${ioc_name}'): Missing ioc_type_name or ioc_type_id.`);
            }
            // If errors were pushed due to invalid ID/Name, we don't need another message here.
            return; // Skip this row if type couldn't be determined
          }

          // Optional: TLP from CSV
          let tlp_id_to_use = iocData.ioc_tlp_id || defaultTlpId;
          if (row.tlp_id?.trim()) {
            const parsedTlpId = parseInt(row.tlp_id.trim());
            if (!isNaN(parsedTlpId) && $tlpList.find(t => t.tlp_id === parsedTlpId)) {
              tlp_id_to_use = parsedTlpId;
            } else {
               parseErrors.push(`Row ${index + 1} ('${ioc_name}'): Invalid tlp_id '${row.tlp_id.trim()}'. Using global/default.`);
            }
          } else if (row.tlp_name?.trim()) {
            const tlpByName = $tlpList.find(t => t.tlp_name.toLowerCase() === row.tlp_name.trim().toLowerCase());
            if (tlpByName) {
              tlp_id_to_use = tlpByName.tlp_id;
            } else {
              parseErrors.push(`Row ${index + 1} ('${ioc_name}'): Invalid tlp_name '${row.tlp_name.trim()}'. Using global/default.`);
            }
          }


          payloads.push({
            ioc_value: ioc_name,
            ioc_type_id: ioc_type_id_to_use,
            ioc_tlp_id: tlp_id_to_use || defaultTlpId!,
            ioc_description: row.ioc_description?.trim() || iocData.ioc_description,
            ioc_tags: row.ioc_tags?.replace(/\|/g, ',').trim() || iocData.ioc_tags
          });
        });

        if (parseErrors.length > 0) {
          csvParseError = `Errors during CSV data preparation: ${parseErrors.slice(0,3).join('; ')}... (see console for all)`;
          console.error("CSV Data Preparation Errors:", parseErrors);
          toast({ title: "CSV Data Error", description: csvParseError, variant: "destructive", duration: 10000 });
          return;
        }
        
        if (payloads.length === 0) {
            csvParseError = "No valid ioc data found in CSV.";
            toast({ title: "Empty CSV", description: csvParseError, variant: "warning" });
            return;
        }

        parsedCsvPayloads = payloads;
        uploadProgress = { total: payloads.length, processed: 0, success: 0, errors: 0, errorDetails: [] };
        toast({ title: "CSV Parsed", description: `${payloads.length} iocs ready for creation.`, variant: "success" });
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
    if (addMode === 'single' || addMode === 'manual_bulk') {
      uploadProgress = null; 
    }
    const caseId = parseInt($page.params.case_id);
    
    // --- CSV BULK SUBMISSION ---
    if (addMode === 'csv_bulk') {
      if (parsedCsvPayloads.length === 0) {
        toast({ title: "No Data", description: "No iocs parsed from CSV to submit.", variant: "warning" });
        isSubmitting = false;
        return;
      }
      // Validation for ioc_type_id is now handled within parseAndPrepareCSV for each row.
      // The global iocData.ioc_type_id is not used as a fallback for CSV if a type cannot be determined from the row.

      uploadProgress = { total: parsedCsvPayloads.length, processed: 0, success: 0, errors: 0, errorDetails: [] };

      for (const payload of parsedCsvPayloads) {
        // Payload from parseAndPrepareCSV now includes resolved ioc_type_id, analysis_status_id, and compromise_status_id
        // It also sets ioc_links to []
        const finalPayload = { ...payload }; 
        // No need to merge with iocData for these fields if CSV provides them or parseAndPrepareCSV sets defaults.

        try {
          const ioc = await IocService.addIoc(caseId, finalPayload);
          iocsStore.addIoc(ioc);
          uploadProgress.success++;
        } catch (error: any) {
          uploadProgress.errors++;
          uploadProgress.errorDetails.push({ name: finalPayload.ioc_value, error: error.message || 'Network error' });
        }
        uploadProgress.processed++;
        // Force reactivity for progress object if needed, though direct property updates should work with $state
        uploadProgress = { ...uploadProgress }; 
      }
      // Final toast for CSV
      if (uploadProgress.success > 0 && uploadProgress.errors === 0) {
        toast({ title: "Iocs Added", description: `${uploadProgress.success} iocs from CSV successfully added.`, variant: "success" });
      } else if (uploadProgress.success > 0 && uploadProgress.errors > 0) {
        toast({ title: "Partial Success (CSV)", description: `${uploadProgress.success} iocs added, ${uploadProgress.errors} failed. Check console for details.`, variant: "warning", duration: 7000 });
        console.error("CSV Upload Errors:", uploadProgress.errorDetails);
      } else if (uploadProgress.errors > 0) {
        toast({ title: "Error Adding Iocs (CSV)", description: `Failed to add ${uploadProgress.errors} iocs. Check console for details.`, variant: "destructive", duration: 7000 });
        console.error("CSV Upload Errors:", uploadProgress.errorDetails);
      }
      if (uploadProgress.success > 0) {
        iocsStore.triggerListRefresh();
        open = false; // Close modal on any success
        resetForm();
      }
    // --- MANUAL BULK SUBMISSION (Textarea) ---
    } else if (addMode === 'manual_bulk') {
      const iocNamesArray = iocData.ioc_name.split('\n')
        .map(name => name.trim())
        .filter(name => name.length > 0);
      const uniqueIocNames = [...new Set(iocNamesArray)];

      if (uniqueIocNames.length === 0) {
        toast({ title: "Validation Error", description: "Please provide at least one ioc name.", variant: "destructive" });
        isSubmitting = false;
        return;
      }
      if (!iocData.ioc_type_id) {
        toast({ title: "Validation Error", description: "Ioc type is required for all iocs.", variant: "destructive" });
        isSubmitting = false;
        return;
      }
      if (!iocData.ioc_tlp_id) {
        toast({ title: "Validation Error", description: "TLP level is required for all iocs.", variant: "destructive" });
        isSubmitting = false;
        return;
      }
      
      // Initialize progress for manual bulk
      uploadProgress = { total: uniqueIocNames.length, processed: 0, success: 0, errors: 0, errorDetails: [] };

      const commonPayloadBase = {
        ioc_description: iocData.ioc_description,
        ioc_type_id: iocData.ioc_type_id!,
        ioc_tlp_id: iocData.ioc_tlp_id!,
        ioc_tags: currentTags.map(tag => tag.tag_title).join(',') // Use currentTags for manual bulk
      };

      for (const name of uniqueIocNames) {
        try {
          const payload = { ...commonPayloadBase, ioc_value: name };
          const ioc = await IocService.addIoc(caseId, payload);
          iocsStore.addIoc(ioc);
          uploadProgress.success++;
        } catch (error: any) {
          uploadProgress.errors++;
          uploadProgress.errorDetails.push({ name: name, error: error.message || 'Network error' });
        }
        uploadProgress.processed++;
        uploadProgress = { ...uploadProgress };
      }
      // Final toast for manual bulk
      if (uploadProgress.success > 0 && uploadProgress.errors === 0) {
        toast({ title: "Iocs Added", description: `${uploadProgress.success} ioc${uploadProgress.success > 1 ? 's' : ''} successfully added.`, variant: "success" });
      } else if (uploadProgress.success > 0 && uploadProgress.errors > 0) {
        toast({ title: "Partial Success", description: `${uploadProgress.success} ioc${uploadProgress.success > 1 ? 's' : ''} added. ${uploadProgress.errors} failed. Errors: ${uploadProgress.errorDetails.slice(0,1).map(e=>e.error).join('; ')}... (see console for details)`, variant: "warning", duration: 7000 });
         console.error("Manual Bulk Upload Errors:", uploadProgress.errorDetails);
      } else if (uploadProgress.errors > 0) {
         toast({ title: "Error Adding Iocs", description: `Failed to add ${uploadProgress.errors} ioc${uploadProgress.errors > 1 ? 's' : ''}. Errors: ${uploadProgress.errorDetails.slice(0,1).map(e=>e.error).join('; ')}... (see console for details)`, variant: "destructive", duration: 7000 });
         console.error("Manual Bulk Upload Errors:", uploadProgress.errorDetails);
      }
      if (uploadProgress.success > 0) {
        iocsStore.triggerListRefresh();
        open = false;
        resetForm();
      }
    // --- SINGLE ASSET SUBMISSION ---
    } else { // 'single' ioc
      if (!iocData.ioc_name.trim()) {
        toast({ title: "Validation Error", description: "Ioc name is required", variant: "destructive" });
        isSubmitting = false;
        return;
      }
      if (!iocData.ioc_type_id) {
        toast({ title: "Validation Error", description: "Ioc type is required.", variant: "destructive" });
        isSubmitting = false;
        return;
      }
      if (!iocData.ioc_tlp_id) {
        toast({ title: "Validation Error", description: "TLP level is required.", variant: "destructive" });
        isSubmitting = false;
        return;
      }

      try {
        const payload = {
          ioc_value: iocData.ioc_name.trim(),
          ioc_description: iocData.ioc_description,
          ioc_type_id: iocData.ioc_type_id!,
          ioc_tlp_id: iocData.ioc_tlp_id!,
          ioc_tags: currentTags.map(tag => tag.tag_title).join(',') // Use currentTags for single
        };
        const ioc = await IocService.addIoc(caseId, payload);
        iocsStore.addIoc(ioc);
        toast({ title: "Ioc Added", description: `${payload.ioc_value} has been successfully added.`, variant: "success" });
        iocsStore.triggerListRefresh();
        open = false;
        resetForm();
      } catch (error: any) {
        toast({ title: "Error", description: error.message || "Failed to add ioc. Please try again.", variant: "destructive" });
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
          Add Multiple Iocs
        {:else if addMode === 'csv_bulk'}
          <UploadCloudIcon class="h-5 w-5 text-primary" />
          Add Iocs via CSV
        {:else}
          <ServerIcon class="h-5 w-5 text-primary" />
          Add Single Ioc
        {/if}
      </DialogTitle>
      <DialogDescription>
        {#if addMode === 'manual_bulk'}
          Create multiple new iocs by entering one name per line. Other details below will apply to all these iocs.
        {:else if addMode === 'csv_bulk'}
          Upload a CSV file to create multiple iocs. Details from the CSV will be used where provided, otherwise global values below will apply.
        {:else}
          Create a single new ioc and optionally link it to existing IOCs.
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
              Single Ioc
            </Button>
            <Button 
              variant={addMode === 'manual_bulk' ? 'secondary' : 'outline'} 
              size="sm"
              onclick={() => { addMode = 'manual_bulk'; resetCsvRelatedState(); uploadProgress = null; }}>
              Multiple Iocs
            </Button>
            <Button 
              variant={addMode === 'csv_bulk' ? 'secondary' : 'outline'} 
              size="sm"
              onclick={() => { addMode = 'csv_bulk'; }}>
              CSV Upload
            </Button>
          </div>
        </section>

        <!-- Ioc Name Input / CSV Upload -->
        {#if addMode === 'single' || addMode === 'manual_bulk'}
          <div class="space-y-2 mb-6">
            <Label for="ioc_name_input" class="font-medium">
              Ioc Name{addMode === 'single' ? '' : 's (one per line)'} <span class="text-destructive">*</span>
            </Label>
            <Textarea 
              id="ioc_name_input" 
              bind:value={iocData.ioc_name} 
              placeholder={addMode === 'single' ? "Enter ioc name" : "Enter ioc names, one per line...\nExampleIoc1\nExampleIoc2"}
              required
              rows={addMode === 'single' ? 1 : 5}
              class={`w-full ${fieldErrors.ioc_name && addMode === 'single' ? "border-destructive" : ""}`}
            />
            {#if fieldErrors.ioc_name && addMode === 'single'} <!-- Only show field error for single mode here -->
              <p class="text-xs text-destructive">{fieldErrors.ioc_name[0]}</p>
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
              Required: <code class="text-xs bg-muted p-0.5 rounded">ioc_name</code>, and (<code class="text-xs bg-muted p-0.5 rounded">ioc_type_name</code> or <code class="text-xs bg-muted p-0.5 rounded">ioc_type_id</code>).
              Optional: <code class="text-xs bg-muted p-0.5 rounded">ioc_description</code>, <code class="text-xs bg-muted p-0.5 rounded">ioc_tags</code> (pipe | separated),
              <code class="text-xs bg-muted p-0.5 rounded">tlp_id</code>, <code class="text-xs bg-muted p-0.5 rounded">tlp_name</code>.
            </p>
            {#if isParsingCSV}
              <p class="text-sm text-primary flex items-center gap-1"><span class="animate-spin mr-1">⟳</span> Parsing CSV...</p>
            {/if}
            {#if csvParseError}
              <p class="text-sm text-destructive">{csvParseError}</p>
            {/if}
            {#if parsedCsvPayloads.length > 0 && !csvParseError}
              <p class="text-sm text-success">{parsedCsvPayloads.length} iocs parsed from CSV and ready for creation.</p>
            {/if}
          </div>
        {/if}
        
        <!-- Common Fields (apply to all iocs in bulk, or the single ioc) -->
        {#if addMode !== 'csv_bulk'} 
        <section>
          <div class="flex items-center gap-2 mb-4">
            <ComponentIcon class="h-5 w-5 text-primary" />
            <h2 class="text-lg font-semibold">
              {#if addMode !== 'single'}Global Ioc Details (applied to all)
              {:else}Ioc Details
              {/if}
            </h2>
          </div>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div class="space-y-2">
              <Label for="ioc_type" class="font-medium">IOC Type <span class="text-destructive">*</span></Label>
              <IocTypeSelect
                value={iocData.ioc_type_id?.toString()}
                onValueChange={value => iocData.ioc_type_id = parseInt(value)}
                hasError={!!fieldErrors.ioc_type_id}
                id="ioc_type"
                required
              />
              {#if fieldErrors.ioc_type_id}
                <p class="text-xs text-destructive">{fieldErrors.ioc_type_id[0]}</p>
              {/if}
            </div>
            
            <div class="space-y-2">
              <Label for="tlp_level" class="font-medium">TLP Level</Label>
              <TlpSelect
                bind:value={iocData.ioc_tlp_id}
                onValueChange={(value: string) => iocData.ioc_tlp_id = parseInt(value)}
              />
              {#if fieldErrors.ioc_tlp_id}
                <p class="text-xs text-destructive">{fieldErrors.ioc_tlp_id[0]}</p>
              {/if}
            </div>

            <!-- Common Description, Tags - only if not CSV mode or CSV has no data -->
            {#if addMode === 'single' || addMode === 'manual_bulk'}
              <div class="space-y-2 md:col-span-2">
                <Label for="ioc_description_common" class="font-medium">Description</Label>
                <Textarea 
                  id="ioc_description_common"
                  bind:value={iocData.ioc_description}
                  placeholder="Provide a detailed description (applies to all if in bulk)"
                  rows={3}
                  class={`w-full ${fieldErrors.ioc_description ? "border-destructive" : ""}`}
                />
                {#if fieldErrors.ioc_description}
                  <p class="text-xs text-destructive">{fieldErrors.ioc_description[0]}</p>
                {/if}
              </div>
               <div class="space-y-2 md:col-span-2">
                <Label class="font-medium">Tags</Label>
                <TagInput 
                  tags={currentTags} 
                  outputFormat="array"
                  onchange={handleTagsChange}
                  placeholder="Add tags (applies to all if in bulk)"
                  maxTags={20}
                />
                {#if fieldErrors.ioc_tags} <p class="text-xs text-destructive">{fieldErrors.ioc_tags[0]}</p> {/if}
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
      </div>
    </div>

    <DialogFooter class="flex items-center justify-between pt-2">
      <div class="text-sm text-muted-foreground">
        <span class="text-destructive">*</span> Required fields
      </div>
      <div class="flex gap-2">
        <Button variant="outline" onclick={() => open = false} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button 
          onclick={submitForm} 
          disabled={
            isSubmitting || 
            (addMode === 'single' && (!iocData.ioc_name.trim() || !iocData.ioc_type_id)) ||
            (addMode === 'manual_bulk' && (iocData.ioc_name.split('\n').map(n=>n.trim()).filter(n=>n).length === 0 || !iocData.ioc_type_id)) ||
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
            <ListPlusIcon class="h-4 w-4 mr-2" /> Add Iocs
          {:else if addMode === 'csv_bulk'}
            <UploadCloudIcon class="h-4 w-4 mr-2" /> Create {parsedCsvPayloads.length > 0 ? parsedCsvPayloads.length : ''} Iocs from CSV
          {:else} 
            <PlusIcon class="h-4 w-4 mr-2" /> Add Ioc
          {/if}
        </Button>
      </div>
    </DialogFooter>
  </DialogContent>
</Dialog>

