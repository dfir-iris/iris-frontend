<script lang="ts">
  import type { Snippet } from "svelte";
  import type { LayoutData } from "./$types";
  import DashboardLayout from "$lib/layouts/dashboard-layout.svelte";

  let { data, children }: { data: LayoutData; children: Snippet } = $props();
</script>

<DashboardLayout>
  {@render children()}
</DashboardLayout>
