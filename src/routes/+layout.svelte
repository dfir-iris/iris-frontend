<script lang="ts">
  import { authUserStore } from "$lib/stores/auth.store";
  import "../app.css";
  import { ModeWatcher, mode } from "mode-watcher";
  import { Toaster } from '$lib/components/ui/toast';
  import { handleSessionExpiration } from '$lib/utils/session-handler';
  import { DEV } from 'esm-env';
  import { browser } from '$app/environment';
  import '../app.postcss';
  import { onMount } from 'svelte';
  import { auth } from '$lib/stores/auth.store';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';

  const { children, data } = $props();

  // Lazy-load the debug panel in development mode
  let DebugPanel: any = null;
  if (DEV && browser) {
    import('$lib/components/debug/debug-panel.svelte').then(module => {
      DebugPanel = module.default;
    });
  }

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

  // Flag to prevent redirect loops
  let initialCheckDone = false;

  onMount(() => {
    if (browser && !initialCheckDone) {
      initialCheckDone = true;

      const currentPath = $page.url.pathname;
      console.log('Current path:', currentPath, 'Auth state:', $auth.isAuthenticated);

      // If we're at the login page and already authenticated, go to dashboard
      if (currentPath === '/login' && $auth.isAuthenticated) {
        const redirectTo = $page.url.searchParams.get('redirect') || '/';
        console.log('Already authenticated on login page, redirecting to:', redirectTo);
        goto(redirectTo);
      }

      // If we're at a protected route but not authenticated, go to login
      const isProtectedRoute = !currentPath.startsWith('/login') ||
                              !currentPath.startsWith('/logout');

      if (isProtectedRoute && !$auth.isAuthenticated && currentPath != '/login') {
        console.log('Not authenticated on protected route, redirecting to login');
        goto(`/login?redirect=${encodeURIComponent(currentPath)}`);
      }
    }
  });
</script>

<svelte:head>
  <!-- Add CSP Meta Tag for browser-side enforcement -->
</svelte:head>

<!-- Light/dark scheme monitor -->
<ModeWatcher track={false} />

<Toaster />

<div class="min-h-screen flex flex-col">
  <!-- Render subroutes -->
  {@render children()}
</div>

{#if DEV && browser && DebugPanel}
  <svelte:component this={DebugPanel} />
{/if}
