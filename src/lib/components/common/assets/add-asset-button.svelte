<script lang="ts">
  import { PlusIcon } from 'lucide-svelte';
  import { Button } from '$lib/components/ui/button';
  import AddAssetModal from '$lib/components/common/assets/add-asset-modal.svelte';

  let { class: className = '' }: { class?: string } = $props();
  let showModal = $state(false);
</script>

<Button onclick={() => showModal = true} class={className} variant="outline">
  <PlusIcon size={20} />
  Add Assets
</Button>

{#if showModal}
  <AddAssetModal bind:open={showModal} />
{/if}

