<script lang="ts">
  import { authUserStore } from "$lib/stores/auth.store";
  import "../app.css";
  import { ModeWatcher, mode } from "mode-watcher";
  import { Toaster } from '$lib/components/ui/toast';
  import { handleSessionExpiration } from '$lib/utils/session-handler';


  const { children, data } = $props();

  $effect.pre(() => {
    // Set user state into store
    authUserStore.set(data.user);
    console.debug("UserInfo", data.user);

    // Set UI theme
    if ($mode == "dark") {
      document.body.classList.add("dark");
    } else {
      document.body.classList.remove("dark");
    }

    const handleSessionEvent = () => {
      handleSessionExpiration();
    };
    
    window.addEventListener('session-expired', handleSessionEvent);
    
    return () => {
      window.removeEventListener('session-expired', handleSessionEvent);
    };
  });
</script>

<!-- Light/dark scheme monitor -->
<ModeWatcher track={false} />

<Toaster />

<!-- Render subroutes -->
{@render children()}
