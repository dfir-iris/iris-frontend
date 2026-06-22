<script lang="ts">
  import { toasts } from '$lib/stores/toast.store';
  import { fly } from 'svelte/transition';
  import { CheckCircleIcon, XIcon, AlertTriangleIcon, InfoIcon } from 'lucide-svelte';
  import type { ToastVariant } from '$lib/stores/toast.store';

  function getIcon(variant: ToastVariant = 'default') {
    switch (variant) {
      case 'success': return CheckCircleIcon;
      case 'destructive': return AlertTriangleIcon;
      case 'warning': return AlertTriangleIcon;
      default: return InfoIcon;
    }
  }

  function getVariantClasses(variant: ToastVariant = 'default') {
    switch (variant) {
      case 'success': return 'bg-green-50 border-green-200 text-green-800';
      case 'destructive': return 'bg-red-50 border-red-200 text-red-800';
      case 'warning': return 'bg-yellow-50 border-yellow-200 text-yellow-800';
      default: return 'bg-white border-gray-200 text-gray-800';
    }
  }

  function getIconClasses(variant: ToastVariant = 'default') {
    switch (variant) {
      case 'success': return 'text-green-500';
      case 'destructive': return 'text-red-500';
      case 'warning': return 'text-yellow-500';
      default: return 'text-blue-500';
    }
  }
</script>

<div class="fixed bottom-0 left-0 p-4 w-full md:max-w-sm z-[100] flex flex-col gap-2">
  {#each $toasts as toast (toast.id)}
    <div
      class="rounded-lg border shadow-lg overflow-hidden {getVariantClasses(toast.variant)}"
      role="alert"
      in:fly={{ y: 50, duration: 300 }}
      out:fly={{ y: 50, duration: 200 }}
    >
      <div class="flex p-4">
        <div class="flex-shrink-0 {getIconClasses(toast.variant)}">
          <svelte:component this={getIcon(toast.variant)} class="h-5 w-5" />
        </div>
        <div class="ml-3 flex-1">
          <p class="text-sm font-medium">{toast.title}</p>
          {#if toast.description}
            <p class="mt-1 text-sm opacity-90">{toast.description}</p>
          {/if}
        </div>
        <div class="ml-4 flex-shrink-0 flex">
          <button
            type="button"
            class="inline-flex rounded-md text-gray-400 hover:text-gray-500 focus:outline-none"
            on:click={() => toasts.dismiss(toast.id)}
          >
            <span class="sr-only">Close</span>
            <XIcon class="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  {/each}
</div>