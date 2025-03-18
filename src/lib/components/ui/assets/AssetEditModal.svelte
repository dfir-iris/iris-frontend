<script lang="ts">
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import { Textarea } from '$lib/components/ui/textarea';
  import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '$lib/components/ui/select';
  import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '$lib/components/ui/dialog';
  import { Loader2Icon, CheckIcon, XIcon } from 'lucide-svelte';
  import { AssetService } from '$lib/services/AssetService';
  import { toast } from '$lib/components/ui/toast';
  import type { Asset } from '$lib/types/resources/asset';

  let { asset, caseId, open = false, onClose = () => {}, onSaved = () => {} } = $props<{
    asset: Asset;
    caseId: string;
    open?: boolean;
    onClose?: () => void;
    onSaved?: (data: any) => void;
  }>();

  let loading = $state(false);
  let formData = $state({
    asset_name: asset.asset_name,
    asset_description: asset.asset_description || '',
    asset_ip: asset.asset_ip || '',
    asset_domain: asset.asset_domain || '',
    analysis_status_id: asset.analysis_status.id
  });

  async function handleSubmit() {
    loading = true;
    try {
      const response = await AssetService.updateAsset(caseId, asset.asset_id, formData);
      toast({
        title: "Asset updated",
        description: "The asset has been successfully updated.",
        variant: "success"
      });
      onSaved(response.data);
      open = false;
    } catch (error) {
      console.error('Error updating asset:', error);
      toast({
        title: "Update failed",
        description: "There was a problem updating the asset.",
        variant: "destructive"
      });
    } finally {
      loading = false;
    }
  }
</script>

<Dialog bind:open on:close={onClose}>
  <DialogContent class="sm:max-w-[600px]">
    <DialogHeader>
      <DialogTitle>Edit Asset</DialogTitle>
      <DialogDescription>
        Update the details for this asset. Click save when you're done.
      </DialogDescription>
    </DialogHeader>
    
    <form on:submit|preventDefault={handleSubmit} class="space-y-6 py-4">
      <div class="grid grid-cols-1 gap-4">
        <div class="space-y-2">
          <Label for="asset_name">Asset Name</Label>
          <Input id="asset_name" bind:value={formData.asset_name} required />
        </div>
        
        <div class="space-y-2">
          <Label for="asset_description">Description</Label>
          <Textarea 
            id="asset_description" 
            bind:value={formData.asset_description} 
            placeholder="Provide a detailed description of this asset"
            rows={5}
          />
        </div>
        
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div class="space-y-2">
            <Label for="asset_ip">IP Address</Label>
            <Input id="asset_ip" bind:value={formData.asset_ip} placeholder="e.g. 192.168.1.1" />
          </div>
          
          <div class="space-y-2">
            <Label for="asset_domain">Domain</Label>
            <Input id="asset_domain" bind:value={formData.asset_domain} placeholder="e.g. example.com" />
          </div>
        </div>
        
        <div class="space-y-2">
          <Label for="analysis_status">Analysis Status</Label>
          <Select bind:value={formData.analysis_status_id}>
            <SelectTrigger>
              <SelectValue placeholder="Select status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={asset.analysis_status.id}>{asset.analysis_status.name}</SelectItem>
              <!-- You would typically fetch all possible statuses from your API -->
            </SelectContent>
          </Select>
        </div>
      </div>
      
      <DialogFooter>
        <Button type="button" variant="outline" on:click={() => (open = false)} disabled={loading}>
          <XIcon class="mr-2 h-4 w-4" />
          Cancel
        </Button>
        <Button type="submit" disabled={loading}>
          {#if loading}
            <Loader2Icon class="mr-2 h-4 w-4 animate-spin" />
            Saving...
          {:else}
            <CheckIcon class="mr-2 h-4 w-4" />
            Save Changes
          {/if}
        </Button>
      </DialogFooter>
    </form>
  </DialogContent>
</Dialog>