<script lang="ts">
    import '../app.css';
    import { page } from '$app/stores';
    import { auth } from '$lib/stores/auth.store';
    import DashboardLayout from '$lib/layouts/dashboard-layout.svelte';
	import { ModeWatcher } from "mode-watcher";
    
    $: isAuthPath = $page.url.pathname.startsWith('/login') || 
                    $page.url.pathname.startsWith('/register');
</script>

{#if isAuthPath}
    <slot />
{:else}
	<ModeWatcher />
    <DashboardLayout>
        <slot />
    </DashboardLayout>
{/if}