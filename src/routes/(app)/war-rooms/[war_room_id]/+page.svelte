<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';

	// War rooms land on the Board: the one-glance status of every attached
	// case, with links into the other sections.
	onMount(() => {
		goto(`/war-rooms/${page.params.war_room_id}/board`, { replaceState: true });
	});
</script>

<div class="flex h-full items-center justify-center text-sm text-muted-foreground">Loading…</div>
