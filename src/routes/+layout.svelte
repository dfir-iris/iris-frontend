<script lang="ts">
  import "../app.css";
  import { ModeWatcher } from "mode-watcher";

  const { children } = $props();
</script>

<!-- Light/dark scheme monitor -->
<ModeWatcher />

<!-- Render subroutes -->
{@render children()}
