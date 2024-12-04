<script lang="ts">
  import { authUserStore } from "$lib/stores/auth.store";
  import "../app.css";
  import { ModeWatcher } from "mode-watcher";

  const { children, data } = $props();

  $effect.pre(() => {
    authUserStore.set(data.user);
    console.debug("UserInfo", data.user);
  });
</script>

<!-- Light/dark scheme monitor -->
<ModeWatcher />

<!-- Render subroutes -->
{@render children()}
