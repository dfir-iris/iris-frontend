<script lang="ts">
  import * as Dialog from '$lib/components/ui/dialog';
  import { cn } from '$lib/utils';
  
  let className = '';
  export { className as class };
</script>

<Dialog.Title class={cn("text-lg font-semibold leading-none tracking-tight", className)} {...$$restProps}>
  <slot />
</Dialog.Title>
