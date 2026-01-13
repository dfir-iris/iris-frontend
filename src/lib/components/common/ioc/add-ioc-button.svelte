<script lang="ts">
  import { PlusIcon } from 'lucide-svelte';
  import { Button } from '$lib/components/ui/button';
  import AddIocButton from '$lib/components/common/ioc/add-ioc-modal.svelte';

  let { class: className = '' }: { class?: string } = $props();
  let showModal = $state(false);
</script>

<Button onclick={() => showModal = true} class={className} variant="outline">
  <PlusIcon size={20} />
  Add IOC
</Button>

{#if showModal}
  <AddIocButton bind:open={showModal} />
{/if}

