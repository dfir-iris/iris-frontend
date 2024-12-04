<script lang="ts">
  import { AlertOctagonIcon } from "lucide-svelte";
  import type { Snippet } from "svelte";

  interface AlertProps {
    children: Snippet;
  }

  const { children }: AlertProps = $props();
</script>

<div
  class="p-3 text-sm text-destructive dark:text-destructive-foreground items-center bg-destructive/10 dark:bg-destructive/50 rounded-md text-center flex flex-row gap-x-2"
>
  <AlertOctagonIcon size={22} />
  {@render children()}
</div>
