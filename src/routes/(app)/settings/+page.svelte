<script lang="ts">
	import { getContext } from 'svelte';
	import type { PageData } from './$types';
	import { goto } from '$app/navigation';
	import { USER_CTX, type UserCtx } from '$lib/contexts/user-context.context.svelte';
	import { visibleSettingsPages } from '$lib/components/navigation/settings-pages';

	let { data: _data }: { data: PageData } = $props();

	const userCtx = getContext<UserCtx>(USER_CTX);

	// `/settings` has no page of its own: open the first one the user
	// can see (Modules for an administrator). Permissions only exist
	// client-side once the user context has loaded, hence the effect.
	const first = $derived(
		userCtx.ready ? visibleSettingsPages(userCtx.can, userCtx.ctx)[0] : undefined
	);

	$effect(() => {
		if (first) void goto(`/settings${first.href}`, { replaceState: true });
	});
</script>

{#if userCtx.ready && !first}
	<p class="p-6 text-sm text-muted-foreground">You don't have access to any settings page.</p>
{/if}
