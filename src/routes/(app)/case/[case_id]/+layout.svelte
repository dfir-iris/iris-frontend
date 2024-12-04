<script lang="ts">
  import type { Snippet } from "svelte";
  import type { LayoutData } from "./$types";

  let { data, children }: { data: LayoutData; children: Snippet } = $props();
</script>

<div class="flex flex-row">
  <!-- Case sidebar -->
  <!-- TODO -->

  <!-- Case content -->
  <div>
    {@render children()}
  </div>
</div>
