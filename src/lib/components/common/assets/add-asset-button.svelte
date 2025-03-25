<script lang="ts">
  import { PlusIcon } from 'lucide-svelte';
  import { Button } from '$lib/components/ui/button';
  import AddAssetModal from '$lib/components/common/assets/add-asset-modal.svelte';

  let showModal = $state(false);
</script>

<Button onclick={() => showModal = true} class="flex items-center gap-2">
  <PlusIcon size={20} />
  Add Asset
</Button>

<AddAssetModal bind:open={showModal} />

